import React, { useEffect, useRef, useState } from 'react';

export interface BackgroundSession {
    id: string;
    name: string;
    prompt?: string;
    isActive: boolean;
    worktreePath?: string;
    port?: number;
    isRunning?: boolean;
}

interface BackgroundSessionDropdownProps {
    sessions: BackgroundSession[];
    currentSession: BackgroundSession | null;
    onSelectSession: (session: BackgroundSession) => void;
    onNewSession: () => void;
    onToggleSessionView: (session: BackgroundSession) => void;
    expandedSessions: Set<string>;
}

export const BackgroundSessionDropdown: React.FC<BackgroundSessionDropdownProps> = ({
    sessions,
    currentSession,
    onSelectSession,
    onNewSession,
    onToggleSessionView,
    expandedSessions,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const truncateText = (text: string, maxLength: number) => {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    };

    const getCurrentDisplayName = () => {
        if (!currentSession) {
            return 'No session';
        }
        return truncateText(currentSession.name, 20);
    };

    if (sessions.length === 0) {
        return (
            <button
                onClick={onNewSession}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    border: '1px solid var(--vscode-button-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    fontSize: '13px',
                    fontFamily: 'var(--vscode-font-family)',
                    cursor: 'pointer',
                    outline: 'none',
                }}
                title="Start new background session"
            >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" />
                    <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" />
                </svg>
                New Session
            </button>
        );
    }

    return (
        <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    border: '1px solid var(--vscode-button-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    fontSize: '13px',
                    fontFamily: 'var(--vscode-font-family)',
                    cursor: 'pointer',
                    outline: 'none',
                    minWidth: '150px',
                    justifyContent: 'space-between',
                }}
                title={currentSession ? `Current session: ${currentSession.name}` : 'Select session'}
            >
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    <span
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: currentSession?.isActive
                                ? currentSession?.isRunning
                                    ? '#ff9800'
                                    : '#4caf50'
                                : '#666',
                        }}
                    />
                    {getCurrentDisplayName()}
                </span>
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                    }}
                >
                    <path d="M4.427 9.573l3.396-3.396a.25.25 0 01.354 0l3.396 3.396a.25.25 0 01-.177.427H4.604a.25.25 0 01-.177-.427z" />
                </svg>
            </button>

            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'var(--vscode-dropdown-background)',
                        border: '1px solid var(--vscode-dropdown-border)',
                        borderRadius: '4px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        zIndex: 1000,
                        maxHeight: '300px',
                        overflowY: 'auto',
                    }}
                >
                    {sessions.map((session) => (
                        <div key={session.id}>
                            <div
                                onClick={() => {
                                    if (session.id === 'main') {
                                        onSelectSession(session);
                                        setIsOpen(false);
                                    } else {
                                        onToggleSessionView(session);
                                    }
                                }}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    backgroundColor:
                                        currentSession?.id === session.id
                                            ? 'var(--vscode-list-activeSelectionBackground)'
                                            : 'transparent',
                                    color:
                                        currentSession?.id === session.id
                                            ? 'var(--vscode-list-activeSelectionForeground)'
                                            : 'var(--vscode-dropdown-foreground)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '13px',
                                    fontFamily: 'var(--vscode-font-family)',
                                }}
                                onMouseEnter={(e) => {
                                    if (currentSession?.id !== session.id) {
                                        (e.target as HTMLElement).style.backgroundColor =
                                            'var(--vscode-list-hoverBackground)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (currentSession?.id !== session.id) {
                                        (e.target as HTMLElement).style.backgroundColor = 'transparent';
                                    }
                                }}
                            >
                                <span
                                    style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: session.isActive
                                            ? session.isRunning
                                                ? '#ff9800'
                                                : '#4caf50'
                                            : '#666',
                                        flexShrink: 0,
                                    }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontWeight: currentSession?.id === session.id ? '600' : '400',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {session.name}
                                    </div>
                                    {session.prompt && (
                                        <div
                                            style={{
                                                fontSize: '11px',
                                                color: 'var(--vscode-descriptionForeground)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                marginTop: '2px',
                                            }}
                                        >
                                            {truncateText(session.prompt, 40)}
                                        </div>
                                    )}
                                </div>
                                {session.id !== 'main' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {session.isRunning && (
                                            <span
                                                style={{
                                                    fontSize: '10px',
                                                    color: '#ff9800',
                                                    fontWeight: '500',
                                                }}
                                            >
                                                Running
                                            </span>
                                        )}
                                        <svg
                                            width="12"
                                            height="12"
                                            viewBox="0 0 16 16"
                                            fill="currentColor"
                                            style={{
                                                transform: expandedSessions.has(session.id)
                                                    ? 'rotate(90deg)'
                                                    : 'rotate(0deg)',
                                                transition: 'transform 0.2s ease',
                                            }}
                                        >
                                            <path d="M6 4l4 4-4 4V4z" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                            {session.id !== 'main' && expandedSessions.has(session.id) && (
                                <div
                                    style={{
                                        padding: '8px 32px',
                                        backgroundColor: 'var(--vscode-editor-background)',
                                        borderTop: '1px solid var(--vscode-panel-border)',
                                        fontSize: '12px',
                                        color: 'var(--vscode-descriptionForeground)',
                                    }}
                                >
                                    <div>Port: {session.port || 'Unknown'}</div>
                                    <div>
                                        Path:{' '}
                                        {session.worktreePath ? truncateText(session.worktreePath, 40) : 'Unknown'}
                                    </div>
                                    <div style={{ marginTop: '4px' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectSession(session);
                                                setIsOpen(false);
                                            }}
                                            style={{
                                                padding: '4px 8px',
                                                border: '1px solid var(--vscode-button-border)',
                                                borderRadius: '3px',
                                                backgroundColor: 'var(--vscode-button-secondaryBackground)',
                                                color: 'var(--vscode-button-secondaryForeground)',
                                                fontSize: '11px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Switch to Session
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    <div
                        style={{
                            borderTop: '1px solid var(--vscode-dropdown-border)',
                            margin: '4px 0 0 0',
                        }}
                    >
                        <div
                            onClick={() => {
                                onNewSession();
                                setIsOpen(false);
                            }}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                backgroundColor: 'transparent',
                                color: 'var(--vscode-dropdown-foreground)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '13px',
                                fontFamily: 'var(--vscode-font-family)',
                                fontWeight: '500',
                            }}
                            onMouseEnter={(e) => {
                                (e.target as HTMLElement).style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                            }}
                            onMouseLeave={(e) => {
                                (e.target as HTMLElement).style.backgroundColor = 'transparent';
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" />
                                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" />
                            </svg>
                            New Background Session
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
