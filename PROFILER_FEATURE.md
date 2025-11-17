# SQL Server Profiler - Technical Architecture

## Overview

This extension provides SQL Server profiling capabilities using **Extended Events (XEvents)** as the underlying technology. It replaces the deprecated Azure Data Studio profiler with a modern, standalone VS Code extension that works with both SQL Server and Azure SQL Database.

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     VS Code Extension                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐      ┌─────────────────┐            │
│  │ ProfilerController│◄────►│  WebView Panel  │            │
│  │                  │      │  (React UI)     │            │
│  └────────┬─────────┘      └─────────────────┘            │
│           │                                                │
│           │                                                │
│  ┌────────▼─────────┐      ┌─────────────────┐            │
│  │ ProfilerService  │◄────►│ ConnectionTree  │            │
│  │  (Core Logic)    │      │  SessionTree    │            │
│  └────────┬─────────┘      └─────────────────┘            │
│           │                                                │
└───────────┼────────────────────────────────────────────────┘
            │
            │ mssql npm package
            │ (SQL Connection)
            ▼
┌─────────────────────────────────────────────────────────────┐
│                 SQL Server / Azure SQL                      │
│  ┌────────────────────────────────────────┐                │
│  │   Extended Events (XEvents)            │                │
│  │   - Session Creation (CREATE EVENT)    │                │
│  │   - Ring Buffer Target                 │                │
│  │   - Event Collection & Storage         │                │
│  └────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. ProfilerService (`src/services/profilerService.ts`)

The heart of the profiling functionality. Manages XEvent sessions and event collection.

#### Responsibilities:
- **Session Management**: Create, start, stop, pause, resume, and drop XEvent sessions
- **Connection Pooling**: Manage SQL Server connections using `mssql` npm package
- **Event Polling**: Poll the ring buffer target every 2 seconds for new events
- **XML Parsing**: Parse XEvent XML output into structured event objects
- **Database Resolution**: Map database IDs to names using `sys.databases`

#### Key Data Structures:

```typescript
private activeSessions: Map<string, ProfilerSession>
private connections: Map<string, sql.ConnectionPool>
private pollingIntervals: Map<string, NodeJS.Timeout>
```

#### Session Lifecycle:

```
CREATE → STOPPED → START → RUNNING ⇄ PAUSED → STOP → STOPPED → DROP
                     ↓
                 [Polling Active]
```

### 2. Extended Events (XEvents) Implementation

#### Session Creation

The profiler uses T-SQL `CREATE EVENT SESSION` statements to define which events to capture. Templates are stored in JSON format in the `templates/` directory.

**Standard Template Events:**
- `sqlserver.sql_batch_completed` - Completed SQL batches
- `sqlserver.sql_batch_starting` - Starting SQL batches
- `sqlserver.rpc_completed` - Completed remote procedure calls
- `sqlserver.attention` - Query cancellations
- `sqlserver.login` - Login events
- `sqlserver.logout` - Logout events
- `sqlserver.existing_connection` - Existing connections at session start

**Actions (metadata captured with each event):**
- `sqlserver.client_app_name` - Application name
- `sqlserver.database_id` - Database ID
- `sqlserver.database_name` - Database name (when available)
- `sqlserver.session_id` - SQL Server session ID
- `sqlserver.query_hash` - Query hash for plan analysis
- `sqlserver.nt_username` - Windows username
- `sqlserver.server_principal_name` - SQL Server login name

**Ring Buffer Target:**
```sql
ADD TARGET package0.ring_buffer WITH (
    MAX_MEMORY=4096 KB,
    EVENT_RETENTION_MODE=ALLOW_SINGLE_EVENT_LOSS,
    MAX_DISPATCH_LATENCY=5 SECONDS,
    MAX_EVENT_SIZE=0 KB,
    MEMORY_PARTITION_MODE=NONE,
    TRACK_CAUSALITY=ON,
    STARTUP_STATE=OFF
)
```

The ring buffer stores events in-memory in XML format, which we poll and parse.

#### Azure SQL vs SQL Server Differences

The implementation handles platform differences:

| Aspect | SQL Server | Azure SQL Database |
|--------|-----------|-------------------|
| Session Scope | `ON SERVER` | `ON DATABASE` |
| System Views | `sys.server_event_sessions` | `sys.database_event_sessions` |
| DMVs | `sys.dm_xe_session_targets` | `sys.dm_xe_database_session_targets` |
| Encryption | Optional | Required (`encrypt: true`) |

Example session creation:

```typescript
// SQL Server
CREATE EVENT SESSION [MySession] ON SERVER
  ADD EVENT sqlserver.sql_batch_completed(...)
  ADD TARGET package0.ring_buffer;

// Azure SQL
CREATE EVENT SESSION [MySession] ON DATABASE
  ADD EVENT sqlserver.sql_batch_completed(...)
  ADD TARGET package0.ring_buffer;
```

### 3. Event Polling Architecture

#### Polling Mechanism

When a session is started, a polling interval is established:

```typescript
private readonly POLLING_INTERVAL = 2000; // 2 seconds

private startPolling(session: ProfilerSession): void {
    const interval = setInterval(async () => {
        await this.pollEvents(session);
    }, this.POLLING_INTERVAL);

    this.pollingIntervals.set(session.name, interval);
}
```

#### Event Retrieval Query

Events are retrieved from the ring buffer target using DMVs:

```sql
-- SQL Server
SELECT CAST(target_data AS XML) AS event_data
FROM sys.dm_xe_session_targets AS t
INNER JOIN sys.dm_xe_sessions AS s
    ON s.address = t.event_session_address
WHERE s.name = '{sessionName}'
    AND t.target_name = 'ring_buffer';

-- Azure SQL
SELECT CAST(target_data AS XML) AS event_data
FROM sys.dm_xe_database_session_targets AS t
INNER JOIN sys.dm_xe_database_sessions AS s
    ON s.name = t.session_name
WHERE s.name = '{sessionName}'
    AND t.target_name = 'ring_buffer';
```

### 4. XML Event Parsing

The ring buffer returns XML in this format:

```xml
<RingBufferTarget truncated="0" processingTime="0" totalEventsProcessed="150" eventCount="150">
  <event name="sql_batch_completed" package="sqlserver" timestamp="2025-11-17T19:30:45.123Z">
    <data name="statement">
      <value>SELECT * FROM Users WHERE UserId = 123</value>
    </data>
    <data name="duration">
      <value>1234567</value>
    </data>
    <data name="cpu_time">
      <value>234</value>
    </data>
    <action name="database_id">
      <value>5</value>
    </action>
    <action name="client_app_name">
      <value>MyApp</value>
    </action>
  </event>
</RingBufferTarget>
```

The parser extracts:

1. **Event Metadata**: Name, timestamp, package
2. **Data Fields**: Event-specific data (statement, duration, cpu_time)
3. **Actions**: Cross-event metadata (database, session, client)

```typescript
private parseXEventData(xmlData: string, databaseLookup: Map<number, string>): ProfilerEvent[] {
    // Regex pattern to extract events
    const eventMatches = xmlData.match(
        /<event name="([^"]+)"[^>]*?timestamp="([^"]+)"[^>]*?>(.*?)<\/event>/gs
    );

    // Extract data fields: <data name="..."><value>...</value></data>
    const dataMatches = match.matchAll(
        /<data name="([^"]+)"[^>]*?>[\s\S]*?<value>([\s\S]*?)<\/value>/g
    );

    // Extract actions: <action name="..."><value>...</value></action>
    const actionMatches = match.matchAll(
        /<action name="([^"]+)"[^>]*?>[\s\S]*?<value>([\s\S]*?)<\/value>/g
    );
}
```

### 5. Database Name Resolution

#### The Problem

Extended Events often capture `database_id` but not `database_name`. Users need human-readable names.

#### The Solution

1. **Fetch Database List** on session creation:
   ```sql
   SELECT database_id, name FROM sys.databases;
   ```

2. **Store Lookup Map** in session:
   ```typescript
   interface ProfilerSession {
       databaseLookup: Map<number, string>;
   }
   ```

3. **Resolve During Parsing**:
   ```typescript
   if (!event.values['database_name'] && event.values['database_id']) {
       const dbId = parseInt(event.values['database_id']);
       if (databaseLookup.has(dbId)) {
           event.values['database_name'] = databaseLookup.get(dbId);
       }
   }
   ```

