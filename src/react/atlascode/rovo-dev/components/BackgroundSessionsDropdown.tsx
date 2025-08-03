import React, { useEffect, useRef } from 'react';

interface BackgroundSession {
    id: string;
    name: string;
    prompt?: string;
    isActive: boolean;
    worktreePath?: string;
    port?: number;
    isRunning?: boolean;
}

interface BackgroundSessionsDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    sessions: BackgroundSession[];
    onSelectSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
}

export const BackgroundSessionsDropdown: React.FC<BackgroundSessionsDropdownProps> = ({
    isOpen,
    onClose,
    sessions,
    onSelectSession,
    onDeleteSession,
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    // Calculate position to align with VS Code header action area
    const getDropdownStyle = (): React.CSSProperties => {
        return {
            position: 'absolute',
            top: '4px',
            right: '12px',
            zIndex: 1000,
            minWidth: '300px',
            maxWidth: '400px',
            maxHeight: '300px',
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
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'var(--vscode-foreground)',
                    marginBottom: '8px',
                    padding: '4px 8px',
                }}
            >
                Background Sessions
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
                        onClick={() => onSelectSession(session.id)}
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
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {session.name || `Session ${session.id.slice(0, 8)}`}
                            </div>
                            {session.prompt && (
                                <div
                                    style={{
                                        fontSize: '11px',
                                        color: 'var(--vscode-descriptionForeground)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        marginTop: '2px',
                                    }}
                                >
                                    {session.prompt}
                                </div>
                            )}
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
                                    e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                                title="Delete session"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

export type { BackgroundSession };
