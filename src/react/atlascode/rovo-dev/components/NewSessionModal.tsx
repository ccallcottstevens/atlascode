import React, { useState } from 'react';

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
    onCreateBackgroundSession: (sessionName: string, prompt?: string) => void;
}

export const NewSessionModal: React.FC<NewSessionModalProps> = ({ isOpen, onClose, onCreateBackgroundSession }) => {
    const [sessionName, setSessionName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = () => {
        if (!sessionName.trim()) {
            return;
        }

        setIsCreating(true);
        try {
            onCreateBackgroundSession(sessionName.trim(), prompt.trim() || undefined);
            setSessionName('');
            setPrompt('');
            onClose();
        } finally {
            setIsCreating(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isCreating && sessionName.trim()) {
            handleCreate();
        } else if (e.key === 'Escape') {
            onClose();
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
                    padding: '24px',
                    minWidth: '450px',
                    maxWidth: '550px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                }}
            >
                <div style={{ marginBottom: '20px' }}>
                    <h2
                        style={{
                            margin: '0 0 8px 0',
                            color: 'var(--vscode-foreground)',
                            fontFamily: 'var(--vscode-font-family)',
                            fontSize: '18px',
                            fontWeight: '600',
                        }}
                    >
                        Start New Background Session
                    </h2>
                    <p
                        style={{
                            margin: 0,
                            color: 'var(--vscode-descriptionForeground)',
                            fontSize: '14px',
                            lineHeight: '1.4',
                        }}
                    >
                        Create a new background session that runs independently. You can switch between sessions and
                        work on multiple tasks simultaneously.
                    </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label
                        style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: 'var(--vscode-foreground)',
                            fontSize: '14px',
                            fontWeight: '500',
                        }}
                    >
                        Session Name *
                    </label>
                    <input
                        type="text"
                        value={sessionName}
                        onChange={(e) => setSessionName(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="e.g., 'Bug fixes', 'New feature', 'API refactor'"
                        disabled={isCreating}
                        style={{
                            width: '100%',
                            padding: '12px',
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            fontSize: '14px',
                            fontFamily: 'var(--vscode-font-family)',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                        autoFocus
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label
                        style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: 'var(--vscode-foreground)',
                            fontSize: '14px',
                            fontWeight: '500',
                        }}
                    >
                        Initial Prompt (optional)
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter an initial prompt for this session..."
                        disabled={isCreating}
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '12px',
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            fontSize: '14px',
                            fontFamily: 'var(--vscode-font-family)',
                            outline: 'none',
                            boxSizing: 'border-box',
                            resize: 'vertical',
                            minHeight: '80px',
                        }}
                    />
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                    }}
                >
                    <button
                        onClick={onClose}
                        disabled={isCreating}
                        style={{
                            padding: '10px 20px',
                            border: '1px solid var(--vscode-button-border)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            fontSize: '14px',
                            fontFamily: 'var(--vscode-font-family)',
                            cursor: isCreating ? 'not-allowed' : 'pointer',
                            opacity: isCreating ? 0.6 : 1,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isCreating || !sessionName.trim()}
                        style={{
                            padding: '10px 20px',
                            border: 'none',
                            borderRadius: '4px',
                            backgroundColor: 'var(--vscode-button-background)',
                            color: 'var(--vscode-button-foreground)',
                            fontSize: '14px',
                            fontFamily: 'var(--vscode-font-family)',
                            cursor: isCreating || !sessionName.trim() ? 'not-allowed' : 'pointer',
                            opacity: isCreating || !sessionName.trim() ? 0.6 : 1,
                            fontWeight: '500',
                        }}
                    >
                        {isCreating ? 'Starting...' : 'Start Background Session'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export type { BackgroundSession };
