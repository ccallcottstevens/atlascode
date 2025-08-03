import * as fs from 'fs';
import path from 'path';
import { gte as semver_gte } from 'semver';
import { setTimeout } from 'timers/promises';
import { v4 } from 'uuid';
import {
    CancellationToken,
    commands,
    Disposable,
    Event,
    Memento,
    Position,
    Range,
    TextEditor,
    Uri,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    window,
    workspace,
} from 'vscode';

import {
    rovoDevDetailsExpandedEvent,
    RovoDevEnv,
    rovoDevFileChangedActionEvent,
    rovoDevFilesSummaryShownEvent,
    rovoDevGitPushActionEvent,
    rovoDevNewSessionActionEvent,
    rovoDevPromptSentEvent,
    rovoDevStopActionEvent,
    rovoDevTechnicalPlanningShownEvent,
} from '../../src/analytics';
import { Container } from '../../src/container';
import { Logger } from '../../src/logger';
import { rovodevInfo } from '../constants';
import {
    ModifiedFile,
    RovoDevViewResponse,
    RovoDevViewResponseType,
} from '../react/atlascode/rovo-dev/rovoDevViewMessages';
import { GitErrorCodes } from '../typings/git';
import { getHtmlForView } from '../webview/common/getHtmlForView';
import { PerformanceLogger } from './performanceLogger';
import { RovoDevResponse, RovoDevResponseParser } from './responseParser';
import { RovoDevApiClient, RovoDevHealthcheckResponse } from './rovoDevApiClient';
import { RovoDevPullRequestHandler } from './rovoDevPullRequestHandler';
import { RovoDevContext, RovoDevContextItem, RovoDevPrompt, TechnicalPlan } from './rovoDevTypes';
import { RovoDevProviderMessage, RovoDevProviderMessageType } from './rovoDevWebviewProviderMessages';

type ParametersSkip2<T extends (...args: any) => any> =
    // eslint-disable-next-line no-unused-vars
    Parameters<T> extends [infer _1, infer _2, ...infer Rest] ? Rest : never;

type TelemetryFunction = keyof typeof rovoDevTelemetryEvents;

type TelemetryRecord<T> = {
    [x in TelemetryFunction]?: T;
};

const MIN_SUPPORTED_ROVODEV_VERSION = '0.9.3';

interface TypedWebview<MessageOut, MessageIn> extends Webview {
    readonly onDidReceiveMessage: Event<MessageIn>;
    postMessage(message: MessageOut): Thenable<boolean>;
}

const rovoDevTelemetryEvents = {
    rovoDevFileChangedActionEvent,
    rovoDevFilesSummaryShownEvent,
    rovoDevGitPushActionEvent,
    rovoDevNewSessionActionEvent,
    rovoDevPromptSentEvent,
    rovoDevStopActionEvent,
    rovoDevTechnicalPlanningShownEvent,
    rovoDevDetailsExpandedEvent,
};

export class RovoDevWebviewProvider extends Disposable implements WebviewViewProvider {
    private readonly viewType = 'atlascodeRovoDev';
    private readonly isBBY = process.env.ROVODEV_BBY;

    private _prHandler = new RovoDevPullRequestHandler();
    private _perfLogger = new PerformanceLogger();
    private _webView?: TypedWebview<RovoDevProviderMessage, RovoDevViewResponse>;
    private _rovoDevApiClient?: RovoDevApiClient;
    private _initialized = false;

    private _chatSessionId: string = '';
    private _currentPromptId: string = '';
    private _currentPrompt: RovoDevPrompt | undefined;
    private _pendingPrompt: RovoDevPrompt | undefined;
    private _pendingCancellation = false;

    private _firedTelemetryForCurrentPrompt: TelemetryRecord<boolean> = {};

    // we keep the data in this collection so we can attach some metadata to the next
    // prompt informing Rovo Dev that those files has been reverted
    private _revertedChanges: string[] = [];

    private _disposables: Disposable[] = [];

    // Session ID to filter responses from the currently active server
    private _activeServerSessionId: string = '';

    private _globalState: Memento;
    private _extensionPath: string;
    private _extensionUri: Uri;

    private get rovoDevApiClient() {
        if (!this._rovoDevApiClient) {
            const rovoDevPort = this.getActiveRovoDevPort();
            const rovoDevHost = process.env[rovodevInfo.envVars.host] || 'localhost';
            if (rovoDevPort) {
                this._rovoDevApiClient = new RovoDevApiClient(rovoDevHost, rovoDevPort);
            }
        }

        return this._rovoDevApiClient;
    }

    // Force recreation of API client when server changes
    public switchToServer(port: number, isNewSession: boolean = true) {
        // Generate new session ID for the active server only if this is truly a new session
        if (isNewSession) {
            this._activeServerSessionId = v4();
        }

        // Reset UI state to allow new input
        this._pendingCancellation = false;
        this._currentPrompt = undefined;
        this._pendingPrompt = undefined;

        this.postMessage({
            type: RovoDevProviderMessageType.ServerSwitched,
            port: port,
        });
        this._rovoDevApiClient = undefined; // Clear cached client
        const rovoDevHost = process.env[rovodevInfo.envVars.host] || 'localhost';
        this._rovoDevApiClient = new RovoDevApiClient(rovoDevHost, port);

        // Send server switched message to clear chat

        // wait for Rovo Dev to be ready, for up to 10 seconds
        this.waitFor(() => this.executeHealthcheck(), 10000, 500)
            .then(async (result) => {
                if (result) {
                    Logger.debug(`RovoDev server at port ${port} is ready, initializing session...`);

                    // Only begin new session if this is actually a new session
                    // For existing sessions with history, we want to preserve the session ID
                    if (isNewSession) {
                        this.beginNewSession();
                    }

                    try {
                        // Execute replay to restore chat history
                        await this.executeReplay();
                        Logger.debug(`Successfully replayed chat history for port ${port}`);
                    } catch (error) {
                        Logger.error(error as Error, `Failed to replay chat history for port ${port}`);
                        // Continue without failing completely
                    }
                } else {
                    const errorMsg = this._rovoDevApiClient
                        ? `Unable to initialize RovoDev at "${this._rovoDevApiClient.baseApiUrl}". Service wasn't ready within 10s`
                        : `Unable to initialize RovoDev's client within 10s`;

                    Logger.error(new Error(errorMsg), 'Server switch failed');
                    window.showErrorMessage(`Failed to switch to session: ${errorMsg}`);
                }

                this._initialized = true;
                // re-send the buffered prompt
                if (this._pendingPrompt) {
                    this.executeChat(this._pendingPrompt, true);
                    this._pendingPrompt = undefined;
                }
            })
            .catch((error) => {
                this.processError(error, false);
            })
            .finally(() => {
                this._initialized = true;

                this._webView?.postMessage({
                    type: RovoDevProviderMessageType.Initialized,
                });
            });
    }

