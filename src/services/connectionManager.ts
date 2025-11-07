import * as vscode from 'vscode';
import { mssql } from '../models/mssqlApi';
import { ConnectionInfo } from '../models/profilerTypes';

/**
 * Stored connection profile (without sensitive data)
 */
export interface ConnectionProfile {
    id: string;
    name: string;
    serverName: string;
    databaseName: string;
    authenticationType: string;
    userName?: string;
    isAzure: boolean;
}

/**
 * Connection manager that integrates with vscode-mssql and provides fallback
 */
export class ConnectionManager {
    private mssqlApi: mssql.IExtension | undefined;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize connection manager and check for vscode-mssql extension
     */
    public async initialize(): Promise<void> {
        const mssqlExtension = vscode.extensions.getExtension('ms-mssql.mssql');

        if (mssqlExtension) {
            try {
                if (!mssqlExtension.isActive) {
                    await mssqlExtension.activate();
                }
                this.mssqlApi = mssqlExtension.exports;
                console.log('Connected to vscode-mssql extension');
            } catch (error) {
                console.warn('Failed to activate vscode-mssql extension:', error);
            }
        } else {
            console.log('vscode-mssql extension not found, using standalone mode');
        }
    }

    /**
     * Check if vscode-mssql extension is available
     */
    public hasMssqlExtension(): boolean {
        return this.mssqlApi !== undefined;
    }

    /**
     * Get connection using hybrid approach
     */
    public async getConnection(): Promise<ConnectionInfo | undefined> {
        // Try to get connection from vscode-mssql first
        if (this.mssqlApi) {
            const connection = await this.tryGetMssqlConnection();
            if (connection) {
                return connection;
            }
        }

        // Show connection picker with saved profiles or create new
        return await this.showConnectionPicker();
    }

    /**
     * Try to get active connection from vscode-mssql
     */
    private async tryGetMssqlConnection(): Promise<ConnectionInfo | undefined> {
        if (!this.mssqlApi) {
            return undefined;
        }

        try {
            // First, try to get active connection from editor
            const connectionUri = await this.mssqlApi.connectionSharingService.getActiveEditorConnectionId(
                'vscode-mssql-profiler'
            );

            if (connectionUri) {
                // Get server info for this connection
                const serverInfo = this.mssqlApi.connectionSharingService.getServerInfo(connectionUri);

                if (serverInfo) {
                    return this.convertServerInfoToConnectionInfo(serverInfo, connectionUri);
                }
            }

            // If no active connection, prompt user via vscode-mssql dialog
            const shouldUseDialog = await vscode.window.showQuickPick(
                ['Use existing vscode-mssql connection', 'Use saved profile', 'Create new connection'],
                {
                    placeHolder: 'How would you like to connect?',
                    ignoreFocusOut: true
                }
            );

            if (shouldUseDialog === 'Use existing vscode-mssql connection') {
                const connInfo = await this.mssqlApi.promptForConnection();
                if (connInfo) {
                    const ownerUri = await this.mssqlApi.connect(connInfo);
                    return this.convertMssqlConnectionInfo(connInfo, ownerUri);
                }
            }

            return undefined;

        } catch (error) {
            console.warn('Failed to get vscode-mssql connection:', error);
            return undefined;
        }
    }

    /**
     * Show connection picker with saved profiles
     */
    private async showConnectionPicker(): Promise<ConnectionInfo | undefined> {
        const profiles = await this.getSavedProfiles();

        const items: vscode.QuickPickItem[] = [
            {
                label: '$(add) New Connection',
                description: 'Create a new connection profile',
                alwaysShow: true
            },
            ...profiles.map(profile => ({
                label: profile.name,
                description: `${profile.serverName} - ${profile.databaseName}`,
                detail: profile.authenticationType === 'Integrated' ? 'Windows Auth' : `User: ${profile.userName}`
            }))
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a connection profile',
            ignoreFocusOut: true
        });

        if (!selected) {
            return undefined;
        }

        if (selected.label === '$(add) New Connection') {
            return await this.createNewConnection();
        }

        // Find the selected profile
        const profile = profiles.find(p => p.name === selected.label);
        if (!profile) {
            return undefined;
        }

