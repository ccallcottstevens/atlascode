import React, { useEffect, useRef, useState } from 'react';
import { RovoDevContext } from 'src/rovo-dev/rovoDevTypes';

import { PromptInputBox } from '../prompt-box/prompt-input/PromptInput';
import { State } from '../rovoDevView';

interface BackgroundSession {
    id: string;
    name: string;
    isActive: boolean;
    isRunning?: boolean;
}

interface NewSessionDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateBackgroundSession: (prompt?: string) => void;
    defaultPrompt?: string;
    context?: RovoDevContext;
}

export const NewSessionDropdown: React.FC<NewSessionDropdownProps> = ({
    isOpen,
    onClose,
    onCreateBackgroundSession,
    defaultPrompt = '',
    context,
}) => {
    const [prompt, setPrompt] = useState(defaultPrompt);
    const [isCreating, setIsCreating] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Reset prompt when dropdown opens or defaultPrompt changes
    useEffect(() => {
        if (isOpen) {
            setPrompt(defaultPrompt);
        }
    }, [isOpen, defaultPrompt]);

    // Handle clicking outside the dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    const handleCreate = () => {
        setIsCreating(true);
        try {
            onCreateBackgroundSession(prompt.trim() || undefined);
            setPrompt('');
            onClose();
        } finally {
            setIsCreating(false);
        }
    };

    // Calculate position to align with VS Code header action area
    const getDropdownStyle = (): React.CSSProperties => {
        return {
            position: 'absolute',
            top: '4px', // Small margin from top of webview
            right: '12px', // Align with right side where action buttons are
            zIndex: 1000,
            minWidth: '400px',
            maxWidth: '500px',
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
                padding: '12px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            }}
        >
            {context && context.contextItems && context.contextItems.length > 0 && (
                <div
                    style={{
                        marginBottom: '8px',
                        padding: '6px 8px',
                        backgroundColor: 'var(--vscode-badge-background)',
                        color: 'var(--vscode-badge-foreground)',
                        borderRadius: '3px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}
                >
                    <span>📎</span>
                    <span>
                        {context.contextItems.length} file{context.contextItems.length !== 1 ? 's' : ''} selected from
                        editor
                    </span>
                </div>
            )}
            <PromptInputBox
                state={State.WaitingForPrompt}
                promptText={prompt}
                onPromptTextChange={setPrompt}
                isDeepPlanEnabled={false}
                onDeepPlanToggled={() => {}}
                onSend={handleCreate}
                onCancel={onClose}
                sendButtonDisabled={isCreating}
                onAddContext={() => {}}
                placeholder="Start background session"
            />
        </div>
    );
};

export type { BackgroundSession };