    private postMessage(message: RovoDevProviderMessage): Thenable<boolean> | undefined {
        return this._webView?.postMessage(message);
    }

    private getActiveRovoDevPort(): number | undefined {
        // Check if there's a selected server from ShipIt
        const selectedPort = Container.context.globalState.get<number>('selectedRovoDevPort');
        if (selectedPort) {
            return selectedPort;
        }

        // Initialize with main workspace as default if no selection exists
        const workspacePort = this.getWorkspacePort();
        if (workspacePort) {
            this.initializeDefaultSelection(workspacePort);
            return workspacePort;
        }

        return undefined;
    }

    private initializeDefaultSelection(port: number) {
        // Set main workspace as default selection
        const workspaceFolders = workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const mainWorkspacePath = workspaceFolders[0].uri.fsPath;
            Container.context.globalState.update('selectedRovoDevPort', port);
            Container.context.globalState.update('selectedRovoDevPath', mainWorkspacePath);
        }
    }

    constructor(extensionPath: string, globalState: Memento) {
        super(() => {
            this._dispose();
        });

        this._extensionPath = extensionPath;
        this._extensionUri = Uri.file(this._extensionPath);
        this._globalState = globalState;

        // Initialize with a session ID for the initial server
        this._activeServerSessionId = v4();

        // Register the webview view provider
        this._disposables.push(
            window.registerWebviewViewProvider('atlascode.views.rovoDev.webView', this, {
                webviewOptions: { retainContextWhenHidden: true },
            }),
        );

        // Register editor listeners
        this._registerEditorListeners();
    }

    private getWorkspacePort(): number | undefined {
        const workspaceFolders = workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }

        const globalPort = process.env[rovodevInfo.envVars.port];
        if (globalPort) {
            return parseInt(globalPort);
        }

        const wsPath = workspaceFolders[0].uri.fsPath;
        const mapping = this._globalState.get<{ [key: string]: number }>(rovodevInfo.mappingKey);
        if (mapping && mapping[wsPath]) {
            return mapping[wsPath];
        }

        return undefined;
    }

    public resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext,
        _token: CancellationToken,
    ): Thenable<void> | void {
        this._webView = webviewView.webview;
        const webview = this._webView;

        webview.options = {
            enableCommandUris: true,
            enableScripts: true,
            localResourceRoots: [
                Uri.file(path.join(this._extensionPath, 'build')),
                Uri.file(path.join(this._extensionPath, 'node_modules', '@vscode', 'codicons', 'dist')),
            ],
        };

        const codiconsUri = webview.asWebviewUri(
            Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
        );

        webview.html = getHtmlForView(
            this._extensionPath,
            webview.asWebviewUri(this._extensionUri),
            webview.cspSource,
            this.viewType,
            codiconsUri,
        );

        webview.onDidReceiveMessage(async (e) => {
            try {
                switch (e.type) {
                    case RovoDevViewResponseType.Prompt:
                        this._pendingCancellation = false;
                        await this.executeChat(e);
                        break;

                    case RovoDevViewResponseType.CancelResponse:
                        // we set _pendingCancellation to true first, and update it
                        // later if the API fails, because we don't want to risk a race
                        // condition where the chat socket closes before the result of the
                        // cancel API has been evaluated
                        this._pendingCancellation = true;
                        if (!(await this.executeCancel())) {
                            this._pendingCancellation = false;
                        }
                        break;

                    case RovoDevViewResponseType.OpenFile:
                        await this.executeOpenFile(e.filePath, e.tryShowDiff, e.range);
                        break;

                    case RovoDevViewResponseType.UndoFileChanges:
                        await this.executeUndoFiles(e.files);
                        break;

                    case RovoDevViewResponseType.KeepFileChanges:
                        await this.executeKeepFiles(e.files);
                        break;

                    case RovoDevViewResponseType.GetOriginalText:
                        const text = await this.executeGetText(e.filePath, e.range);
                        await webviewView.webview.postMessage({
                            type: RovoDevProviderMessageType.ReturnText,
                            text: text || '',
                            nonce: e.requestId, // Use the requestId as nonce
                        });
                        break;

                    case RovoDevViewResponseType.CreatePR:
                        await this.createPR(e.payload.commitMessage, e.payload.branchName);
                        break;

                    case RovoDevViewResponseType.RetryPromptAfterError:
                        this._pendingCancellation = false;
                        await this.executeRetryPromptAfterError();
                        break;

                    case RovoDevViewResponseType.GetCurrentBranchName:
                        await this.getCurrentBranchName();
                        break;

                    case RovoDevViewResponseType.ForceUserFocusUpdate:
                        await this.forceUserFocusUpdate();
                        break;

                    case RovoDevViewResponseType.AddContext:
                        await this.executeAddContext(e.currentContext);
                        break;

                    case RovoDevViewResponseType.ReportChangedFilesPanelShown:
                        this.fireTelemetryEvent('rovoDevFilesSummaryShownEvent', this._currentPromptId, e.filesCount);
                        break;

                    case RovoDevViewResponseType.ReportChangesGitPushed:
                        this.fireTelemetryEvent(
                            'rovoDevGitPushActionEvent',
                            this._currentPromptId,
                            e.pullRequestCreated,
                        );
                        break;

                    case RovoDevViewResponseType.CheckGitChanges:
                        await this._prHandler.isGitStateClean().then((isClean) => {
                            this._webView?.postMessage({
                                type: RovoDevProviderMessageType.CheckGitChangesComplete,
                                hasChanges: !isClean,
                            });
                        });
                        break;

                    case RovoDevViewResponseType.ReportThinkingDrawerExpanded:
                        this.fireTelemetryEvent('rovoDevDetailsExpandedEvent', this._currentPromptId);
                        break;

                    case RovoDevViewResponseType.NewSession:
                        if (e.sessionName) {
                            this.createNewBackgroundSession(e.sessionName, e.prompt);
                        }
                        break;

                    case RovoDevViewResponseType.CreateBackgroundSession:
                        this.createBackgroundSessionWithShipit(e.sessionName, e.prompt, e.context);
                        break;

                    case RovoDevViewResponseType.ListBackgroundSessions:
                        this.listBackgroundSessionsForDropdown();
                        break;

                    case RovoDevViewResponseType.SelectBackgroundSession:
                        this.selectBackgroundSession(e.sessionId);
                        break;

                    case RovoDevViewResponseType.DeleteBackgroundSession:
                        this.deleteBackgroundSession(e.sessionId);
                        break;
                }
            } catch (error) {
                this.processError(error, false);
            }
        });

        // wait for Rovo Dev to be ready, for up to 10 seconds
        this.waitFor(() => this.executeHealthcheck(), 100000, 500)
            .then(async (result) => {
                if (result) {
                    const version = ((await this.executeHealthcheckInfo()) ?? {}).version;
                    if (version && semver_gte(version, MIN_SUPPORTED_ROVODEV_VERSION)) {
                        this.beginNewSession();
                        if (this.isBBY) {
                            // TODO: we should obtain the session id from the boysenberry environment
                            await this.executeReplay();
                        }
                    } else {
                        throw new Error(
                            `Rovo Dev version (${version}) is out of date. Please update Rovo Dev and try again.\nMin version compatible: ${MIN_SUPPORTED_ROVODEV_VERSION}`,
                        );
                    }
                } else {
                    const errorMsg = this._rovoDevApiClient
                        ? `Unable to initialize RovoDev at "${this._rovoDevApiClient.baseApiUrl}". Service wasn't ready within 10000ms`
                        : `Unable to initialize RovoDev's client within 10000ms`;

                    throw new Error(errorMsg);
                }

                this._initialized = true;
                // re-send the buffered prompt
                if (this._pendingPrompt) {
                    this.executeChat(this._pendingPrompt, true);
                    this._pendingPrompt = undefined;
                }
            })
            .catch((error) => {
                this.processError(error, false);
            })
            .finally(() => {
                this._initialized = true;

                webviewView.webview.postMessage({
                    type: RovoDevProviderMessageType.Initialized,
                });
            });
    }

    private beginNewSession(): void {
        this._chatSessionId = v4();
        this._perfLogger.sessionStarted(this._chatSessionId);
        this.fireTelemetryEvent('rovoDevNewSessionActionEvent', true);
    }

    private beginNewPrompt(overrideId?: string): void {
        this._currentPromptId = overrideId || v4();
        this._firedTelemetryForCurrentPrompt = {};
    }

    // This function esures that the same telemetry event is not sent twice for the same prompt
    private fireTelemetryEvent<T extends TelemetryFunction>(
        funcName: T,
        ...params: ParametersSkip2<(typeof rovoDevTelemetryEvents)[T]>
    ): void {
        if (!this._chatSessionId) {
            throw new Error('Unable to send Rovo Dev telemetry: ChatSessionId not initialized');
        }
        // rovoDevNewSessionActionEvent is the only event that doesn't need the promptId
        if (funcName !== 'rovoDevNewSessionActionEvent' && !this._currentPromptId) {
            throw new Error('Unable to send Rovo Dev telemetry: PromptId not initialized');
        }

        // the following events can be fired multiple times during the same prompt
        delete this._firedTelemetryForCurrentPrompt['rovoDevFileChangedActionEvent'];

        if (!this._firedTelemetryForCurrentPrompt[funcName]) {
            this._firedTelemetryForCurrentPrompt[funcName] = true;

            // add `rovoDevEnv` and `sessionId` as the first two arguments
            const rovoDevEnv: RovoDevEnv = this.isBBY ? 'Boysenberry' : 'IDE';
            params.unshift(rovoDevEnv, this._chatSessionId);

            const ret: ReturnType<(typeof rovoDevTelemetryEvents)[T]> = rovoDevTelemetryEvents[funcName].apply(
                undefined,
                params,
            );
            ret.then((evt) => Container.analyticsClient.sendTrackEvent(evt));

            Logger.debug(`Event fired: ${funcName}(${params})`);
        }
    }

    // Helper to get openFile info from a document
    private getOpenFileInfo = (doc: { uri: Uri; fileName: string }) => {
        const workspaceFolder = workspace.getWorkspaceFolder(doc.uri);
        const baseName = doc.fileName.split(path.sep).pop() || '';
        return {
            name: baseName,
            absolutePath: doc.uri.fsPath,
            relativePath: workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, doc.uri.fsPath) : doc.fileName,
        };
    };

    private async forceUserFocusUpdate(editor: TextEditor | undefined = window.activeTextEditor, selection?: Range) {
        if (!this._webView) {
            return;
        }

        selection = selection || (editor ? editor.selection : undefined);

        if (!editor) {
            await this._webView.postMessage({
                type: RovoDevProviderMessageType.UserFocusUpdated,
                userFocus: {
                    file: { name: '', absolutePath: '', relativePath: '' },
                    selection: undefined,
                    invalid: true,
                },
            });
            return;
        }

        const fileInfo = this.getOpenFileInfo(editor.document);

        await this._webView.postMessage({
            type: RovoDevProviderMessageType.UserFocusUpdated,
            userFocus: {
                file: fileInfo,
                selection:
                    selection && !selection.isEmpty
                        ? { start: selection.start.line, end: selection.end.line }
                        : undefined,
                invalid: fileInfo.absolutePath === '' || !fs.existsSync(fileInfo.absolutePath),
            },
        });
    }

    // Listen to active editor and selection changes
    private _registerEditorListeners() {
        // Listen for active editor changes
        this._disposables.push(
            window.onDidChangeActiveTextEditor((editor) => {
                this.forceUserFocusUpdate(editor);
            }),
        );
        // Listen for selection changes
        this._disposables.push(
            window.onDidChangeTextEditorSelection((event) => {
                this.forceUserFocusUpdate(event.textEditor);
            }),
        );
    }

    private async processChatResponse(
        sourceApi: 'chat' | 'replay',
        fetchOp: Promise<Response> | Response,
        sessionId?: string,
    ) {
        const fireTelemetry = sourceApi === 'chat';
        const response = await fetchOp;
        if (!response.body) {
            throw new Error("Error processing the Rovo Dev's response: response is empty.");
        }

        if (fireTelemetry) {
            this._perfLogger.promptStarted(this._currentPromptId);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new RovoDevResponseParser();

        let isFirstByte = true;
        let isFirstMessage = true;

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (fireTelemetry && isFirstByte) {
                    this._perfLogger.promptFirstByteReceived(this._currentPromptId);
                    isFirstByte = false;
                }

                if (done) {
                    // last response of the stream -> fire performance telemetry event
                    if (fireTelemetry) {
                        this._perfLogger.promptLastMessageReceived(this._currentPromptId);
                    }

                    for (const msg of parser.flush()) {
                        // Only process responses from the currently active server session
                        if (sessionId && sessionId !== this._activeServerSessionId) {
                            continue; // Skip responses from inactive servers
                        }
                        await this.processRovoDevResponse(sourceApi, msg);
                    }
                    break;
                }

                const data = decoder.decode(value, { stream: true });
                for (const msg of parser.parse(data)) {
                    // Only process responses from the currently active server session
                    if (sessionId && sessionId !== this._activeServerSessionId) {
                        continue; // Skip responses from inactive servers
                    }

                    if (fireTelemetry && isFirstMessage) {
                        this._perfLogger.promptFirstMessageReceived(this._currentPromptId);
                        isFirstMessage = false;
                    }

                    await this.processRovoDevResponse(sourceApi, msg);
                }
            }

            // Send final complete message when stream ends
            if (sessionId && sessionId === this._activeServerSessionId) {
                await this.completeChatResponse(sourceApi);
            }
        } catch (error) {
            // Re-throw errors
            throw error;
        } finally {
            // Clean up the reader
            try {
                reader.releaseLock();
            } catch {
                // Ignore errors when releasing lock
            }
        }
    }

    private completeChatResponse(sourceApi: 'replay' | 'chat' | 'error') {
        const webview = this._webView!;
        return webview.postMessage({
            type: RovoDevProviderMessageType.CompleteMessage,
            isReplay: sourceApi === 'replay',
        });
    }

    private processError(error: Error & { gitErrorCode?: GitErrorCodes }, isRetriable: boolean) {
        Logger.error('RovoDev', error);

        const webview = this._webView!;
        return webview.postMessage({
            type: RovoDevProviderMessageType.ErrorMessage,
            message: {
                text: `Error: ${error.message}${error.gitErrorCode ? `\n ${error.gitErrorCode}` : ''}`,
                source: 'RovoDevError',
                isRetriable,
                uid: v4(),
            },
        });
    }

    private async sendUserPromptToView({ text, enable_deep_plan, context }: RovoDevPrompt) {
        const webview = this._webView!;

        await webview.postMessage({
            type: RovoDevProviderMessageType.UserChatMessage,
            message: {
                text: text,
                source: 'User',
                context: context,
            },
        });

        return await webview.postMessage({
            type: RovoDevProviderMessageType.PromptSent,
            text,
            enable_deep_plan,
            context: context,
        });
    }

    private processRovoDevResponse(sourceApi: 'chat' | 'replay', response: RovoDevResponse): Thenable<boolean> {
        const fireTelemetry = sourceApi === 'chat';
        const webview = this._webView!;
        setTimeout(50); // Yield to allow UI updates
        switch (response.event_kind) {
            case 'text':
                return webview.postMessage({
                    type: RovoDevProviderMessageType.Response,
                    dataObject: response,
                });

            case 'tool-call':
                return webview.postMessage({
                    type: RovoDevProviderMessageType.ToolCall,
                    dataObject: response,
                });

            case 'tool-return':
                if (fireTelemetry && response.tool_name === 'create_technical_plan' && response.parsedContent) {
                    this._perfLogger.promptTechnicalPlanReceived(this._currentPromptId);

                    const parsedContent = response.parsedContent as TechnicalPlan;
                    const stepsCount = parsedContent.logicalChanges.length;
                    const filesCount = parsedContent.logicalChanges.reduce((p, c) => p + c.filesToChange.length, 0);
                    const questionsCount = parsedContent.logicalChanges.reduce(
                        (p, c) => p + c.filesToChange.reduce((p2, c2) => p2 + (c2.clarifyingQuestionIfAny ? 1 : 0), 0),
                        0,
                    );

                    this.fireTelemetryEvent(
                        'rovoDevTechnicalPlanningShownEvent',
                        this._currentPromptId,
                        stepsCount,
                        filesCount,
                        questionsCount,
                    );
                }
                return webview.postMessage({
                    type: RovoDevProviderMessageType.ToolReturn,
                    dataObject: response,
                });

            case 'retry-prompt':
                return webview.postMessage({
                    type: RovoDevProviderMessageType.ToolReturn,
                    dataObject: response,
                });

            case 'user-prompt':
                // receiving a user-prompt pre-initialized means we are in the 'replay' response
                if (!this._initialized) {
                    this._currentPrompt = {
                        text: response.content,
                        // TODO: content is not restored here at the moment, so we'll just render all prompts as they were submitted
                    };
                    return this.sendUserPromptToView({ text: response.content });
                }
                return Promise.resolve(false);

            default:
                return Promise.resolve(false);
        }
    }

    private addContextToPrompt(message: string, context?: RovoDevContext): string {
        if (!context) {
            return message;
        }

        let extra = '';
        if (context.focusInfo && context.focusInfo.enabled && !context.focusInfo.invalid) {
            extra += `
            <context>
                Consider that the user has the following open in the editor:
                    <name>${context.focusInfo.file.name}</name>
                        <absolute_path>${context.focusInfo.file.absolutePath}</absolute_path>
                        <relative_path>${context.focusInfo.file.relativePath}</relative_path>
                        ${
                            context.focusInfo.selection
                                ? `<lines>${context.focusInfo.selection.start}-${context.focusInfo.selection.end}</lines>`
                                : ''
                        }
                        Please avoid excessively repeating the context in the response.
                </context>`;
        }

        if (context.contextItems && context.contextItems.length > 0) {
            extra += `
                <context>
                    The user has the following additional context items:
                    ${context.contextItems
                        .map(
                            (item) => `
                        <item>
                            <name>${item.file.name}</name>
                            <absolute_path>${item.file.absolutePath}</absolute_path>
                            <relative_path>${item.file.relativePath}</relative_path>
                            ${item.selection ? `<lines>${item.selection.start}-${item.selection.end}</lines>` : ''}
                        </item>`,
                        )
                        .join('\n')}
                </context>`;
        }

        // Trim excessive whitespace:
        extra = extra.replace(/\s+/g, ' ').trim();
        return `${message}\n${extra}`.trim();
    }

    private addUndoContextToPrompt(message: string): string {
        if (this._revertedChanges.length) {
            const files = this._revertedChanges.join('\n');
            this._revertedChanges = [];
            return `<context>
    The following files have been reverted:
    ${files}
</context>
            
${message}`;
        } else {
            return message;
        }
    }

    private addRetryAfterErrorContextToPrompt(message: string): string {
        return `<context>The previous response interrupted prematurely because of an error. Continue processing the previous prompt from the point where it was interrupted.
    <previous_prompt>${message}</previous_prompt>
</context>`;
    }

    private async executeChat({ text, enable_deep_plan, context }: RovoDevPrompt, suppressEcho?: boolean) {
        if (!text) {
            return;
        }

        if (!suppressEcho) {
            await this.sendUserPromptToView({ text, enable_deep_plan, context });
        }

        this.beginNewPrompt();

        this._currentPrompt = {
            text,
            enable_deep_plan,
            context,
        };

        let payloadToSend = this.addUndoContextToPrompt(text);
        payloadToSend = this.addContextToPrompt(payloadToSend, context);

        const currentPrompt = this._currentPrompt;

        // Use current active session ID to filter responses
        const currentSessionId = this._activeServerSessionId;

        const fetchOp = async (client: RovoDevApiClient) => {
            const response = await client.chat(payloadToSend, enable_deep_plan);

            this.fireTelemetryEvent('rovoDevPromptSentEvent', this._currentPromptId, !!currentPrompt.enable_deep_plan);

            return this.processChatResponse('chat', response, currentSessionId);
        };

        if (this._initialized) {
            await this.executeApiWithErrorHandling(fetchOp, true);
        } else {
            this._pendingPrompt = {
                text: payloadToSend,
                enable_deep_plan,
                context,
            };
        }
    }

    private async executeRetryPromptAfterError() {
        const webview = this._webView!;

        if (!this._initialized || !this._currentPrompt) {
            return;
        }

        this.beginNewPrompt();

        const currentPrompt = this._currentPrompt;
        const payloadToSend = this.addRetryAfterErrorContextToPrompt(currentPrompt.text);

        // we need to echo back the prompt to the View since it's not user submitted
        await webview.postMessage({
            type: RovoDevProviderMessageType.PromptSent,
            text: payloadToSend,
            enable_deep_plan: currentPrompt.enable_deep_plan,
            context: currentPrompt.context,
        });

        // Use current active session ID to filter responses
        const currentSessionId = this._activeServerSessionId;

        const fetchOp = async (client: RovoDevApiClient) => {
            const response = await client.chat(payloadToSend, currentPrompt.enable_deep_plan);

            this.fireTelemetryEvent('rovoDevPromptSentEvent', this._currentPromptId, !!currentPrompt.enable_deep_plan);

            return this.processChatResponse('chat', response, currentSessionId);
        };

        await this.executeApiWithErrorHandling(fetchOp, true);
    }

    public async addContextItem(contextItem: RovoDevContextItem): Promise<void> {
        const webview = this._webView!;
        await webview.postMessage({
            type: RovoDevProviderMessageType.ContextAdded,
            context: contextItem,
        });
    }

    public async selectContextItem(): Promise<RovoDevContextItem | undefined> {
        // Get all workspace files
        const files = await workspace.findFiles('**/*', '**/node_modules/**');
        if (!files.length) {
            window.showWarningMessage('No files found in workspace.');
            return;
        }

        // Show QuickPick to select a file
        const items = files.map((uri) => {
            const workspaceFolder = workspace.getWorkspaceFolder(uri);
            const absolutePath = uri.fsPath;
            const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath) : uri.fsPath;
            const name = path.basename(uri.fsPath);
            return {
                label: name,
                description: relativePath,
                uri,
                absolutePath,
                relativePath,
                name,
            };
        });

        const picked = await window.showQuickPick(items, {
            placeHolder: 'Select a file to add as context',
        });

        if (!picked) {
            return;
        }

        return {
            file: {
                name: picked.name,
                absolutePath: picked.absolutePath,
                relativePath: picked.relativePath,
            },
            selection: undefined,
        };
    }

    async executeAddContext(currentContext?: RovoDevContext): Promise<void> {
        // Get all workspace files
        const picked = await this.selectContextItem();
        if (!picked) {
            return;
        }

        // Do nothing if the new item is already present in the context
        if (
            currentContext?.focusInfo?.file.absolutePath === picked.file.absolutePath ||
            currentContext?.contextItems?.some((item) => item.file.absolutePath === picked.file.absolutePath)
        ) {
            return;
        }

        return await this.addContextItem(picked);
    }

    async executeReset(): Promise<void> {
        const webview = this._webView!;
        const success = await this.executeApiWithErrorHandling(async (client) => {
            await client.reset();

            this._revertedChanges = [];

            await webview.postMessage({
                type: RovoDevProviderMessageType.NewSession,
            });

            return true;
        }, false);

        if (success) {
            this._chatSessionId = v4();
            this._perfLogger.sessionStarted(this._chatSessionId);
            this.fireTelemetryEvent('rovoDevNewSessionActionEvent', true);
        }
    }

    private async executeCancel(): Promise<boolean> {
        const webview = this._webView!;

        const cancelResponse = await this.executeApiWithErrorHandling(async (client) => {
            return await client.cancel();
        }, false);

        const success =
            !!cancelResponse && (cancelResponse.cancelled || cancelResponse.message === 'No chat in progress');

        if (success) {
            this.fireTelemetryEvent('rovoDevStopActionEvent', this._currentPromptId);
            return true;
        } else {
            this.fireTelemetryEvent('rovoDevStopActionEvent', this._currentPromptId, true);
            await webview.postMessage({
                type: RovoDevProviderMessageType.CancelFailed,
            });
            return false;
        }
    }

    private async executeReplay(): Promise<void> {
        this.beginNewPrompt('replay');

        // Use current active session ID for replay
        const currentSessionId = this._activeServerSessionId;

        await this.executeApiWithErrorHandling(async (client) => {
            return this.processChatResponse('replay', client.replay(), currentSessionId);
        }, false);
    }

    private async executeHealthcheck(): Promise<boolean> {
        return (await this.rovoDevApiClient?.healthcheck()) || false;
    }

    private async executeHealthcheckInfo(): Promise<RovoDevHealthcheckResponse | undefined> {
        try {
            return await this.rovoDevApiClient?.healtcheckInfo();
        } catch {
            return undefined;
        }
    }

    private makeRelativePathAbsolute(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            // If already absolute, use as-is
            return filePath;
        } else {
            // If relative, resolve against workspace root
            const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                throw new Error('No workspace folder found');
            }
            return path.join(workspaceRoot, filePath);
        }
    }

    private async executeOpenFile(filePath: string, tryShowDiff: boolean, _range?: number[]): Promise<void> {
        let cachedFilePath: string | undefined = undefined;

        if (tryShowDiff) {
            try {
                cachedFilePath = await this.rovoDevApiClient?.getCacheFilePath(filePath);
            } catch (error) {
                // Ignore 404 errors when switching servers - cache files from old server won't exist on new server
                if (error.httpStatus !== 404) {
                    console.warn(`Failed to get cache file path for ${filePath}:`, error);
                }
            }
        }

        // Get workspace root and resolve the file path
        const resolvedPath = this.makeRelativePathAbsolute(filePath);

        if (cachedFilePath && fs.existsSync(cachedFilePath)) {
            commands.executeCommand(
                'vscode.diff',
                Uri.file(cachedFilePath),
                Uri.file(resolvedPath),
                `${filePath} (Rovo Dev)`,
            );
        } else {
            let range: Range | undefined;
            if (_range && Array.isArray(_range)) {
                const startPosition = new Position(_range[0], 0);
                const endPosition = new Position(_range[1], 0);
                range = new Range(startPosition, endPosition);
            }

            const fileUri = Uri.file(resolvedPath);

            await window.showTextDocument(fileUri, {
                preview: true,
                selection: range || undefined,
            });
        }
    }

    private async executeUndoFiles(files: ModifiedFile[]) {
        const promises = files.map(async (file) => {
            const resolvedPath = this.makeRelativePathAbsolute(file.filePath);
            await this.getPromise((callback) => fs.rm(resolvedPath, { force: true }, callback));

            if (file.type !== 'create') {
                const cachedFilePath = await this.rovoDevApiClient!.getCacheFilePath(file.filePath);
                await this.getPromise((callback) => fs.copyFile(cachedFilePath, resolvedPath, callback));
                await this.getPromise((callback) => fs.rm(cachedFilePath, callback));
            }
        });

        await Promise.all(promises);

        const paths = files.map((x) => x.filePath);
        this._revertedChanges.push(...paths);

        this.fireTelemetryEvent('rovoDevFileChangedActionEvent', this._currentPromptId, 'undo', files.length);
    }

    private async executeKeepFiles(files: ModifiedFile[]) {
        const promises = files.map(async (file) => {
            const cachedFilePath = await this.rovoDevApiClient!.getCacheFilePath(file.filePath);
            await this.getPromise((callback) => fs.rm(cachedFilePath, callback));
        });

        await Promise.all(promises);

        this.fireTelemetryEvent('rovoDevFileChangedActionEvent', this._currentPromptId, 'keep', files.length);
    }

    private async createPR(commitMessage?: string, branchName?: string): Promise<void> {
        let prLink: string | undefined;
        const webview = this._webView!;
        try {
            if (!commitMessage || !branchName) {
                throw new Error('Commit message and branch name are required to create a PR');
            }
            prLink = await this._prHandler.createPR(branchName, commitMessage);

            await webview.postMessage({
                type: RovoDevProviderMessageType.CreatePRComplete,
                data: {
                    url: prLink,
                },
            });
        } catch (e) {
            await this.processError(e, false);

            const errorMessage = e.message;
            const errorCode = e.gitErrorCode;

            await webview.postMessage({
                type: RovoDevProviderMessageType.CreatePRComplete,
                data: {
                    error: e.message
                        ? `${errorMessage}${errorCode ? ` (Error code: ${errorCode})` : ''}`
                        : 'Unknown error occurred while creating PR',
                },
            });
        }
    }

    private async getCurrentBranchName(): Promise<void> {
        const webview = this._webView!;
        try {
            const branchName = await this._prHandler.getCurrentBranchName();
            await webview.postMessage({
                type: RovoDevProviderMessageType.GetCurrentBranchNameComplete,
                data: {
                    branchName,
                },
            });
        } catch (e) {
            await this.processError(e, false);
        }
    }
    private async executeApiWithErrorHandling<T>(
        func: (client: RovoDevApiClient) => Promise<T>,
        isErrorRetriable: boolean,
        cancellationAware?: true,
    ): Promise<T | void> {
        if (this.rovoDevApiClient) {
            try {
                return await func(this.rovoDevApiClient);
            } catch (error) {
                if (cancellationAware && this._pendingCancellation && error.cause?.code === 'UND_ERR_SOCKET') {
                    this._pendingCancellation = false;
                    this.completeChatResponse('error');
                } else {
                    await this.processError(error, isErrorRetriable);
                }
            }
        } else {
            await this.processError(new Error('RovoDev client not initialized'), false);
        }
    }

    private async executeGetText(filePath: string, range?: number[]): Promise<string | undefined> {
        const resolvedPath = this.makeRelativePathAbsolute(filePath);
        if (!fs.existsSync(resolvedPath)) {
            console.warn(`File not found: ${resolvedPath}`);
            return undefined;
        }

        const document = await workspace.openTextDocument(Uri.file(resolvedPath));

        if (!document) {
            console.warn(`Unable to open document for file: ${resolvedPath}`);
            return undefined;
        }

        const lineRange =
            range && Array.isArray(range) ? new Range(new Position(range[0], 0), new Position(range[1], 0)) : undefined;

        const text = document.getText(document.validateRange(lineRange || new Range(0, 0, document.lineCount, 0)));

        return text;
    }

    async invokeRovoDevAskCommand(prompt: string, context?: RovoDevContext): Promise<void> {
        // focus on the specific vscode view
        commands.executeCommand('atlascode.views.rovoDev.webView.focus');

        // Wait for the webview to initialize, up to 5 seconds
        const initialized = await this.waitFor(() => !!this._webView, 5000, 50);
        if (!initialized) {
            console.error('Webview is not initialized after waiting.');
            return;
        }

        // Actually invoke the rovodev service, feed responses to the webview as normal
        await this.executeChat({ text: prompt, context }, false);
    }

    async startBackgroundSession(webviewView?: WebviewView, context?: RovoDevContext): Promise<void> {
        // Focus the webview first
        commands.executeCommand('atlascode.views.rovoDev.webView.focus');

        // Wait for the webview to initialize, up to 5 seconds
        const initialized = await this.waitFor(() => !!this._webView, 5000, 50);
        if (!initialized) {
            console.error('Webview is not initialized after waiting.');
            return;
        }

        // Send message to webview to open the NewSessionDropdown with context
        if (this._webView) {
            await this._webView.postMessage({
                type: RovoDevProviderMessageType.OpenNewSessionDropdown,
                context,
            });
        }
    }

    async openBackgroundSessionsDropdown(): Promise<void> {
        // Focus the webview first
        commands.executeCommand('atlascode.views.rovoDev.webView.focus');

        // Wait for the webview to initialize
        const initialized = await this.waitFor(() => !!this._webView, 5000, 50);
        if (!initialized) {
            console.error('Webview is not initialized after waiting.');
            return;
        }

        // Load background sessions and then open the dropdown
        await this.listBackgroundSessionsForDropdown();

        // Send message to webview to open the BackgroundSessionsDropdown
        if (this._webView) {
            await this._webView.postMessage({
                type: RovoDevProviderMessageType.OpenBackgroundSessionsDropdown,
            });
        }
    }

    async listBackgroundSessionsForDropdown(): Promise<void> {
        try {
            // Get the current main session port
            const mainPort = this.getWorkspacePort();
            const currentPort = this.getActiveRovoDevPort();

            // Create the main session entry
            const mainSession = {
                id: 'main',
                name: 'Main',
                isActive: mainPort ? currentPort === mainPort : false,
                isRunning: mainPort !== undefined, // Main session is running if it has a port
            };

            // Get the Shipit webview provider from the container to access background sessions
            const shipitProvider = Container.shipitRovodevWebviewProvider;
            if (!shipitProvider) {
                // Send only the main session if Shipit is not available
                if (this._webView) {
                    await this._webView.postMessage({
                        type: RovoDevProviderMessageType.BackgroundSessionsUpdated,
                        sessions: [mainSession],
                    });
                }
                return;
            }

            // Request background sessions from ShipIt
            await shipitProvider.listBackgroundSessions();

            // Note: The response will be handled by the ShipIt webview provider
            // and we'll receive the updated sessions through the backgroundSessionsList event
            // We'll prepend the main session when we receive the background sessions
        } catch (error) {
            Logger.error(error as Error, 'Failed to list background sessions');
        }
    }

    async selectBackgroundSession(sessionId: string): Promise<void> {
        try {
            // Handle main session selection separately
            if (sessionId === 'main') {
                const mainPort = this.getWorkspacePort();

                if (mainPort) {
                    // Update the selected port in global state
                    Container.context.globalState.update('selectedRovoDevPort', mainPort);

                    // Use the same server switching logic as background sessions
                    // Main session switch is to an existing session
                    this.switchToServer(mainPort, false);

                    // Refresh the sessions list to update active indicators
                    await this.listBackgroundSessionsForDropdown();
                } else {
                    window.showWarningMessage('Main session is not available.');
                }
                return;
            }

            // Get the Shipit webview provider to handle background session switching
            const shipitProvider = Container.shipitRovodevWebviewProvider;
            if (!shipitProvider) {
                window.showWarningMessage('Background sessions require ShipIt integration.');
                return;
            }

            // Request session selection through ShipIt
            await shipitProvider.selectBackgroundSession(sessionId);
        } catch (error) {
            Logger.error(error as Error, 'Failed to select background session');
            window.showErrorMessage('Failed to switch to background session');
        }
    }

    async deleteBackgroundSession(sessionId: string): Promise<void> {
        try {
            // Prevent deletion of the main session
            if (sessionId === 'main') {
                window.showWarningMessage('The main session cannot be deleted.');
                return;
            }

            // Get the Shipit webview provider to handle session deletion
            const shipitProvider = Container.shipitRovodevWebviewProvider;
            if (!shipitProvider) {
                window.showWarningMessage('Background sessions require ShipIt integration.');
                return;
            }

            // Show confirmation dialog
            const confirmed = await window.showWarningMessage(
                `Are you sure you want to delete the background session?`,
                { modal: true },
                'Delete',
            );

            if (confirmed === 'Delete') {
                // Request session deletion through ShipIt
                await shipitProvider.deleteBackgroundSession(sessionId);
            }
        } catch (error) {
            Logger.error(error as Error, 'Failed to delete background session');
            window.showErrorMessage('Failed to delete background session');
        }
    }

    async listBackgroundSessions(): Promise<void> {
        // Focus the webview first
        commands.executeCommand('atlascode.views.rovoDev.webView.focus');

        try {
            // Get the Shipit webview provider from the container
            const shipitProvider = Container.shipitRovodevWebviewProvider;
            if (!shipitProvider) {
                window.showWarningMessage(
                    'Background sessions require ShipIt integration. Please ensure ShipIt is available.',
                );
                return;
            }

            // Open the background sessions dropdown instead of showing quick pick
            this.openBackgroundSessionsDropdown();
        } catch (error) {
            Logger.error(error as Error, 'Failed to list background sessions');
            window.showErrorMessage('Failed to access background sessions');
        }
    }

    private async createNewBackgroundSession(
        sessionName: string,
        prompt?: string,
        context?: RovoDevContext,
    ): Promise<void> {
        // Reset the current session
        await this.executeReset();

        // If an initial prompt is provided, execute it
        if (prompt?.trim()) {
            const promptMessage: RovoDevPrompt = {
                text: prompt.trim(),
                enable_deep_plan: false,
                context: context || {},
            };
            await this.executeChat(promptMessage);
        }

        // Log that a new named session was created
    }

    private async createBackgroundSessionWithShipit(
        sessionName: string,
        prompt?: string,
        context?: RovoDevContext,
    ): Promise<void> {
        try {
            // Get the Shipit webview provider from the container
            const shipitProvider = Container.shipitRovodevWebviewProvider;
            if (!shipitProvider) {
                window.showWarningMessage(
                    'Background sessions require ShipIt integration. Please ensure ShipIt is available.',
                );
                return;
            }

            // Use the prompt as the session name if provided, otherwise use the given sessionName
            const displayName = prompt && prompt.trim() ? prompt.trim() : sessionName;

            // Show initial message that session is being created
            const statusMessage = prompt
                ? `Creating background session and starting prompt...`
                : `Creating background session "${displayName}"...`;
            window.showInformationMessage(statusMessage);

            // Send message to create background session via Shipit
            // Pass the prompt as sessionName so ShipIt can create a meaningful name from it
            await shipitProvider.createBackgroundSession(displayName, prompt);

            // If there's a prompt, let the user know it will run in the background
            if (prompt?.trim()) {
                // Use global setTimeout instead of the imported one from timers/promises
                (global as any).setTimeout(() => {
                    window.showInformationMessage(
                        `Background session "${sessionName}" is running your prompt. You can continue working while it processes.`,
                    );
                }, 2000); // Show after 2 seconds to allow time for session creation
            }
        } catch (error) {
            const errorMessage = `Failed to create background session "${sessionName}": ${error instanceof Error ? error.message : 'Unknown error'}`;
            window.showErrorMessage(errorMessage);
        }
    }

    /**
     * Adds a context item to the RovoDev webview. Intended for external calls, e.g. commands
     * @param contextItem The context item to add.
     * @returns A promise that resolves when the context item has been added.
     */
    async addToContext(contextItem: RovoDevContextItem): Promise<void> {
        if (!this._webView) {
            console.error('Webview is not initialized.');
            return;
        }

        this._webView.postMessage({
            type: RovoDevProviderMessageType.ContextAdded,
            context: contextItem,
        });
    }

    private async waitFor(
        check: () => Promise<boolean> | boolean,
        timeoutMs: number,
        interval: number,
    ): Promise<boolean> {
        let result = await check();
        while (!result && timeoutMs) {
            await setTimeout(interval);
            timeoutMs -= interval;
            result = await check();
        }
        return result;
    }

    private _dispose() {
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
        if (this._webView) {
            this._webView = undefined;
        }
    }

    /**
     * Handle background session responses from ShipIt webview provider
     */
    async handleShipItBackgroundSessionResponse(response: any): Promise<void> {
        if (!this._webView) {
            return;
        }

        try {
            switch (response.type) {
                case 'backgroundSessionsList':
                    if (response.status === 'success' && response.sessions) {
                        // Get the currently selected port to determine active session
                        const currentPort = this.getActiveRovoDevPort();
                        const mainPort = this.getWorkspacePort();

                        // Create the main session entry
                        const mainSession = {
                            id: 'main',
                            name: 'Main',
                            isActive: mainPort ? currentPort === mainPort : false,
                            isRunning: mainPort !== undefined, // Main session is running if it has a port
                        };

                        // Convert ShipIt session format to RovoDev format
                        const backgroundSessions = response.sessions.map((session: any) => ({
                            id: session.sessionId,
                            name: session.sessionName,
                            isActive: currentPort === session.port, // Check if this session is currently active
                            isRunning: true, // All sessions from ShipIt are running
                        }));

                        // Combine main session with background sessions (main session first)
                        const allSessions = [mainSession, ...backgroundSessions];

                        await this._webView.postMessage({
                            type: RovoDevProviderMessageType.BackgroundSessionsUpdated,
                            sessions: allSessions,
                        });
                    } else {
                        // Send only the main session on error
                        const mainPort = this.getWorkspacePort();
                        const currentPort = this.getActiveRovoDevPort();
                        const mainSession = {
                            id: 'main',
                            name: 'Main',
                            isActive: mainPort ? currentPort === mainPort : false,
                            isRunning: mainPort !== undefined,
                        };

                        await this._webView.postMessage({
                            type: RovoDevProviderMessageType.BackgroundSessionsUpdated,
                            sessions: [mainSession],
                        });
                    }
                    break;

                case 'backgroundSessionSelected':
                    if (response.status === 'success') {
                        window.showInformationMessage(`Switched to background session`);
                        // Refresh the sessions list to update active status
                        this.listBackgroundSessionsForDropdown();
                    } else {
                        window.showErrorMessage(`Failed to switch session: ${response.error || 'Unknown error'}`);
                    }
                    break;

                case 'backgroundSessionDeleted':
                    if (response.status === 'success') {
                        window.showInformationMessage(`Background session deleted`);
                        // Refresh the sessions list
                        this.listBackgroundSessionsForDropdown();
                    } else {
                        window.showErrorMessage(`Failed to delete session: ${response.error || 'Unknown error'}`);
                    }
                    break;
            }
        } catch (error) {
            Logger.error(error as Error, 'Failed to handle ShipIt background session response');
        }
    }

    private getPromise(code: (callback: fs.NoParamCallback) => void): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const callback: fs.NoParamCallback = (err) => (err ? reject(err) : resolve());
            try {
                code(callback);
            } catch (error) {
                reject(error);
            }
        });
    }
}