        return await this.loadConnectionFromProfile(profile);
    }

    /**
     * Create new connection profile
     */
    private async createNewConnection(): Promise<ConnectionInfo | undefined> {
        // Get server name
        const serverName = await vscode.window.showInputBox({
            prompt: 'Enter SQL Server name or IP address',
            placeHolder: 'localhost or server.database.windows.net',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Server name cannot be empty';
                }
                return null;
            }
        });

        if (!serverName) {
            return undefined;
        }

        // Get database name
        const databaseName = await vscode.window.showInputBox({
            prompt: 'Enter database name',
            value: 'master',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Database name cannot be empty';
                }
                return null;
            }
        });

        if (!databaseName) {
            return undefined;
        }

        // Check if Azure SQL
        const isAzure = serverName.toLowerCase().includes('database.windows.net');

        // Get authentication type
        const authType = await vscode.window.showQuickPick(
            ['SQL Server Authentication', 'Windows Authentication'],
            {
                placeHolder: 'Select authentication type',
                ignoreFocusOut: true
            }
        );

        if (!authType) {
            return undefined;
        }

        const authenticationType = authType === 'Windows Authentication' ? 'Integrated' : 'SqlLogin';

        let userName = '';
        let password = '';

        if (authenticationType === 'SqlLogin') {
            // Get username
            const inputUserName = await vscode.window.showInputBox({
                prompt: 'Enter username',
                placeHolder: 'sa or your-username',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Username cannot be empty';
                    }
                    return null;
                }
            });

            if (!inputUserName) {
                return undefined;
            }
            userName = inputUserName;

            // Get password
            const inputPassword = await vscode.window.showInputBox({
                prompt: 'Enter password',
                password: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Password cannot be empty';
                    }
                    return null;
                }
            });

            if (!inputPassword) {
                return undefined;
            }
            password = inputPassword;
        }

        // Ask if user wants to save this profile
        const shouldSave = await vscode.window.showQuickPick(
            ['Yes', 'No'],
            {
                placeHolder: 'Save this connection profile for future use?',
                ignoreFocusOut: true
            }
        );

        if (shouldSave === 'Yes') {
            const profileName = await vscode.window.showInputBox({
                prompt: 'Enter a name for this connection profile',
                value: `${serverName} - ${databaseName}`,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Profile name cannot be empty';
                    }
                    return null;
                }
            });

            if (profileName) {
                const profile: ConnectionProfile = {
                    id: this.generateProfileId(),
                    name: profileName,
                    serverName,
                    databaseName,
                    authenticationType,
                    userName,
                    isAzure
                };

                await this.saveProfile(profile, password);
            }
        }

        // Create a simple ownerUri
        const ownerUri = `${serverName}_${databaseName}_${Date.now()}`;

        return {
            ownerUri,
            serverName,
            databaseName,
            userName,
            password,
            authenticationType,
            isAzure
        };
    }

    /**
     * Load connection from saved profile
     */
    private async loadConnectionFromProfile(profile: ConnectionProfile): Promise<ConnectionInfo | undefined> {
        let password = '';

        if (profile.authenticationType === 'SqlLogin') {
            // Get password from secure storage
            const storedPassword = await this.context.secrets.get(`profiler.connection.${profile.id}.password`);

            if (!storedPassword) {
                // Prompt for password if not stored
                const inputPassword = await vscode.window.showInputBox({
                    prompt: `Enter password for ${profile.name}`,
                    password: true,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Password cannot be empty';
                        }
                        return null;
                    }
                });

                if (!inputPassword) {
                    return undefined;
                }
                password = inputPassword;

                // Ask if user wants to save the password
                const shouldSavePassword = await vscode.window.showQuickPick(
                    ['Yes', 'No'],
                    {
                        placeHolder: 'Save password securely?',
                        ignoreFocusOut: true
                    }
                );

                if (shouldSavePassword === 'Yes') {
                    await this.context.secrets.store(`profiler.connection.${profile.id}.password`, password);
                }
            } else {
                password = storedPassword;
            }
        }

        const ownerUri = `${profile.serverName}_${profile.databaseName}_${Date.now()}`;

        const authType = (profile.authenticationType === 'Integrated' || profile.authenticationType === 'SqlLogin')
            ? profile.authenticationType
            : 'SqlLogin' as const;

        return {
            ownerUri,
            serverName: profile.serverName,
            databaseName: profile.databaseName,
            userName: profile.userName || '',
            password,
            authenticationType: authType,
            isAzure: profile.isAzure
        };
    }

    /**
     * Get saved connection profiles
     */
    public async getSavedProfiles(): Promise<ConnectionProfile[]> {
        const config = vscode.workspace.getConfiguration('mssql-profiler');
        const profiles = config.get<ConnectionProfile[]>('connectionProfiles', []);
        return profiles;
    }

    /**
     * Get password for a connection profile from secure storage
     */
    public async getPassword(profileId: string): Promise<string> {
        const password = await this.context.secrets.get(`profiler.connection.${profileId}.password`);
        return password || '';
    }

    /**
     * Save connection profile
     */
    private async saveProfile(profile: ConnectionProfile, password: string): Promise<void> {
        // Save profile to settings (without password)
        const config = vscode.workspace.getConfiguration('mssql-profiler');
        const profiles = config.get<ConnectionProfile[]>('connectionProfiles', []);

        // Check if profile with same name exists
        const existingIndex = profiles.findIndex(p => p.name === profile.name);
        if (existingIndex >= 0) {
            profiles[existingIndex] = profile;
        } else {
            profiles.push(profile);
        }

        await config.update('connectionProfiles', profiles, vscode.ConfigurationTarget.Global);

        // Save password to secure storage
        if (password) {
            await this.context.secrets.store(`profiler.connection.${profile.id}.password`, password);
        }

        vscode.window.showInformationMessage(`Connection profile '${profile.name}' saved`);
    }

    /**
     * Edit connection profile
     */
    public async editProfile(profileName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('mssql-profiler');
        const profiles = config.get<ConnectionProfile[]>('connectionProfiles', []);

        const profile = profiles.find(p => p.name === profileName);
        if (!profile) {
            vscode.window.showErrorMessage(`Connection profile '${profileName}' not found`);
            return;
        }

        // Show what can be edited
        const editOption = await vscode.window.showQuickPick(
            ['Profile Name', 'Server Name', 'Database Name', 'Username', 'Password', 'Authentication Type'],
            {
                placeHolder: `What would you like to edit for '${profileName}'?`,
                ignoreFocusOut: true
            }
        );

        if (!editOption) {
            return;
        }

        let updated = false;

        switch (editOption) {
            case 'Profile Name':
                const newName = await vscode.window.showInputBox({
                    prompt: 'Enter new profile name',
                    value: profile.name,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Profile name cannot be empty';
                        }
                        if (value !== profile.name && profiles.some(p => p.name === value)) {
                            return 'A profile with this name already exists';
                        }
                        return null;
                    }
                });
                if (newName && newName !== profile.name) {
                    profile.name = newName;
                    updated = true;
                }
                break;

            case 'Server Name':
                const newServer = await vscode.window.showInputBox({
                    prompt: 'Enter new server name',
                    value: profile.serverName,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Server name cannot be empty';
                        }
                        return null;
                    }
                });
                if (newServer && newServer !== profile.serverName) {
                    profile.serverName = newServer;
                    profile.isAzure = newServer.toLowerCase().includes('database.windows.net');
                    updated = true;
                }
                break;

            case 'Database Name':
                const newDatabase = await vscode.window.showInputBox({
                    prompt: 'Enter new database name',
                    value: profile.databaseName,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Database name cannot be empty';
                        }
                        return null;
                    }
                });
                if (newDatabase && newDatabase !== profile.databaseName) {
                    profile.databaseName = newDatabase;
                    updated = true;
                }
                break;

            case 'Username':
                if (profile.authenticationType === 'Integrated') {
                    vscode.window.showInformationMessage('Username cannot be changed for Windows Authentication');
                    return;
                }
                const newUsername = await vscode.window.showInputBox({
                    prompt: 'Enter new username',
                    value: profile.userName,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Username cannot be empty';
                        }
                        return null;
                    }
                });
                if (newUsername && newUsername !== profile.userName) {
                    profile.userName = newUsername;
                    updated = true;
                }
                break;

            case 'Password':
                if (profile.authenticationType === 'Integrated') {
                    vscode.window.showInformationMessage('Password cannot be changed for Windows Authentication');
                    return;
                }
                const newPassword = await vscode.window.showInputBox({
                    prompt: 'Enter new password',
                    password: true,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Password cannot be empty';
                        }
                        return null;
                    }
                });
                if (newPassword) {
                    await this.context.secrets.store(`profiler.connection.${profile.id}.password`, newPassword);
                    vscode.window.showInformationMessage('Password updated');
                }
                return; // Don't update profile settings for password change

            case 'Authentication Type':
                const newAuthType = await vscode.window.showQuickPick(
                    ['SQL Server Authentication', 'Windows Authentication'],
                    {
                        placeHolder: 'Select new authentication type',
                        ignoreFocusOut: true
                    }
                );
                if (newAuthType) {
                    const newAuth = newAuthType === 'Windows Authentication' ? 'Integrated' : 'SqlLogin';
                    if (newAuth !== profile.authenticationType) {
                        profile.authenticationType = newAuth;

                        // If switching to SQL Login, prompt for username and password
                        if (newAuth === 'SqlLogin') {
                            const username = await vscode.window.showInputBox({
                                prompt: 'Enter username',
                                placeHolder: 'sa or your-username',
                                validateInput: (value) => {
                                    if (!value || value.trim().length === 0) {
                                        return 'Username cannot be empty';
                                    }
                                    return null;
                                }
                            });

                            if (!username) {
                                return;
                            }

                            profile.userName = username;

                            const password = await vscode.window.showInputBox({
                                prompt: 'Enter password',
                                password: true,
                                validateInput: (value) => {
                                    if (!value || value.trim().length === 0) {
                                        return 'Password cannot be empty';
                                    }
                                    return null;
                                }
                            });

                            if (password) {
                                await this.context.secrets.store(`profiler.connection.${profile.id}.password`, password);
                            }
                        } else {
                            // Switching to Windows Auth - clear username and password
                            profile.userName = undefined;
                            await this.context.secrets.delete(`profiler.connection.${profile.id}.password`);
                        }

                        updated = true;
                    }
                }
                break;
        }

        if (updated) {
            // Update the profile in settings
            const updatedProfiles = profiles.map(p => p.name === profileName ? profile : p);
            await config.update('connectionProfiles', updatedProfiles, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Connection profile '${profile.name}' updated`);
        }
    }

    /**
     * Delete connection profile
     */
    public async deleteProfile(profileName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('mssql-profiler');
        const profiles = config.get<ConnectionProfile[]>('connectionProfiles', []);

        const profile = profiles.find(p => p.name === profileName);
        if (profile) {
            // Remove from settings
            const updatedProfiles = profiles.filter(p => p.name !== profileName);
            await config.update('connectionProfiles', updatedProfiles, vscode.ConfigurationTarget.Global);

            // Remove password from secure storage
            await this.context.secrets.delete(`profiler.connection.${profile.id}.password`);

            vscode.window.showInformationMessage(`Connection profile '${profileName}' deleted`);
        }
    }

    /**
     * Convert vscode-mssql ServerInfo to ConnectionInfo
     */
    private convertServerInfoToConnectionInfo(serverInfo: mssql.IServerInfo, ownerUri: string): ConnectionInfo {
        // Extract server name from ownerUri if possible
        const serverMatch = ownerUri.match(/^([^_]+)/);
        const serverName = serverMatch ? serverMatch[1] : 'localhost';

        return {
            ownerUri,
            serverName: serverName,
            databaseName: 'master', // ServerInfo doesn't have database name
            userName: '',
            password: '', // Password not available from ServerInfo
            authenticationType: serverInfo.isCloud ? 'SqlLogin' as const : 'Integrated' as const,
            isAzure: serverInfo.isCloud || false
        };
    }

    /**
     * Convert vscode-mssql IConnectionInfo to our ConnectionInfo
     */
    private convertMssqlConnectionInfo(connInfo: mssql.IConnectionInfo, ownerUri: string): ConnectionInfo {
        const authType = (connInfo.authenticationType === 'Integrated' || connInfo.authenticationType === 'SqlLogin')
            ? connInfo.authenticationType
            : 'SqlLogin' as const;

        return {
            ownerUri,
            serverName: connInfo.server,
            databaseName: connInfo.database || 'master',
            userName: connInfo.user || '',
            password: connInfo.password || '',
            authenticationType: authType,
            isAzure: connInfo.server.toLowerCase().includes('database.windows.net')
        };
    }

    /**
     * Generate unique profile ID
     */
    private generateProfileId(): string {
        return `profile_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    /**
     * Execute query using vscode-mssql if available, otherwise use direct connection
     */
    public async executeQuery(connectionUri: string, query: string): Promise<any> {
        if (this.mssqlApi) {
            try {
                return await this.mssqlApi.connectionSharingService.executeSimpleQuery(connectionUri, query);
            } catch (error) {
                console.warn('Failed to execute query via vscode-mssql, falling back to direct connection:', error);
            }
        }

        // Fallback: return undefined to indicate caller should use direct mssql connection
        return undefined;
    }
}
