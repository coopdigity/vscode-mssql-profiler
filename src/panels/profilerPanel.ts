import * as vscode from 'vscode';
import * as path from 'path';
import { ProfilerSession, SessionState } from '../models/profilerTypes';
import { ProfilerService } from '../services/profilerService';

/**
 * Profiler webview panel for displaying profiling events using React
 */
export class ProfilerPanel {
    public static currentPanels: Map<string, ProfilerPanel> = new Map();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _session: ProfilerSession;
    private _profilerService: ProfilerService;
    private _updateInterval: NodeJS.Timeout | undefined;

    /**
     * Create or show profiler panel
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        session: ProfilerSession,
        profilerService: ProfilerService
    ): ProfilerPanel {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        // If panel already exists for this session, show it
        if (ProfilerPanel.currentPanels.has(session.name)) {
            const existingPanel = ProfilerPanel.currentPanels.get(session.name)!;
            existingPanel._panel.reveal(column);
            return existingPanel;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'sqlProfiler',
            `Profiler: ${session.name}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'out'),
                    vscode.Uri.joinPath(extensionUri, 'out', 'webview'),
                    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
                ]
            }
        );

        const profilerPanel = new ProfilerPanel(panel, extensionUri, session, profilerService);
        ProfilerPanel.currentPanels.set(session.name, profilerPanel);

        return profilerPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        session: ProfilerSession,
        profilerService: ProfilerService
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._session = session;
        this._profilerService = profilerService;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'ready':
                        this.handleReady();
                        break;
                    case 'start':
                        this.handleStart();
                        break;
                    case 'stop':
                        this.handleStop();
                        break;
                    case 'pause':
                        this.handlePause();
                        break;
                    case 'clear':
                        this.handleClear();
                        break;
                    case 'export':
                        this.handleExport();
                        break;
                    case 'reconnect':
                        this.handleReconnect();
                        break;
                }
            },
            null,
            this._disposables
        );

        // Start periodic updates
        this._updateInterval = setInterval(() => {
            this.sendEventsUpdate();
        }, 1000);
    }

    /**
     * Update session state
     */
    public updateSessionState(): void {
        this.sendStateUpdate();
    }

    /**
     * Handle webview ready event
     */
    private handleReady(): void {
        // Send initial data to React app
        const config = vscode.workspace.getConfiguration('mssql-profiler');
        const maxEvents = config.get<number>('maxEvents', 1000);

        // Convert Map to array for serialization
        const databases = Array.from(this._session.databaseLookup.values()).sort();

        this._panel.webview.postMessage({
            type: 'init',
            sessionName: this._session.name,
            sessionState: this._session.state,
            events: this._session.events,
            maxEvents,
            databases
        });
    }

    /**
     * Handle start command from webview
     */
    private async handleStart(): Promise<void> {
        try {
            await vscode.commands.executeCommand('mssql-profiler.startProfiling', this._session.name);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to start profiling: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Handle stop command from webview
     */
    private async handleStop(): Promise<void> {
        try {
            await vscode.commands.executeCommand('mssql-profiler.stopProfiling', this._session.name);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to stop profiling: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Handle pause command from webview
     */
    private async handlePause(): Promise<void> {
        try {
            await vscode.commands.executeCommand('mssql-profiler.pauseProfiling', this._session.name);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to pause profiling: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Handle clear events command
     */
    private handleClear(): void {
        this._session.events = [];
        this._panel.webview.postMessage({
            type: 'clear'
        });
        vscode.window.showInformationMessage('Events cleared');
    }

    /**
     * Handle reconnect command from webview
     */
    private async handleReconnect(): Promise<void> {
        try {
            await vscode.commands.executeCommand('mssql-profiler.reconnect', this._session.name);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to reconnect: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Handle export events command
     */
    private async handleExport(): Promise<void> {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`${this._session.name}_events.json`),
                filters: {
                    'JSON': ['json'],
                    'CSV': ['csv']
                }
            });

            if (uri) {
                const extension = uri.fsPath.split('.').pop()?.toLowerCase();
                let content: string;

                if (extension === 'csv') {
                    content = this.exportToCsv();
                } else {
                    content = JSON.stringify(this._session.events, null, 2);
                }

                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage(`Events exported to ${uri.fsPath}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to export: ${error?.message || 'Unknown error'}`);
        }
    }

    /**
     * Export events to CSV format
     */
    private exportToCsv(): string {
        if (this._session.events.length === 0) {
            return '';
        }

        // Get all unique column names
        const columnSet = new Set<string>(['name', 'timestamp']);
        for (const event of this._session.events) {
            for (const key of Object.keys(event.values)) {
                columnSet.add(key);
            }
        }
        const columns = Array.from(columnSet);

        // Create CSV header
        const header = columns.map(col => `"${col}"`).join(',');

        // Create CSV rows
        const rows = this._session.events.map(event => {
            return columns.map(col => {
                if (col === 'name') return `"${event.name}"`;
                if (col === 'timestamp') return `"${event.timestamp}"`;
                const value = event.values[col] || '';
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(',');
        });

        return [header, ...rows].join('\n');
    }

    /**
     * Send events update to webview
     */
    private sendEventsUpdate(): void {
        const updatedSession = this._profilerService.getSession(this._session.name);
        if (updatedSession) {
            this._session = updatedSession;
        }

        this._panel.webview.postMessage({
            type: 'eventsUpdated',
            events: this._session.events
        });
    }

    /**
     * Send state update to webview
     */
    private sendStateUpdate(): void {
        const updatedSession = this._profilerService.getSession(this._session.name);
        if (updatedSession) {
            this._session = updatedSession;
        }

        this._panel.webview.postMessage({
            type: 'stateChanged',
            state: this._session.state
        });
    }

    /**
     * Dispose of the panel
     */
    public dispose(): void {
        ProfilerPanel.currentPanels.delete(this._session.name);

        if (this._updateInterval) {
            clearInterval(this._updateInterval);
        }

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Update the webview content
     */
    private _update(): void {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    /**
     * Get HTML content for the webview - React version
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the URIs for the bundled React app
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'webview.js')
        );

        // Get codicon font file URI with cache-busting
        const codiconFontUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf')
        ) + '?v=' + Date.now();

        // Use a nonce to only allow specific scripts to be run
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <style>
        /* Load codicon font */
        @font-face {
            font-family: "codicon";
            font-display: block;
            src: url("${codiconFontUri}") format("truetype");
        }
    </style>
    <title>SQL Server Profiler</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate a nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