This ensures all events display database names even when XEvents only provide IDs.

### 6. Connection Management

#### Connection Pooling

The service uses connection pooling for efficiency:

```typescript
private async getConnection(connection: ConnectionInfo): Promise<sql.ConnectionPool> {
    const key = connection.ownerUri;

    // Reuse existing connection if available
    if (this.connections.has(key)) {
        const pool = this.connections.get(key)!;
        if (pool.connected) {
            return pool;
        }
    }

    // Create new connection pool
    const config: sql.config = {
        server: connection.serverName,
        database: connection.databaseName,
        options: {
            encrypt: connection.isAzure,
            trustServerCertificate: !connection.isAzure,
            enableArithAbort: true
        }
    };

    // Add authentication
    if (connection.authenticationType === 'SqlLogin') {
        config.user = connection.userName;
        config.password = connection.password;
    } else {
        config.authentication = { type: 'ntlm', ... };
    }

    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    this.connections.set(key, pool);

    return pool;
}
```

#### Authentication Types

- **SQL Authentication**: Username/password stored in VS Code secret storage
- **Windows Authentication (NTLM)**: Domain credentials
- **Azure AD**: Via connection string options

### 7. WebView Integration (`src/webview/`)

The UI is built with **React 19** and communicates with the extension via message passing.

#### Message Protocol

**Extension → WebView:**
```typescript
{
    type: 'update',
    events: ProfilerEvent[],
    state: SessionState,
    filters: { databases: string[], eventTypes: string[] }
}
```

**WebView → Extension:**
```typescript
{
    type: 'start' | 'stop' | 'pause' | 'clear',
    sessionId: string
}
```

#### Event Table Features

- **Virtual Scrolling**: Handles thousands of events efficiently
- **Multi-select Filters**: Database and event type filtering with checkboxes
- **Real-time Updates**: Events stream in every 2 seconds during polling
- **Event Details**: Drill-down view with copy-to-clipboard for individual fields
- **JSON Export**: Copy entire event as JSON object

### 8. Activity Bar Integration

#### Tree Views

**Connections Tree** (`src/views/connectionTreeProvider.ts`):
- Displays saved connection profiles
- Icons indicate connection state
- Actions: Add, Edit, Delete, Start Profiling

**Sessions Tree** (`src/views/sessionTreeProvider.ts`):
- Shows active profiler sessions
- Auto-refreshes every 2 seconds
- Color-coded icons:
  - 🟢 Green: Running
  - 🟡 Yellow: Paused
  - 🔴 Red: Stopped

### 9. Session Templates

Templates define what events to capture. Stored in `templates/` directory.

#### Standard Template

Captures most common database operations:
- SQL batch execution (start/complete)
- RPC calls (stored procedures)
- Login/logout events
- Query cancellations (attention)

#### TSQL Template

Focused on T-SQL execution:
- `sql_batch_completed`
- `sql_batch_starting`
- Minimal overhead for high-throughput scenarios

#### Standard_Azure Template

Optimized for Azure SQL Database:
- Database-scoped events only
- Azure-compatible event filters
- Respects Azure SQL resource limits

## Data Flow

### Session Creation Flow

```
1. User clicks "New Profiler"
   ↓
2. ProfilerController.createNewProfiler()
   ↓
3. User selects: Connection, Template, Session Name
   ↓
4. ProfilerService.createSession()
   ↓
5. Execute: CREATE EVENT SESSION [name] ON SERVER/DATABASE ...
   ↓
6. Fetch: SELECT database_id, name FROM sys.databases
   ↓
7. Store: ProfilerSession with databaseLookup
   ↓
8. WebView opens with session info
```

### Event Collection Flow

```
1. User clicks "Start"
   ↓
2. ProfilerService.startSession()
   ↓
3. Execute: ALTER EVENT SESSION [name] STATE = START
   ↓
4. Start polling interval (every 2s)
   ↓
5. Poll: SELECT CAST(target_data AS XML) FROM sys.dm_xe_session_targets
   ↓
6. Parse XML → ProfilerEvent[]
   ↓
7. Resolve database names using databaseLookup
   ↓
8. Deduplicate by timestamp
   ↓
9. Add to session.events (max 1000 events)
   ↓
10. Send update message to WebView
   ↓
11. React UI re-renders event table
   ↓
12. Repeat every 2s while running
```

