# SQL Server Profiler for VS Code

A modern SQL Server profiling extension for Visual Studio Code using Extended Events (XEvents). This extension provides a complete replacement for the Azure Data Studio profiler that is being deprecated.

![License](https://img.shields.io/badge/license-GPLv3-blue.svg)

## Overview

SQL Server Profiler for VS Code brings powerful database profiling capabilities directly into your development environment. Built with React and TypeScript, it leverages SQL Server's Extended Events system to capture and analyze database activity in real-time.

## Features

### 🎯 Core Profiling Capabilities
- **Real-time Event Monitoring**: Capture SQL statements, stored procedures, and database events as they happen
- **Multiple Session Templates**: Pre-configured templates for Standard, TSQL, and Azure SQL profiling
- **Extended Events (XEvents)**: Uses SQL Server's modern profiling infrastructure
- **Live Event Updates**: Events refresh every 2 seconds with minimal performance impact
- **Database Context**: Automatic database name resolution using `sys.databases` for accurate filtering

### 🎨 Modern UI/UX
- **React-based Webview**: Fast, responsive interface with VS Code theme integration
- **Event Details Panel**: Click any event to see all captured fields with copy functionality
- **Copy to Clipboard**:
  - Copy individual field values with one click
  - Copy entire events as formatted JSON
  - Hover-to-reveal copy buttons for clean UI

### 🔍 Advanced Filtering
- **Multi-select Database Filter**: Filter events by one or more databases simultaneously
- **Event Type Filter**: Show only specific event types (batch_completed, rpc_completed, etc.)
- **Text Search**: Search across all event fields in real-time
- **Smart Dropdowns**: Click outside to close, visual selection counts
- **Auto-select All**: Databases are selected by default on session start

### 📊 Event Grid
- **Sortable Columns**: Click any column header to sort
- **Adaptive Columns**: Grid shows only columns with data for your events
- **Performance Metrics**: Duration, CPU time, reads, writes, row counts
- **Event Count Display**: See total events and max event limit

### 🔌 Connection Management
- **Activity Bar Integration**: Dedicated sidebar with Connections and Active Sessions views
- **Saved Connection Profiles**: Store frequently used connections
- **Secure Credential Storage**: Passwords stored in VS Code's secret storage
- **Quick Actions**: Start profiling from any saved connection with one click
- **Connection Editor**: Edit server, database, credentials, or authentication type
- **mssql Extension Integration**: Automatically detects and uses existing mssql connections

### 🎮 Session Control
- **Toolbar Actions**: Start, Stop, Pause, Clear, Export, and Reconnect buttons
- **Visual State Indicators**: Animated running state, color-coded status
- **Auto-start Option**: Automatically begin profiling when session is created
- **Session Persistence**: Sessions remain active until explicitly stopped
- **Error Recovery**: Reconnect on connection failures with multiple retry options

### 📁 Active Sessions View
- **Live Session List**: See all running profiler sessions in the sidebar
- **Real-time Updates**: Event counts and session states update automatically
- **Color-coded Icons**:
  - 🟢 Green for running sessions
  - 🟡 Yellow for paused sessions
  - 🔴 Red for stopped sessions
- **Connection Info**: Shows server/database for each session

### ⚙️ Configurable Settings
- `mssql-profiler.maxEvents`: Maximum events to display (default: 1000)
- `mssql-profiler.autoStartSession`: Auto-start after creation (default: true)
- `mssql-profiler.connectionProfiles`: Saved connection profiles (managed via UI)

## Requirements

- **Visual Studio Code**: 1.85.0 or higher
- **SQL Server**: 2012 or higher (2016+ recommended for best XEvents support)
- **Azure SQL Database**: Fully supported with Azure-specific templates
- **Permissions**: `ALTER ANY EVENT SESSION` permission on the server/database
- **Optional**: [SQL Server (mssql)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql) extension for connection sharing

## Installation

### From VSIX (Recommended for Development)

1. Download or build the `.vsix` file
2. Open VS Code
3. Go to Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
4. Click the "..." menu → "Install from VSIX..."
5. Select the downloaded `.vsix` file

### From Source (Development)

See [Building from Source](#building-from-source) below.

## Usage

### Quick Start

1. **Open the Profiler Sidebar**: Click the SQL Server Profiler icon in the Activity Bar
2. **Add a Connection**: Click the "+" icon in the Connections view
3. **Start Profiling**: Click the play icon next to any connection
4. **Select Template**: Choose Standard, TSQL, or Azure SQL template
5. **Name Your Session**: Enter a unique session name
6. **View Events**: Events appear in real-time in the profiler grid

### Using Command Palette

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "SQL Server Profiler: New Profiler"
3. Select connection source (existing mssql connection, saved profile, or manual entry)
4. Choose template and name your session

### Filtering Events

1. Click "Filters" to expand the filter panel
2. **Databases**: Select which databases to monitor (all selected by default)
3. **Event Types**: Choose specific event types to display
4. **Text Search**: Type to search across all event fields
5. Click outside dropdown or on the button to close filters

### Copying Event Data

- **Copy Field Value**: Hover over any field in Event Details and click the copy icon
- **Copy as JSON**: Click the copy icon next to "Event Details" header to copy entire event

### Managing Sessions

- **Pause**: Temporarily stop collecting events (session stays active)
- **Resume**: Continue collecting events from a paused session
- **Stop**: Stop the Extended Event session
- **Clear**: Remove all events from the current view
- **Export**: Save events to a file (future feature)

## Building from Source

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- Git

### Build Steps

```bash
# Clone the repository
git clone https://github.com/yourusername/vscode-mssql-profiler.git
cd vscode-mssql_profiler

# Install dependencies
npm install

# Compile TypeScript and bundle React app
npm run compile

# Package the extension
npx vsce package

# This creates vscode-mssql-profiler-0.1.0.vsix
```

### Development Workflow

```bash
# Watch mode for extension (Terminal 1)
npm run watch:extension

# Watch mode for webview (Terminal 2)
npm run watch:webview

# Press F5 in VS Code to launch Extension Development Host
```

### Project Structure

```
vscode-mssql-profiler/
├── src/
│   ├── controllers/          # Command handlers and coordination
│   ├── services/             # Business logic (profiler, templates, connections)
│   ├── panels/               # Webview panel management
│   ├── views/                # Tree view providers (connections, sessions)
│   ├── models/               # TypeScript interfaces and types
│   ├── webview/              # React application
│   │   ├── components/       # React components (EventGrid, FilterBar, etc.)
│   │   └── styles/           # CSS stylesheets
│   └── extension.ts          # Extension entry point
├── resources/                # Icons and assets
├── templates/                # XEvent session templates
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript configuration
└── webpack.config.js        # Webview bundler configuration
```

### Build Configuration

**Extension Build**: TypeScript compilation (`tsc`)
- Source: `src/**/*.ts` (excluding webview)
- Output: `out/` directory
- Config: `tsconfig.json`

**Webview Build**: Webpack + React
- Entry: `src/webview/index.tsx`
- Output: `out/webview/webview.js`
- Config: `webpack.config.js`
- Production build minifies and optimizes React bundle

### Running Tests

```bash
# Run unit tests (when implemented)
npm test

# Lint code
npm run lint
```

## Architecture

### Extended Events (XEvents)

The extension uses SQL Server Extended Events, the modern replacement for SQL Trace:

1. **Session Creation**: Creates XEvent session with ring buffer target
2. **Event Collection**: Polls ring buffer every 2 seconds for new events
3. **XML Parsing**: Parses XEvent XML data into structured events
4. **Database Resolution**: Queries `sys.databases` to map database IDs to names
5. **Event Display**: Renders events in React-based grid with filtering

### Communication Flow

```
VS Code Extension (Node.js)
    ↓
ProfilerService (mssql npm package)
    ↓
SQL Server Extended Events
    ↓
Ring Buffer Target (XML)
    ↓
Webview Panel (React)
```

### Key Technologies

- **Backend**: TypeScript, Node.js, mssql npm package
- **Frontend**: React 19, TypeScript, CSS
- **VS Code APIs**: Webview API, TreeView API, Secret Storage API
- **Database**: SQL Server Extended Events, sys.databases

## Templates

### Standard Template
Captures common database events with performance metrics:
- `sql_batch_completed` - SQL batch execution
- `rpc_completed` - Stored procedure calls
- `attention` - Query cancellations
- `existing_connection` - Connection tracking
- `login` and `logout` - Authentication events

### TSQL Template
Focused on T-SQL statement execution:
- `sql_statement_completed` - Individual statement execution
- `sql_batch_completed` - Batch execution
- Includes statement text, duration, CPU, and I/O metrics

### Standard_Azure Template
Optimized for Azure SQL Database:
- Same events as Standard template
- Uses database-scoped event sessions
- Compatible with Azure SQL Database limitations

## Troubleshooting

### "Failed to create profiler session"
- **Check Permissions**: User needs `ALTER ANY EVENT SESSION` permission
- **Azure SQL**: Ensure using Standard_Azure template, not Standard
- **Session Already Exists**: Drop the session manually or use a different name

### "No events appearing"
- **Check Filters**: Ensure databases/event types are selected
- **Verify Activity**: Run queries on the monitored database
- **Connection Issues**: Use the Reconnect button if connection was lost

### "Database filter shows wrong values"
- This was fixed by querying `sys.databases` directly
- Update to latest version if you see this issue

### Events not updating
- Events refresh every 2 seconds automatically
- Check Active Sessions view to verify session is running (green icon)
- Stop and restart the session if needed

## Known Limitations

- Maximum events limited by configuration (default 1000)
- Ring buffer is memory-limited - very high activity may lose events
- Some Extended Event fields may not be available in all SQL Server versions
- Azure SQL Database requires database-scoped sessions (not server-scoped)

## Contributing

This project is open source under GPLv3. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

Please ensure:
- Code follows TypeScript best practices
- React components use functional components with hooks
- CSS uses VS Code theme variables for proper theming
- All features work on Windows, macOS, and Linux

## License

This project is licensed under the GNU General Public License v3.0 (GPLv3).

**What this means:**
- ✅ You can use this software freely
- ✅ You can modify the source code
- ✅ You can distribute copies
- ✅ You can use it commercially
- ⚠️ **Any derivative work must also be licensed under GPLv3**
- ⚠️ **You must disclose your source code if you distribute the software**
- ⚠️ **You must include the original license and copyright notice**

This license ensures the software remains open source. If you build upon this project, your changes must also be open source under GPLv3.

See the [LICENSE](LICENSE) file for full details.

## Acknowledgments

- Inspired by Azure Data Studio's deprecated profiler
- Built on SQL Server Extended Events technology
- Uses the excellent [mssql](https://www.npmjs.com/package/mssql) npm package
- React and TypeScript for modern web development
- VS Code extension API for deep IDE integration

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/vscode-mssql-profiler/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/vscode-mssql-profiler/discussions)
- **Documentation**: See `PROFILER_FEATURE.md` for implementation details

## Roadmap

Future enhancements under consideration:
- [ ] Export events to CSV/JSON files
- [ ] Event aggregation and statistics views
- [ ] Custom event filtering with expressions
- [ ] Session templates editor
- [ ] Deadlock graph visualization
- [ ] Query execution plan capture
- [ ] Historical session replay

---

**Replacement for Azure Data Studio Profiler** - Built for the VS Code ecosystem with modern web technologies and a focus on developer experience.
