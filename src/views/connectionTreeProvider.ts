import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';

export class ConnectionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly id: string,
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = 'connection';
        this.iconPath = new vscode.ThemeIcon('database');
        this.tooltip = `${label}\n${description}`;
    }
}

export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConnectionTreeItem | undefined | void> = new vscode.EventEmitter<ConnectionTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ConnectionTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private connectionManager: ConnectionManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
        if (!element) {
            // Root level - show all saved connections
            const profiles = await this.connectionManager.getSavedProfiles();

            if (profiles.length === 0) {
                return [];
            }

            return profiles.map(profile =>
                new ConnectionTreeItem(
                    profile.id,
                    profile.name,
                    `${profile.serverName} / ${profile.databaseName}`,
                    vscode.TreeItemCollapsibleState.None
                )
            );
        }

        return [];
    }
}
