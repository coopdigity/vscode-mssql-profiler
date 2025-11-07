import * as vscode from 'vscode';
import { ProfilerService } from '../services/profilerService';
import { TemplateService } from '../services/templateService';
import { ConnectionManager } from '../services/connectionManager';
import { ProfilerPanel } from '../panels/profilerPanel';
import { ConnectionInfo, SessionState } from '../models/profilerTypes';
import { ConnectionTreeProvider, ConnectionTreeItem } from '../views/connectionTreeProvider';
import { SessionTreeProvider } from '../views/sessionTreeProvider';

/**
 * Main controller for profiler extension commands
 */
export class ProfilerController {
    private profilerService: ProfilerService;
    private templateService: TemplateService;
    private connectionManager: ConnectionManager;
    private panels: Map<string, ProfilerPanel> = new Map();
    private connectionTreeProvider: ConnectionTreeProvider;
    private sessionTreeProvider: SessionTreeProvider;

    constructor(private context: vscode.ExtensionContext) {
        this.profilerService = new ProfilerService();
        this.templateService = new TemplateService(context);
        this.connectionManager = new ConnectionManager(context);
        this.connectionTreeProvider = new ConnectionTreeProvider(this.connectionManager);
        this.sessionTreeProvider = new SessionTreeProvider(this.profilerService);
    }

    /**
     * Activate the profiler controller
     */
    public async activate(): Promise<void> {
        try {
            // Initialize services
            await this.profilerService.initialize();
            await this.templateService.loadTemplates();
            await this.connectionManager.initialize();

            // Register tree views
            this.registerTreeViews();

            // Register commands
            this.registerCommands();

            console.log('Profiler controller activated');

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            vscode.window.showErrorMessage(`Failed to activate profiler: ${message}`);
            console.error('Profiler activation error:', error);
        }
    }

    /**
     * Register tree views
     */
    private registerTreeViews(): void {
        // Register connections tree view
        const connectionTree = vscode.window.createTreeView('mssql-profiler-connections', {
            treeDataProvider: this.connectionTreeProvider,
            showCollapseAll: false
        });

        this.context.subscriptions.push(connectionTree);

        // Register sessions tree view
        const sessionTree = vscode.window.createTreeView('mssql-profiler-sessions', {
            treeDataProvider: this.sessionTreeProvider,
            showCollapseAll: false
        });

        this.context.subscriptions.push(sessionTree);

        // Set up periodic refresh of session tree (every 2 seconds)
        const sessionRefreshInterval = setInterval(() => {
            this.sessionTreeProvider.refresh();
        }, 2000);

        this.context.subscriptions.push({
            dispose: () => clearInterval(sessionRefreshInterval)
        });
    }

