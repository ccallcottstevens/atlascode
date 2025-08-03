import React, { useEffect, useState } from 'react';

import { PromptInputBox } from '../prompt-box/prompt-input/PromptInput';
import { State } from '../rovoDevView';

interface BackgroundSession {
    id: string;
    name: string;
    prompt?: string;
    isActive: boolean;
    worktreePath?: string;
    port?: number;
    isRunning?: boolean;
}

interface NewSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateBackgroundSession: (prompt?: string) => void;
    defaultPrompt?: string; // Add this prop
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({
    isOpen,
    onClose,
    onCreateBackgroundSession,
    defaultPrompt = '',
}) => {
    const [prompt, setPrompt] = useState(defaultPrompt);
    const [isCreating, setIsCreating] = useState(false);

    // Reset prompt when modal opens or defaultPrompt changes
    useEffect(() => {
        if (isOpen) {
            setPrompt(defaultPrompt);
        }
    }, [isOpen, defaultPrompt]);

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

    if (!isOpen) {
        return null;
    }

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                style={{
                    backgroundColor: 'var(--vscode-editor-background)',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '8px',
                    padding: '16px',
                    minWidth: '450px',
                    maxWidth: '550px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                }}
            >
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
                />
            </div>
        </div>
    );
};

export type { BackgroundSession };
