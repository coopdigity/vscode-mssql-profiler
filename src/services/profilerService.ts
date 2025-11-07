import * as vscode from 'vscode';
import * as sql from 'mssql';
import {
    ProfilerSessionTemplate,
    ProfilerEvent,
    ProfilerSession,
    SessionState,
    ConnectionInfo
} from '../models/profilerTypes';

/**
 * Service for managing SQL Server profiler sessions using Extended Events
 * Uses the mssql npm package for direct SQL execution
 */
export class ProfilerService {
    private activeSessions: Map<string, ProfilerSession> = new Map();
    private connections: Map<string, sql.ConnectionPool> = new Map();
    private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

    private readonly POLLING_INTERVAL = 2000; // Poll for events every 2 seconds

    /**
     * Initialize the profiler service
     */
    public async initialize(): Promise<void> {
        console.log('Profiler service initialized');
    }

    /**
     * Get or create a SQL connection pool for a session
     */
    private async getConnection(connection: ConnectionInfo): Promise<sql.ConnectionPool> {
        const key = connection.ownerUri;

        if (this.connections.has(key)) {
            const pool = this.connections.get(key)!;
            if (pool.connected) {
                return pool;
            }
        }

        const config: sql.config = {
            server: connection.serverName,
            database: connection.databaseName,
            options: {
                encrypt: connection.isAzure,
                trustServerCertificate: !connection.isAzure,
                enableArithAbort: true
            }
        };

        if (connection.authenticationType === 'SqlLogin') {
            config.user = connection.userName;
            config.password = connection.password;
        } else {
            // Windows Authentication (NTLM)
            config.authentication = {
                type: 'ntlm',
                options: {
                    domain: '',
                    userName: connection.userName || '',
                    password: connection.password || ''
                }
            };
        }

        const pool = new sql.ConnectionPool(config);
        await pool.connect();
        this.connections.set(key, pool);

        return pool;
    }

    /**
     * Execute SQL query
     */
    private async executeQuery(connection: ConnectionInfo, query: string): Promise<sql.IResult<any>> {
        const pool = await this.getConnection(connection);
        return pool.request().query(query);
    }

    /**
     * Fetch list of databases from sys.databases and create lookup map
     */
    private async fetchDatabaseList(connection: ConnectionInfo): Promise<Map<number, string>> {
        try {
            const query = 'SELECT database_id, name FROM sys.databases;';
            const result = await this.executeQuery(connection, query);

            const lookup = new Map<number, string>();
            if (result.recordset) {
                for (const row of result.recordset) {
                    lookup.set(row.database_id, row.name);
                }
            }

            console.log('Fetched database list:', Array.from(lookup.entries()));
            return lookup;
        } catch (error) {
            console.error('Error fetching database list:', error);
            return new Map<number, string>();
        }
    }


    /**
     * Create and start a profiler session
     */
    public async createSession(
        connection: ConnectionInfo,
        sessionName: string,
        template: ProfilerSessionTemplate
    ): Promise<ProfilerSession> {
        // Check if session already exists
        if (this.activeSessions.has(sessionName)) {
            throw new Error(`Session '${sessionName}' already exists`);
        }

        try {
            // Create the XEvent session using T-SQL
            const createSql = this.buildCreateSessionSql(sessionName, template, connection.isAzure);

            vscode.window.showInformationMessage(`Creating profiler session '${sessionName}'...`);

            // Execute SQL to create session
            console.log('Executing SQL:', createSql);
            await this.executeQuery(connection, createSql);

            // Fetch database list for lookup
            const databaseLookup = await this.fetchDatabaseList(connection);

            // Create session tracking object
            const session: ProfilerSession = {
                id: sessionName,
                name: sessionName,
                connection,
                template,
                state: SessionState.Stopped,
                events: [],
                databaseLookup,
                createdAt: new Date()
            };

            this.activeSessions.set(sessionName, session);

            vscode.window.showInformationMessage(`Profiler session '${sessionName}' created successfully`);

            return session;

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            throw new Error(`Failed to create profiler session: ${message}`);
        }
    }

