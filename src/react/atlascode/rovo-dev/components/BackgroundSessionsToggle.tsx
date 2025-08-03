import ChevronDown from '@atlaskit/icon/glyph/chevron-down';
import ChevronUp from '@atlaskit/icon/glyph/chevron-up';
import React, { useEffect, useRef, useState } from 'react';

interface BackgroundSession {
    id: string;
    name: string;
    isActive: boolean;
    isRunning?: boolean;
}

interface BackgroundSessionsToggleProps {
    sessions: BackgroundSession[];
    onSelectSession: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
    onStartBackgroundSession: () => void;
}

export const BackgroundSessionsToggle: React.FC<BackgroundSessionsToggleProps> = ({
    sessions,
    onSelectSession,
    onDeleteSession,
    onStartBackgroundSession,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Handle clicking outside the dropdown and ESC key
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isOpen && event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    backgroundColor: 'var(--vscode-button-secondaryBackground)',
                    border: '1px solid var(--vscode-button-border)',
                    borderRadius: '4px',
                    color: 'var(--vscode-button-secondaryForeground)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '400',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
                }}
                title="Background Sessions"
            >
                <span>Sessions</span>
                {isOpen ? (
                    <ChevronUp label="chevron-up" size="small" />
                ) : (
                    <ChevronDown label="chevron-down" size="small" />
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: '0',
                        marginTop: '4px',
                        zIndex: 1000,
                        minWidth: '300px',
                        maxWidth: '400px',
                        maxHeight: '300px',
                        overflowY: 'auto',
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
                            onClick={() => setIsOpen(false)}
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
                                    setIsOpen(false);
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
                                            minWidth: 0,
                                        }}
                                    >
                                        {session.isActive && (
                                            <span
                                                style={{
                                                    color: 'var(--vscode-charts-green)',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    flexShrink: 0,
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
                                                minWidth: 0,
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

                    {/* Add "Start background session" option */}
                    <div
                        style={{
                            borderTop: sessions.length > 0 ? '1px solid var(--vscode-panel-border)' : 'none',
                            marginTop: sessions.length > 0 ? '4px' : '0',
                            paddingTop: sessions.length > 0 ? '4px' : '0',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '12px 8px',
                                margin: '2px 0',
                                borderRadius: '4px',
                                backgroundColor: 'var(--vscode-button-background)',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: 'var(--vscode-button-foreground)',
                                fontWeight: '500',
                            }}
                            onClick={() => {
                                onStartBackgroundSession();
                                setIsOpen(false);
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--vscode-button-hoverBackground)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--vscode-button-background)';
                            }}
                        >
                            + New Background Session
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export type { BackgroundSession };