### Stop/Cleanup Flow

```
1. User clicks "Stop"
   ↓
2. ProfilerService.stopSession()
   ↓
3. Stop polling interval
   ↓
4. Execute: ALTER EVENT SESSION [name] STATE = STOP
   ↓
5. Session state → STOPPED (events retained)
   ↓
6. User can restart or drop session
   ↓
7. On drop: DROP EVENT SESSION [name] ON SERVER/DATABASE
   ↓
8. Remove from activeSessions map
```

## Performance Considerations

### Event Limits

- **Ring Buffer Size**: 4MB per session
- **Max Events in UI**: 1000 (configurable via `mssql-profiler.maxEvents`)
- **Polling Interval**: 2 seconds (tunable in code)

### Optimization Strategies

1. **Event Deduplication**: Compare timestamps to avoid duplicate events
2. **Connection Pooling**: Reuse SQL connections across polls
3. **Incremental Updates**: Only send new events to WebView
4. **Event Filters**: WHERE clauses exclude system events (`is_system = 0`)

### Memory Management

- Old events are dropped when exceeding `maxEvents` limit
- Connections are closed on session disposal
- Polling intervals cleared when stopped

## Security

### Credential Storage

- Passwords stored in **VS Code Secret Storage API** (OS keychain)
- Never stored in plaintext configuration files
- Connection profiles in `settings.json` exclude passwords

### SQL Injection Prevention

- All session names are bracketed: `[{sessionName}]`
- User input validated before SQL execution
- Parameterized queries where possible (though XEvents DDL doesn't support params)

## Error Handling

### Connection Failures

- Automatic retry with exponential backoff (TODO)
- User-facing error messages via `vscode.window.showErrorMessage()`
- Detailed errors logged to console

### Session Conflicts

- Check for existing sessions before creation
- Drop existing session if name conflicts
- Graceful cleanup on extension deactivation

### Azure SQL Limitations

- Some events unavailable on Azure SQL Database
- Templates automatically detect and adapt to platform
- Clear error messages when unsupported operations attempted

## Future Enhancements

### Planned Features

1. **Event Export**: Save events to CSV/JSON files
2. **Advanced Filtering**: SQL-like query syntax for event filtering
3. **Performance Metrics**: Charts for CPU, duration, reads/writes
4. **Query Plan Integration**: Link events to execution plans
5. **Multi-session Views**: Compare multiple profiler sessions side-by-side
6. **Custom Templates**: Visual editor for creating XEvent session templates
7. **Event Alerting**: Notifications when specific events occur (e.g., long-running queries)

### Optimization Opportunities

1. **WebSocket Alternative**: Replace polling with event-driven notifications
2. **Worker Threads**: Offload XML parsing to background threads
3. **IndexedDB Storage**: Persist events beyond session lifetime
4. **Compression**: Compress event data before sending to WebView

## References

- [SQL Server Extended Events Documentation](https://learn.microsoft.com/en-us/sql/relational-databases/extended-events/extended-events)
- [sys.dm_xe_session_targets DMV](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-xe-session-targets-transact-sql)
- [mssql npm package](https://www.npmjs.com/package/mssql)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [React 19 Documentation](https://react.dev/)

## Troubleshooting

### Common Issues

**Issue**: Events not appearing in UI
- **Check**: Is the session state "Running"?
- **Check**: Are events being generated on the server?
- **Check**: Console logs for XML parsing errors

**Issue**: "Cannot find module 'mssql'" error
- **Check**: Runtime dependencies included in `.vscodeignore`
- **Check**: `npm install` completed successfully
- **Fix**: Ensure `node_modules/mssql` is packaged in VSIX

**Issue**: Connection timeout
- **Check**: Server name and port correct
- **Check**: Firewall allows connections
- **Check**: Encryption settings match server configuration

**Issue**: Database names showing as IDs
- **Check**: `sys.databases` query successful
- **Check**: `databaseLookup` map populated
- **Verify**: Console logs show database list on session creation

---

**Last Updated**: 2025-11-17
**Extension Version**: 0.2.3