    /**
     * Start a profiler session
     */
    public async startSession(sessionName: string): Promise<void> {
        const session = this.activeSessions.get(sessionName);
        if (!session) {
            throw new Error(`Session '${sessionName}' not found`);
        }

        try {
            const startSql = `ALTER EVENT SESSION [${sessionName}] ON ${session.connection.isAzure ? 'DATABASE' : 'SERVER'} STATE = START;`;

            // Execute SQL to start session
            console.log('Executing SQL:', startSql);
            await this.executeQuery(session.connection, startSql);

            session.state = SessionState.Running;
            session.startedAt = new Date();

            // Start polling for events
            this.startPolling(session);

            vscode.window.showInformationMessage(`Profiler session '${sessionName}' started`);

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            throw new Error(`Failed to start profiler session: ${message}`);
        }
    }

    /**
     * Pause a profiler session (stops polling but keeps session running)
     */
    public async pauseSession(sessionName: string): Promise<void> {
        const session = this.activeSessions.get(sessionName);
        if (!session) {
            throw new Error(`Session '${sessionName}' not found`);
        }

        // Just stop polling, don't stop the XEvent session
        this.stopPolling(sessionName);
        session.state = SessionState.Paused;

        vscode.window.showInformationMessage(`Profiler session '${sessionName}' paused`);
    }

    /**
     * Resume a paused profiler session
     */
    public async resumeSession(sessionName: string): Promise<void> {
        const session = this.activeSessions.get(sessionName);
        if (!session) {
            throw new Error(`Session '${sessionName}' not found`);
        }

        if (session.state !== SessionState.Paused) {
            throw new Error(`Session '${sessionName}' is not paused`);
        }

        session.state = SessionState.Running;
        this.startPolling(session);

        vscode.window.showInformationMessage(`Profiler session '${sessionName}' resumed`);
    }

    /**
     * Stop a profiler session
     */
    public async stopSession(sessionName: string): Promise<void> {
        const session = this.activeSessions.get(sessionName);
        if (!session) {
            throw new Error(`Session '${sessionName}' not found`);
        }

        try {
            // Stop polling
            this.stopPolling(sessionName);

            const stopSql = `ALTER EVENT SESSION [${sessionName}] ON ${session.connection.isAzure ? 'DATABASE' : 'SERVER'} STATE = STOP;`;

            // Execute SQL to stop session
            console.log('Executing SQL:', stopSql);
            await this.executeQuery(session.connection, stopSql);

            session.state = SessionState.Stopped;
            session.stoppedAt = new Date();

            vscode.window.showInformationMessage(`Profiler session '${sessionName}' stopped`);

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            throw new Error(`Failed to stop profiler session: ${message}`);
        }
    }

    /**
     * Drop a profiler session
     */
    public async dropSession(sessionName: string): Promise<void> {
        const session = this.activeSessions.get(sessionName);
        if (!session) {
            throw new Error(`Session '${sessionName}' not found`);
        }

        try {
            // Stop if running
            if (session.state === SessionState.Running) {
                await this.stopSession(sessionName);
            }

            const dropSql = `DROP EVENT SESSION [${sessionName}] ON ${session.connection.isAzure ? 'DATABASE' : 'SERVER'};`;

            // Execute SQL to drop session
            console.log('Executing SQL:', dropSql);
            await this.executeQuery(session.connection, dropSql);

            this.activeSessions.delete(sessionName);

            vscode.window.showInformationMessage(`Profiler session '${sessionName}' dropped`);

        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            throw new Error(`Failed to drop profiler session: ${message}`);
        }
    }

    /**
     * Get a session by name
     */
    public getSession(sessionName: string): ProfilerSession | undefined {
        return this.activeSessions.get(sessionName);
    }

