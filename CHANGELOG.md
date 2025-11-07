# Change Log

All notable changes to the "SQL Server Profiler" extension will be documented in this file.

## [0.2.0] - 2025-11-06

### Added

#### UI/UX Enhancements
- **Activity Bar Integration**: Custom icon in Activity Bar for dedicated SQL Server Profiler sidebar
- **Connections Tree View**: Manage saved connection profiles with tree view
  - Add, edit, and delete connections from sidebar
  - Start profiling directly from any saved connection
  - Visual database icons and connection details
- **Active Sessions Tree View**: Live view of all running profiler sessions
  - Real-time updates every 2 seconds
  - Color-coded icons (🟢 Running, 🟡 Paused, 🔴 Stopped)
  - Event count and connection info displayed
- **Copy to Clipboard Features**:
  - Copy individual field values from Event Details panel (hover-to-reveal)
  - Copy entire event as formatted JSON with header button
  - Uses native clipboard API for seamless copying

#### Filtering & Data Management
- **Multi-select Database Filter**: Filter events by multiple databases simultaneously
  - Dropdown with checkboxes for each database
  - Select All / Deselect All buttons
  - Auto-select all databases on session start
  - Click outside dropdown to close
- **Multi-select Event Type Filter**: Filter by specific event types
  - Side-by-side dropdown layout with database filter
  - Visual selection count display
  - Smart dropdown behavior
- **Database Name Resolution**: Queries `sys.databases` for accurate database filtering
  - Maps database_id to database name for all events
  - Works with both TSQL and Standard templates
  - No longer shows application names in database filter

#### Connection Management
- **Saved Connection Profiles**: Store frequently used connections
- **Secure Credential Storage**: Passwords stored in VS Code Secret Storage API
- **Connection Editor**: Edit any field (server, database, username, password, auth type)
- **mssql Extension Integration**: Automatically detects and uses existing mssql connections
- **Reconnect Functionality**: Recover from connection failures with retry options

#### Session Control
- **Pause/Resume**: Implemented session pause and resume functionality
- **Session State Synchronization**: Auto-start state correctly reflected in UI
- **Error Recovery**: Panel stays open on connection failure with reconnect options

### Changed
- **Filter UI Redesign**: Moved to collapsible panel with side-by-side dropdowns
- **Event Details Layout**: Added copy buttons to each detail row
- **Tree View Refresh**: Sessions tree updates every 2 seconds automatically
- **Database Filtering Logic**: Only filters when subset of databases selected (not all)

### Fixed
- **Database Filter Bug**: Fixed issue where database filter showed `client_app_name` instead of `database_name`
- **Multi-line SQL Parsing**: Fixed regex to capture multi-line SQL statements using `[\s\S]*?`
- **Auto-start State**: UI now correctly shows "Running" status after auto-start
- **Dropdown Click-outside**: Dropdowns now close when clicking outside their boundaries
- **Active Sessions Display**: Fixed issue where Active Sessions view showed no sessions

### Technical Improvements
- **React 19.2.0**: Upgraded to latest React version with modern hooks
- **TypeScript Strict Mode**: Enhanced type safety throughout codebase
- **VS Code Theme Integration**: All UI elements use VS Code theme variables
- **Performance**: Optimized event polling and rendering
- **Memory Management**: Proper cleanup of event listeners and intervals

## [0.1.0] - 2025-11-06

### Added
- Initial release
- Create profiling sessions using Extended Events
- Support for Standard, TSQL, and Azure SQL templates
- Real-time event monitoring with 2-second polling
- Start/Stop profiling sessions
- Event display in React-based webview panel
- Export events to JSON and CSV formats
- Clear events functionality
- Integration with vscode-mssql extension for connection management
- Auto-start profiling option (configurable)
- Maximum events display limit (configurable, default 1000)

### Features
- Cross-platform support (Windows, macOS, Linux)
- Azure SQL Database support
- Ring buffer target for in-memory event capture
- Automatic event polling (2-second intervals)
- Session state tracking (stopped, starting, running, stopping, paused)
- Sortable event grid columns
- Event Details panel with all captured fields
- Text search across all event fields

### Known Limitations
- Custom template creation not available yet
- Limited XML parsing for XEvent data (regex-based parser)
- Maximum events limited by configuration