    /**
     * Register all profiler commands
     */
    private registerCommands(): void {
        // New Profiler command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.newProfiler', async () => {
                await this.newProfilerCommand();
            })
        );

        // Start Profiling command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.startProfiling', async (sessionName: string) => {
                await this.startProfilingCommand(sessionName);
            })
        );

        // Stop Profiling command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.stopProfiling', async (sessionName: string) => {
                await this.stopProfilingCommand(sessionName);
            })
        );

        // Pause Profiling command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.pauseProfiling', async (sessionName: string) => {
                await this.pauseProfilingCommand(sessionName);
            })
        );

        // Manage Connections command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.manageConnections', async () => {
                await this.manageConnectionsCommand();
            })
        );

        // Reconnect command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.reconnect', async (sessionName: string) => {
                await this.reconnectCommand(sessionName);
            })
        );

        // Tree View Commands
        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.refreshConnections', () => {
                this.connectionTreeProvider.refresh();
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.addConnection', async () => {
                await this.newProfilerCommand();
                this.connectionTreeProvider.refresh();
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.deleteConnection', async (item: ConnectionTreeItem) => {
                const confirm = await vscode.window.showWarningMessage(
                    `Are you sure you want to delete connection '${item.label}'?`,
                    'Delete',
                    'Cancel'
                );

                if (confirm === 'Delete') {
                    await this.connectionManager.deleteProfile(item.label);
                    this.connectionTreeProvider.refresh();
                }
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.editConnection', async (item: ConnectionTreeItem) => {
                await this.connectionManager.editProfile(item.label);
                this.connectionTreeProvider.refresh();
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('mssql-profiler.startFromConnection', async (item: ConnectionTreeItem) => {
                // Get the connection profile
                const profiles = await this.connectionManager.getSavedProfiles();
                const profile = profiles.find(p => p.id === item.id);

                if (!profile) {
                    vscode.window.showErrorMessage(`Connection '${item.label}' not found`);
                    return;
                }

                // Start profiling with this connection
                await this.startProfilingWithConnection(profile);
            })
        );
    }

    /**
     * Manage Connections command - allows users to view, edit, and delete saved connections
     */
    private async manageConnectionsCommand(): Promise<void> {
        const config = vscode.workspace.getConfiguration('mssql-profiler');
        const profiles = config.get<any[]>('connectionProfiles', []);

        if (profiles.length === 0) {
            vscode.window.showInformationMessage('No saved connection profiles. Create a new profiler session to save a connection.');
            return;
        }

        const items: vscode.QuickPickItem[] = profiles.map(profile => ({
            label: profile.name,
            description: `${profile.serverName} - ${profile.databaseName}`,
            detail: profile.authenticationType === 'Integrated' ? 'Windows Auth' : `User: ${profile.userName}`
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a connection to manage',
            ignoreFocusOut: true
        });

        if (!selected) {
            return;
        }

        const action = await vscode.window.showQuickPick(
            ['Edit Connection', 'Delete Connection'],
            {
                placeHolder: `What would you like to do with '${selected.label}'?`,
                ignoreFocusOut: true
            }
        );

        if (action === 'Edit Connection') {
            await this.connectionManager.editProfile(selected.label);
        } else if (action === 'Delete Connection') {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete connection '${selected.label}'?`,
                'Delete',
                'Cancel'
            );

            if (confirm === 'Delete') {
                await this.connectionManager.deleteProfile(selected.label);
            }
        }
    }

    /**
     * Handle New Profiler command
     */
    private async newProfilerCommand(): Promise<void> {
        try {
            // Get connection using connection manager (tries vscode-mssql first, then saved profiles, then manual entry)
            const connection = await this.connectionManager.getConnection();

            if (!connection) {
                return; // User cancelled
            }

            // Get templates
            const templates = this.templateService.getTemplates();

            if (templates.length === 0) {
                vscode.window.showErrorMessage('No profiler templates available');
                return;
            }

            // Show template selection
            const templateNames = templates.map(t => t.name);
            const selectedTemplateName = await vscode.window.showQuickPick(templateNames, {
                placeHolder: 'Select a session template',
                ignoreFocusOut: true
            });

            if (!selectedTemplateName) {
                return; // User cancelled
            }

            const template = this.templateService.getTemplateByName(selectedTemplateName);
            if (!template) {
                vscode.window.showErrorMessage('Template not found');
                return;
            }

            // Prompt for session name
            const sessionName = await vscode.window.showInputBox({
                prompt: 'Enter a name for the profiling session',
                value: `ADS_${template.name}`,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Session name cannot be empty';
                    }
                    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
                        return 'Session name can only contain letters, numbers, and underscores';
                    }
                    return null;
                }
            });

            if (!sessionName) {
                return; // User cancelled
            }

            // Create the session with progress tracking
            let session: any;
            let connectionFailed = false;
            let connectionError: string = '';

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Creating profiler session',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Creating XEvent session...' });

                try {
                    session = await this.profilerService.createSession(
                        connection,
                        sessionName,
                        template
                    );
                } catch (error: any) {
                    connectionFailed = true;
                    connectionError = error?.message || 'Unknown error';

                    // Create a placeholder session for the UI
                    session = {
                        id: sessionName,
                        name: sessionName,
                        connection,
                        template,
                        state: SessionState.Stopped,
                        events: [],
                        createdAt: new Date()
                    };
                }

                progress.report({ message: 'Opening profiler panel...' });

                // Open profiler panel even if connection failed
                const panel = ProfilerPanel.createOrShow(
                    this.context.extensionUri,
                    session,
                    this.profilerService
                );

                this.panels.set(sessionName, panel);

                if (connectionFailed) {
                    // Show error with option to retry or change connection
                    const action = await vscode.window.showErrorMessage(
                        `Failed to connect to SQL Server: ${connectionError}`,
                        'Retry Connection',
                        'Change Connection',
                        'Continue Without Connection'
                    );

                    if (action === 'Retry Connection') {
                        try {
                            await this.profilerService.createSession(connection, sessionName, template);
                            vscode.window.showInformationMessage(`Connected successfully to '${sessionName}'`);

                            // Auto-start if configured
                            const config = vscode.workspace.getConfiguration('mssql-profiler');
                            const autoStart = config.get<boolean>('autoStartSession', true);
                            if (autoStart) {
                                await this.profilerService.startSession(sessionName);
                                panel.updateSessionState();
                            }
                        } catch (retryError: any) {
                            vscode.window.showErrorMessage(`Connection retry failed: ${retryError?.message || 'Unknown error'}`);
                        }
                    } else if (action === 'Change Connection') {
                        // Close current panel and start over
                        panel.dispose();
                        this.panels.delete(sessionName);
                        await this.newProfilerCommand();
                    }
                    return;
                }

                // Auto-start if configured and connection succeeded
                const config = vscode.workspace.getConfiguration('mssql-profiler');
                const autoStart = config.get<boolean>('autoStartSession', true);

                if (autoStart) {
                    progress.report({ message: 'Starting profiler...' });
                    await this.profilerService.startSession(sessionName);

                    // Update panel state to reflect running status
                    panel.updateSessionState();
                }
            });

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            vscode.window.showErrorMessage(`Failed to create profiler: ${message}`);
            console.error('New profiler error:', error);
        }
    }

    /**
     * Start profiling with an existing connection profile (from tree view)
     */
    private async startProfilingWithConnection(profile: any): Promise<void> {
        try {
            // Convert profile to ConnectionInfo
            const connection: ConnectionInfo = {
                ownerUri: profile.id,
                serverName: profile.serverName,
                databaseName: profile.databaseName,
                userName: profile.userName || '',
                password: await this.connectionManager.getPassword(profile.id),
                authenticationType: profile.authenticationType,
                isAzure: profile.isAzure
            };

            // Get templates
            const templates = this.templateService.getTemplates();
            if (templates.length === 0) {
                vscode.window.showErrorMessage('No profiler templates available');
                return;
            }

            // Show template selection
            const templateNames = templates.map(t => t.name);
            const selectedTemplateName = await vscode.window.showQuickPick(templateNames, {
                placeHolder: 'Select a session template',
                ignoreFocusOut: true
            });

            if (!selectedTemplateName) {
                return; // User cancelled
            }

            const template = this.templateService.getTemplateByName(selectedTemplateName);
            if (!template) {
                vscode.window.showErrorMessage('Template not found');
                return;
            }

            // Prompt for session name
            const sessionName = await vscode.window.showInputBox({
                prompt: 'Enter a name for the profiling session',
                value: `ADS_${template.name}`,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Session name cannot be empty';
                    }
                    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
                        return 'Session name can only contain letters, numbers, and underscores';
                    }
                    return null;
                }
            });

            if (!sessionName) {
                return; // User cancelled
            }

            // Create the session with progress tracking
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Creating profiler session',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Creating XEvent session...' });

                const session = await this.profilerService.createSession(
                    connection,
                    sessionName,
                    template
                );

                progress.report({ message: 'Opening profiler panel...' });

                const panel = ProfilerPanel.createOrShow(
                    this.context.extensionUri,
                    session,
                    this.profilerService
                );

                this.panels.set(sessionName, panel);

                // Auto-start if configured
                const config = vscode.workspace.getConfiguration('mssql-profiler');
                const autoStart = config.get<boolean>('autoStartSession', true);

                if (autoStart) {
                    progress.report({ message: 'Starting profiler...' });
                    await this.profilerService.startSession(sessionName);
                    panel.updateSessionState();
                }
            });

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            vscode.window.showErrorMessage(`Failed to start profiling: ${message}`);
            console.error('Start profiling from connection error:', error);
        }
    }

    /**
     * Handle Start Profiling command
     */
    private async startProfilingCommand(sessionName: string): Promise<void> {
        try {
            await this.profilerService.startSession(sessionName);

            // Update panel if it exists
            const panel = this.panels.get(sessionName);
            if (panel) {
                panel.updateSessionState();
            }

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            vscode.window.showErrorMessage(`Failed to start profiling: ${message}`);
            console.error('Start profiling error:', error);
        }
    }

    /**
     * Handle Stop Profiling command
     */
    private async stopProfilingCommand(sessionName: string): Promise<void> {
        try {
            await this.profilerService.stopSession(sessionName);

            // Update panel if it exists
            const panel = this.panels.get(sessionName);
            if (panel) {
                panel.updateSessionState();
            }

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            vscode.window.showErrorMessage(`Failed to stop profiling: ${message}`);
            console.error('Stop profiling error:', error);
        }
    }

    /**
     * Handle Pause Profiling command
     */
    private async pauseProfilingCommand(sessionName: string): Promise<void> {
        try {
            const session = this.profilerService.getSession(sessionName);
            if (!session) {
                return;
            }

            // Toggle between pause and resume
            if (session.state === SessionState.Paused) {
                await this.profilerService.resumeSession(sessionName);
            } else {
                await this.profilerService.pauseSession(sessionName);
            }

            // Update panel if it exists
            const panel = this.panels.get(sessionName);
            if (panel) {
                panel.updateSessionState();
            }

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            vscode.window.showErrorMessage(`Failed to pause profiling: ${message}`);
            console.error('Pause profiling error:', error);
        }
    }

    /**
     * Handle Reconnect command
     */
    private async reconnectCommand(sessionName: string): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Reconnecting to ${sessionName}`,
                cancellable: false
            }, async () => {
                await this.profilerService.reconnectSession(sessionName);
            });

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            const session = this.profilerService.getSession(sessionName);

            if (!session) {
                return;
            }

            // Check if there's a matching saved profile
            const config = vscode.workspace.getConfiguration('mssql-profiler');
            const profiles = config.get<any[]>('connectionProfiles', []);
            const matchingProfile = profiles.find(p =>
                p.serverName === session.connection.serverName &&
                p.databaseName === session.connection.databaseName
            );

            // Offer different options based on whether profile exists
            const actions = matchingProfile
                ? ['Edit Connection Profile', 'Change Connection', 'Update Password', 'Cancel']
                : ['Change Connection', 'Update Password', 'Cancel'];

            const action = await vscode.window.showErrorMessage(
                `Failed to reconnect: ${message}`,
                ...actions
            );

            if (action === 'Edit Connection Profile' && matchingProfile) {
                await this.connectionManager.editProfile(matchingProfile.name);

                // After editing, offer to reconnect
                const retry = await vscode.window.showInformationMessage(
                    'Connection profile updated. Reconnect now?',
                    'Reconnect',
                    'Cancel'
                );

                if (retry === 'Reconnect') {
                    // Reload the profile to get updated values
                    const updatedProfiles = config.get<any[]>('connectionProfiles', []);
                    const updatedProfile = updatedProfiles.find(p => p.name === matchingProfile.name);

                    if (updatedProfile) {
                        // Update session connection with new profile values
                        const password = await this.context.secrets.get(`profiler.connection.${updatedProfile.id}.password`) || '';
                        session.connection.serverName = updatedProfile.serverName;
                        session.connection.databaseName = updatedProfile.databaseName;
                        session.connection.userName = updatedProfile.userName || '';
                        session.connection.password = password;
                        session.connection.authenticationType = updatedProfile.authenticationType;
                        session.connection.isAzure = updatedProfile.isAzure;

                        await this.reconnectCommand(sessionName);
                    }
                }
            } else if (action === 'Change Connection') {
                // Get new connection and update the session
                const newConnection = await this.connectionManager.getConnection();
                if (newConnection) {
                    session.connection = newConnection;

                    const retry = await vscode.window.showInformationMessage(
                        'Connection updated. Reconnect now?',
                        'Reconnect',
                        'Cancel'
                    );

                    if (retry === 'Reconnect') {
                        await this.reconnectCommand(sessionName);
                    }
                }
            } else if (action === 'Update Password') {
                // Just prompt for new password
                const newPassword = await vscode.window.showInputBox({
                    prompt: 'Enter password',
                    password: true,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Password cannot be empty';
                        }
                        return null;
                    }
                });

                if (newPassword) {
                    session.connection.password = newPassword;

                    // If there's a matching profile, update its password too
                    if (matchingProfile) {
                        await this.context.secrets.store(`profiler.connection.${matchingProfile.id}.password`, newPassword);
                    }

                    const retry = await vscode.window.showInformationMessage(
                        'Password updated. Reconnect now?',
                        'Reconnect',
                        'Cancel'
                    );

                    if (retry === 'Reconnect') {
                        await this.reconnectCommand(sessionName);
                    }
                }
            }
        }
    }

    /**
     * Deactivate the controller
     */
    public async deactivate(): Promise<void> {
        // Dispose all panels
        for (const panel of this.panels.values()) {
            panel.dispose();
        }
        this.panels.clear();

        // Dispose profiler service
        await this.profilerService.dispose();

        console.log('Profiler controller deactivated');
    }
}