    /**
     * Reconnect to database for a session
     */
    public async reconnectSession(sessionName: string): Promise<void> {
        const session = this.activeSessions.get(sessionName);
        if (!session) {
            throw new Error(`Session '${sessionName}' not found`);
        }

        // Close existing connection if it exists
        const key = session.connection.ownerUri;
        if (this.connections.has(key)) {
            const pool = this.connections.get(key);
            if (pool) {
                await pool.close();
            }
            this.connections.delete(key);
        }

        // Try to create a new connection
        try {
            const pool = await this.getConnection(session.connection);

            // Test the connection
            await pool.request().query('SELECT 1');

            vscode.window.showInformationMessage(`Reconnected to '${sessionName}' successfully`);
        } catch (error: any) {
            const message = error?.message || 'Unknown error';
            throw new Error(`Failed to reconnect: ${message}`);
        }
    }

    /**
     * Get all active sessions
     */
    public getAllSessions(): ProfilerSession[] {
        return Array.from(this.activeSessions.values());
    }

    /**
     * Build the CREATE EVENT SESSION SQL statement
     */
    private buildCreateSessionSql(sessionName: string, template: ProfilerSessionTemplate, isAzure: boolean): string {
        let sql = template.createStatement.replace(/\{sessionName\}/g, sessionName);

        // Drop existing session if it exists
        const dropSql = `
IF EXISTS (
    SELECT * FROM sys.${isAzure ? 'database' : 'server'}_event_sessions
    WHERE name = '${sessionName}'
)
BEGIN
    DROP EVENT SESSION [${sessionName}] ON ${isAzure ? 'DATABASE' : 'SERVER'};
END
`;

        return dropSql + '\n' + sql;
    }

    /**
     * Start polling for profiler events
     */
    private startPolling(session: ProfilerSession): void {
        const interval = setInterval(async () => {
            try {
                await this.pollEvents(session);
            } catch (error) {
                console.error('Error polling profiler events:', error);
            }
        }, this.POLLING_INTERVAL);

        this.pollingIntervals.set(session.name, interval);
    }

    /**
     * Stop polling for events
     */
    private stopPolling(sessionName: string): void {
        const interval = this.pollingIntervals.get(sessionName);
        if (interval) {
            clearInterval(interval);
            this.pollingIntervals.delete(sessionName);
        }
    }

