import React, { useEffect, useRef } from 'react';
import { RovoDevContext, RovoDevContextItem } from 'src/rovo-dev/rovoDevTypes';

import { PromptContextCollection } from '../prompt-box/promptContext/promptContextCollection';

interface BackgroundSession {
    id: string;
    name: string;
    isActive: boolean;
    isRunning?: boolean;
}

interface BackgroundSessionsDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    sessions: BackgroundSession[];
    onSelectSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
    promptContextCollection?: RovoDevContext;
    onAddContext?: () => void;
    onRemoveContext?: (item: RovoDevContextItem) => void;
    onToggleActiveItem?: (enabled: boolean) => void;
}

export const BackgroundSessionsDropdown: React.FC<BackgroundSessionsDropdownProps> = ({
    isOpen,
    onClose,
    sessions,
    onSelectSession,
    onDeleteSession,
    promptContextCollection,
    onAddContext,
    onRemoveContext,
    onToggleActiveItem,
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Handle clicking outside the dropdown and ESC key
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isOpen && event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    // Calculate position to align with VS Code header action area
    const getDropdownStyle = (): React.CSSProperties => {
        return {
            position: 'absolute',
            top: '4px',
            right: '12px',
            zIndex: 1000,
            minWidth: '350px',
            maxWidth: '500px',
            maxHeight: '500px',
            overflowY: 'auto',
        };
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div
            ref={dropdownRef}
            style={{
                ...getDropdownStyle(),
                backgroundColor: 'var(--vscode-editor-background)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '6px',
                padding: '8px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'var(--vscode-foreground)',
                    marginBottom: '8px',
                    padding: '4px 8px',
                }}
            >
                <span>Background Sessions</span>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--vscode-descriptionForeground)',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        borderRadius: '2px',
                        fontSize: '14px',
                        lineHeight: '1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
                        e.currentTarget.style.color = 'var(--vscode-foreground)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--vscode-descriptionForeground)';
                    }}
                    title="Close"
                >
                    ×
                </button>
            </div>

            {sessions.length === 0 ? (
                <div
                    style={{
                        padding: '12px 8px',
                        color: 'var(--vscode-descriptionForeground)',
                        fontSize: '12px',
                        textAlign: 'center',
                    }}
                >
                    No background sessions running
                </div>
            ) : (
                sessions.map((session) => (
                    <div
                        key={session.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px',
                            margin: '2px 0',
                            borderRadius: '4px',
                            backgroundColor: session.isActive
                                ? 'var(--vscode-list-activeSelectionBackground)'
                                : 'transparent',
                            border: '1px solid transparent',
                            cursor: 'pointer',
                        }}
                        onClick={() => {
                            onSelectSession(session.id);
                        }}
                        onMouseEnter={(e) => {
                            if (!session.isActive) {
                                e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!session.isActive) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: '13px',
                                    color: 'var(--vscode-foreground)',
                                    fontWeight: session.isActive ? '600' : '400',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    minWidth: 0, // Important for flex child to allow shrinking
                                }}
                            >
                                {session.isActive && (
                                    <span
                                        style={{
                                            color: 'var(--vscode-charts-green)',
                                            fontSize: '10px',
                                            fontWeight: 'bold',
                                            flexShrink: 0, // Prevent the dot from shrinking
                                        }}
                                    >
                                        ●
                                    </span>
                                )}
                                <span
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        flex: 1,
                                        minWidth: 0, // Allow this span to shrink and trigger ellipsis
                                    }}
                                >
                                    {session.name || `Session ${session.id.slice(0, 8)}`}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {session.isRunning && (
                                <div
                                    style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        backgroundColor: 'var(--vscode-charts-green)',
                                    }}
                                    title="Running"
                                />
                            )}
                            {session.id !== 'main' && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteSession(session.id);
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--vscode-descriptionForeground)',
                                        cursor: 'pointer',
                                        padding: '2px',
                                        borderRadius: '2px',
                                        fontSize: '12px',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor =
                                            'var(--vscode-button-secondaryBackground)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                    title="Delete session"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    </div>
                ))
            )}

            {/* Add a separator line if we have both sessions and context */}
            {sessions.length > 0 && promptContextCollection && (
                <div
                    style={{
                        height: '1px',
                        backgroundColor: 'var(--vscode-panel-border)',
                        margin: '8px 0',
                    }}
                />
            )}

            {/* Context Collection section */}
            {promptContextCollection && onAddContext && onRemoveContext && onToggleActiveItem && (
                <div style={{ marginTop: sessions.length > 0 ? '8px' : '0' }}>
                    <div
                        style={{
                            fontSize: '12px',
                            fontWeight: '600',
                            color: 'var(--vscode-foreground)',
                            marginBottom: '8px',
                            padding: '0 8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <span>Context Files</span>
                        <span
                            style={{
                                fontSize: '11px',
                                color: 'var(--vscode-descriptionForeground)',
                                fontWeight: '400',
                            }}
                        >
                            {promptContextCollection.contextItems?.length || 0} files
                        </span>
                    </div>
                    <PromptContextCollection
                        content={promptContextCollection}
                        readonly={false}
                        onAddContext={onAddContext}
                        onRemoveContext={onRemoveContext}
                        onToggleActiveItem={onToggleActiveItem}
                    />
                </div>
            )}
        </div>
    );
};

export type { BackgroundSession };
