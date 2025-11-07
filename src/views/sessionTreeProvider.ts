import * as vscode from 'vscode';
import { ProfilerService } from '../services/profilerService';
import { SessionState } from '../models/profilerTypes';

export class SessionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly sessionName: string,
        public readonly state: SessionState,
        public readonly connectionInfo: string,
        public readonly eventCount: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(sessionName, collapsibleState);
        this.contextValue = 'session';

        // Set icon based on state
        if (state === SessionState.Running) {
            this.iconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('testing.runAction'));
        } else if (state === SessionState.Paused) {
            this.iconPath = new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('debugIcon.pauseForeground'));
        } else {
            this.iconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('debugIcon.stopForeground'));
        }

        this.description = `${connectionInfo} - ${eventCount} events`;
        this.tooltip = `Session: ${sessionName}\nState: ${state}\nConnection: ${connectionInfo}\nEvents: ${eventCount}`;
    }
}

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SessionTreeItem | undefined | void> = new vscode.EventEmitter<SessionTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<SessionTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private profilerService: ProfilerService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SessionTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
        if (!element) {
            // Root level - show all active sessions
            const sessions = this.profilerService.getAllSessions();

            if (sessions.length === 0) {
                return [];
            }

            return sessions.map(session =>
                new SessionTreeItem(
                    session.name,
                    session.state,
                    `${session.connection.serverName}/${session.connection.databaseName}`,
                    session.events.length,
                    vscode.TreeItemCollapsibleState.None
                )
            );
        }

        return [];
    }
}
