import * as React from 'react';
import { SessionState } from '../../models/profilerTypes';

interface ToolbarProps {
    sessionState: SessionState;
    onStart: () => void;
    onStop: () => void;
    onPause: () => void;
    onClear: () => void;
    onExport: () => void;
    onReconnect: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    sessionState,
    onStart,
    onStop,
    onPause,
    onClear,
    onExport,
    onReconnect
}) => {
    const isRunning = sessionState === SessionState.Running;
    const isPaused = sessionState === SessionState.Paused;
    const isStopped = sessionState === SessionState.Stopped;

    return (
        <div className="toolbar">
            <div className="toolbar-group">
                <button
                    className="toolbar-button"
                    onClick={onStart}
                    disabled={isRunning}
                    title="Start profiling"
                >
                    <span className="codicon codicon-play"></span>
                    Start
                </button>
                <button
                    className="toolbar-button"
                    onClick={onStop}
                    disabled={isStopped}
                    title="Stop profiling"
                >
                    <span className="codicon codicon-debug-stop"></span>
                    Stop
                </button>
                <button
                    className="toolbar-button"
                    onClick={onPause}
                    disabled={isStopped}
                    title={isPaused ? "Resume profiling" : "Pause profiling"}
                >
                    <span className={isPaused ? "codicon codicon-play" : "codicon codicon-debug-pause"}></span>
                    {isPaused ? 'Resume' : 'Pause'}
                </button>
            </div>

            <div className="toolbar-separator"></div>

            <div className="toolbar-group">
                <button
                    className="toolbar-button"
                    onClick={onClear}
                    title="Clear events"
                >
                    <span className="codicon codicon-clear-all"></span>
                    Clear
                </button>
                <button
                    className="toolbar-button"
                    onClick={onExport}
                    title="Export events to CSV"
                >
                    <span className="codicon codicon-export"></span>
                    Export
                </button>
            </div>

            <div className="toolbar-separator"></div>

            <div className="toolbar-group">
                <button
                    className="toolbar-button"
                    onClick={onReconnect}
                    title="Reconnect to database"
                >
                    <span className="codicon codicon-debug-disconnect"></span>
                    Reconnect
                </button>
            </div>

            <div className="toolbar-spacer"></div>

            <div className="status-indicator">
                <span className={`status-dot status-${sessionState.toLowerCase()}`}></span>
                <span className="status-text">{sessionState}</span>
            </div>
        </div>
    );
};
