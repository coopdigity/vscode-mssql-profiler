/**
 * Type definitions for vscode-mssql extension API
 * Based on the exported IExtension interface
 */

export namespace mssql {
    /**
     * Main extension API interface
     */
    export interface IExtension {
        /** Path to SQL Tools Service executable */
        sqlToolsServicePath: string;

        /** Connection sharing service for accessing connections */
        connectionSharingService: IConnectionSharingService;

        /** Prompt user for connection */
        promptForConnection(): Promise<IConnectionInfo>;

        /** Connect with connection info */
        connect(connectionInfo: IConnectionInfo): Promise<string>;

        /** List databases for a connection */
        listDatabases(connectionUri: string): Promise<string[]>;

        /** Get server information */
        getServerInfo(connectionUri: string): IServerInfo;

        /** Send raw request to SQL Tools Service */
        sendRequest<P, R>(type: any, params?: P): Promise<R>;
    }

    /**
     * Connection sharing service for getting connection information
     */
    export interface IConnectionSharingService {
        /** Get connection ID for active editor */
        getActiveEditorConnectionId(extensionId: string): Promise<string | undefined>;

        /** Get active database name */
        getActiveDatabase(extensionId: string): Promise<string | undefined>;

        /** Get server information for a connection */
        getServerInfo(connectionUri: string): IServerInfo;

        /** Get connection string */
        getConnectionString(extensionId: string, connectionId: string): Promise<string | undefined>;

        /** Connect with specific credentials */
        connect(extensionId: string, connectionId: string, databaseName?: string): Promise<string | undefined>;

        /** Disconnect */
        disconnect(connectionUri: string): void;

        /** Check connection status */
        isConnected(connectionUri: string): boolean;

        /** Execute simple query */
        executeSimpleQuery(connectionUri: string, queryString: string): Promise<SimpleExecuteResult>;

        /** List databases */
        listDatabases(connectionUri: string): Promise<string[]>;
    }

    /**
     * Connection information
     */
    export interface IConnectionInfo {
        server: string;
        database?: string;
        user?: string;
        password?: string;
        authenticationType: string;
        encrypt?: boolean;
        trustServerCertificate?: boolean;
        port?: number;
        applicationName?: string;
        connectionName?: string;
        profileName?: string;
    }

    /**
     * Server information
     */
    export interface IServerInfo {
        serverMajorVersion: number;
        serverMinorVersion: number;
        serverReleaseVersion: number;
        engineEditionId: number;
        serverVersion: string;
        serverLevel: string;
        serverEdition: string;
        isCloud: boolean;
        azureVersion: number;
        osVersion: string;
        options: { [key: string]: any };
    }

    /**
     * Simple query execution result
     */
    export interface SimpleExecuteResult {
        rowCount: number;
        columnInfo: IDbColumn[];
        rows: IDbCellValue[][];
    }

    /**
     * Database column information
     */
    export interface IDbColumn {
        columnName: string;
        dataType: string;
        isNullable?: boolean;
        isKey?: boolean;
        isIdentity?: boolean;
    }

    /**
     * Database cell value
     */
    export interface IDbCellValue {
        displayValue: string;
        isNull: boolean;
        invariantCultureDisplayValue?: string;
    }
}