    /**
     * Poll for new profiler events from the ring buffer
     */
    private async pollEvents(session: ProfilerSession): Promise<void> {
        try {
            // Different query structure for SQL Server vs Azure SQL
            let querySql: string;

            if (session.connection.isAzure) {
                // Azure SQL Database
                querySql = `
SELECT CAST(target_data AS XML) AS event_data
FROM sys.dm_xe_database_session_targets AS t
INNER JOIN sys.dm_xe_database_sessions AS s
    ON s.name = t.session_name
WHERE s.name = '${session.name}'
    AND t.target_name = 'ring_buffer';
`;
            } else {
                // SQL Server
                querySql = `
SELECT CAST(target_data AS XML) AS event_data
FROM sys.dm_xe_session_targets AS t
INNER JOIN sys.dm_xe_sessions AS s
    ON s.address = t.event_session_address
WHERE s.name = '${session.name}'
    AND t.target_name = 'ring_buffer';
`;
            }

            // Execute SQL to poll events
            const result = await this.executeQuery(session.connection, querySql);

            console.log('Poll result:', {
                hasRecordset: !!result.recordset,
                recordsetLength: result.recordset?.length,
                hasData: result.recordset && result.recordset.length > 0
            });

            if (result.recordset && result.recordset.length > 0) {
                const xmlData = result.recordset[0].event_data;
                console.log('XML data type:', typeof xmlData, 'Length:', xmlData?.length || 0);

                if (xmlData) {
                    const newEvents = this.parseXEventData(xmlData, session.databaseLookup);
                    console.log('Parsed events:', newEvents.length);

                    // Add only new events (compare by timestamp to avoid duplicates)
                    const existingTimestamps = new Set(session.events.map(e => e.timestamp));
                    const uniqueNewEvents = newEvents.filter(e => !existingTimestamps.has(e.timestamp));

                    console.log('Unique new events:', uniqueNewEvents.length);

                    if (uniqueNewEvents.length > 0) {
                        // Add new events to the beginning (reverse chronological order)
                        session.events.unshift(...uniqueNewEvents);
                        console.log('Total events in session:', session.events.length);

                        // Limit events to maxEvents setting
                        const config = vscode.workspace.getConfiguration('mssql-profiler');
                        const maxEvents = config.get<number>('maxEvents', 1000);

                        if (session.events.length > maxEvents) {
                            session.events = session.events.slice(-maxEvents);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Error querying profiler events:', error);
        }
    }

    /**
     * Parse XEvent XML data into ProfilerEvent objects
     */
    private parseXEventData(xmlData: string, databaseLookup: Map<number, string>): ProfilerEvent[] {
        const events: ProfilerEvent[] = [];

        try {
            // Match events with correct pattern: <event name="..." package="..." timestamp="...">
            const eventMatches = xmlData.match(/<event name="([^"]+)"[^>]*?timestamp="([^"]+)"[^>]*?>(.*?)<\/event>/gs);

            if (eventMatches) {
                console.log('Found', eventMatches.length, 'events to parse');

                for (const match of eventMatches) {
                    // Extract event name and timestamp
                    const nameMatch = match.match(/<event name="([^"]+)"/);
                    const timestampMatch = match.match(/timestamp="([^"]+)"/);

                    if (nameMatch && timestampMatch) {
                        const event: ProfilerEvent = {
                            name: nameMatch[1],
                            timestamp: timestampMatch[1],
                            values: {}
                        };

                        // Parse data fields: <data name="..."><value>...</value></data>
                        // Note: Use [\s\S] to match multi-line values
                        const dataMatches = match.matchAll(/<data name="([^"]+)"[^>]*?>[\s\S]*?<value>([\s\S]*?)<\/value>/g);
                        for (const dataMatch of dataMatches) {
                            const fieldName = dataMatch[1];
                            let fieldValue = dataMatch[2];

                            // Clean up the value (trim whitespace)
                            fieldValue = fieldValue.trim();

                            event.values[fieldName] = fieldValue;
                        }

                        // Parse action fields: <action name="..."><value>...</value></action>
                        const actionMatches = match.matchAll(/<action name="([^"]+)"[^>]*?>[\s\S]*?<value>([\s\S]*?)<\/value>/g);
                        for (const actionMatch of actionMatches) {
                            const fieldName = actionMatch[1];
                            let fieldValue = actionMatch[2];

                            fieldValue = fieldValue.trim();

                            event.values[fieldName] = fieldValue;
                        }

                        // Parse text fields: <text>...</text> (for additional text like status)
                        // Note: Don't overwrite existing values
                        const textMatches = match.matchAll(/<data name="([^"]+)"[^>]*?>[\s\S]*?<text>([\s\S]*?)<\/text>/g);
                        for (const textMatch of textMatches) {
                            const fieldName = textMatch[1] + '_text';
                            event.values[fieldName] = textMatch[2].trim();
                        }

                        // If database_name is not present but database_id is, look it up
                        if (!event.values['database_name'] && event.values['database_id']) {
                            const dbId = parseInt(event.values['database_id']);
                            if (!isNaN(dbId) && databaseLookup.has(dbId)) {
                                event.values['database_name'] = databaseLookup.get(dbId);
                            }
                        }

                        events.push(event);
                    }
                }

                console.log('Successfully parsed', events.length, 'events');
                if (events.length > 0) {
                    console.log('Sample event:', {
                        name: events[0].name,
                        timestamp: events[0].timestamp,
                        fields: Object.keys(events[0].values),
                        database_name: events[0].values['database_name'],
                        database_id: events[0].values['database_id'],
                        client_app_name: events[0].values['client_app_name']
                    });
                }
            } else {
                console.log('No events matched pattern');
            }

        } catch (error) {
            console.error('Error parsing XEvent data:', error);
        }

        return events;
    }

    /**
     * Dispose of all resources
     */
    public async dispose(): Promise<void> {
        // Stop all polling
        for (const sessionName of this.pollingIntervals.keys()) {
            this.stopPolling(sessionName);
        }

        // Close all connections
        for (const [key, pool] of this.connections.entries()) {
            try {
                await pool.close();
            } catch (error) {
                console.error(`Error closing connection ${key}:`, error);
            }
        }

        this.connections.clear();
        this.activeSessions.clear();
    }
}
