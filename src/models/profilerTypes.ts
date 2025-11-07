/**
 * Type definitions for SQL Server Profiler
 * Based on Azure Data Studio azdata.d.ts ProfilerProvider interface
 */

/**
 * Profiler session template containing the XEvent session definition
 */
export interface ProfilerSessionTemplate {
    /** Template name (e.g., "Standard", "TSQL", "Standard_Azure") */
    name: string;
    /** Default view for the template */
    defaultView: string;
    /** T-SQL CREATE EVENT SESSION statement */
    createStatement: string;
}

/**
 * Individual profiler event captured from Extended Events
 */
export interface ProfilerEvent {
    /** Event class name (e.g., "sql_batch_completed", "rpc_completed") */
    name: string;
    /** Timestamp when the event occurred */
    timestamp: string;
    /** Event field values (TextData, Duration, CPU, Reads, etc.) */
    values: { [key: string]: any };
}

/**
 * Collection of profiler events from a session
 */
export interface ProfilerSessionEvents {
    /** Session identifier */
    sessionId: string;
    /** Array of captured events */
    events: ProfilerEvent[];
    /** Indicates if events were lost due to buffer overflow */
    eventsLost: boolean;
}

/**
 * Parameters when a profiler session is stopped
 */
export interface ProfilerSessionStoppedParams {
    /** Connection owner URI */
    ownerUri: string;
    /** Session ID that was stopped */
    sessionId: number;
}

/**
 * Parameters when a profiler session is created
 */
export interface ProfilerSessionCreatedParams {
    /** Connection owner URI */
    ownerUri: string;
    /** Name of the created session */
    sessionName: string;
    /** Template name used */
    templateName: string;
}

/**
 * Request to create a profiler session
 */
export interface CreateSessionRequest {
    /** Connection owner URI */
    ownerUri: string;
    /** Name for the session */
    sessionName: string;
    /** Template to use for session creation */
    template: ProfilerSessionTemplate;
}

/**
 * Response from creating a profiler session
 */
export interface CreateSessionResponse {
    /** Whether the session was created successfully */
    result: boolean;
    /** Error message if creation failed */
    errorMessage?: string;
}

/**
 * Request to start a profiler session
 */
export interface StartSessionRequest {
    /** Connection owner URI */
    ownerUri: string;
    /** Name of the session to start */
    sessionName: string;
}

/**
 * Request to stop a profiler session
 */
export interface StopSessionRequest {
    /** Connection owner URI */
    ownerUri: string;
    /** Session ID to stop */
    sessionId?: number;
}

/**
 * Request to pause a profiler session
 */
export interface PauseSessionRequest {
    /** Connection owner URI */
    ownerUri: string;
    /** Session ID to pause */
    sessionId?: number;
}

/**
 * SQL Server connection information
 */
export interface ConnectionInfo {
    /** Connection owner URI (unique identifier) */
    ownerUri: string;
    /** Server name */
    serverName: string;
    /** Database name */
    databaseName: string;
    /** User name */
    userName: string;
    /** Password */
    password: string;
    /** Authentication type */
    authenticationType: 'SqlLogin' | 'Integrated';
    /** Whether this is an Azure SQL connection */
    isAzure: boolean;
}

/**
 * Profiler session state
 */
export enum SessionState {
    Stopped = 'stopped',
    Starting = 'starting',
    Running = 'running',
    Stopping = 'stopping',
    Paused = 'paused'
}

/**
 * Active profiler session tracking
 */
export interface ProfilerSession {
    /** Session ID */
    id: string;
    /** Session name */
    name: string;
    /** Connection information */
    connection: ConnectionInfo;
    /** Template used */
    template: ProfilerSessionTemplate;
    /** Current state */
    state: SessionState;
    /** Captured events */
    events: ProfilerEvent[];
    /** Database ID to name lookup map */
    databaseLookup: Map<number, string>;
    /** When the session was created */
    createdAt: Date;
    /** When the session was started */
    startedAt?: Date;
    /** When the session was stopped */
    stoppedAt?: Date;
}
