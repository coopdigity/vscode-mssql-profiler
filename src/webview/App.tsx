import * as React from 'react';
import { EventGrid } from './components/EventGrid';
import { Toolbar } from './components/Toolbar';
import { FilterBar, FilterOptions } from './components/FilterBar';
import { ProfilerEvent, SessionState } from '../models/profilerTypes';

interface VSCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

const vscode = acquireVsCodeApi();

export const App: React.FC = () => {
    const [events, setEvents] = React.useState<ProfilerEvent[]>([]);
    const [sessionState, setSessionState] = React.useState<SessionState>(SessionState.Stopped);
    const [sessionName, setSessionName] = React.useState<string>('');
    const [maxEvents, setMaxEvents] = React.useState<number>(1000);
    const [availableDatabases, setAvailableDatabases] = React.useState<string[]>([]);
    const [filters, setFilters] = React.useState<FilterOptions>({
        eventTypes: [],
        textSearch: '',
        databaseFilter: []  // Start with empty, will be populated with all databases
    });

    // Handle messages from extension
    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.type) {
                case 'init':
                    setSessionName(message.sessionName);
                    setSessionState(message.sessionState);
                    setMaxEvents(message.maxEvents);
                    if (message.events) {
                        setEvents(message.events);
                    }
                    if (message.databases) {
                        setAvailableDatabases(message.databases);
                    }
                    break;

                case 'eventsUpdated':
                    setEvents(message.events);
                    break;

                case 'stateChanged':
                    setSessionState(message.state);
                    break;

                case 'clear':
                    setEvents([]);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Notify extension when ready
    React.useEffect(() => {
        vscode.postMessage({ type: 'ready' });
    }, []);

    const handleStart = () => {
        vscode.postMessage({ type: 'start' });
    };

    const handleStop = () => {
        vscode.postMessage({ type: 'stop' });
    };

    const handlePause = () => {
        vscode.postMessage({ type: 'pause' });
    };

    const handleClear = () => {
        vscode.postMessage({ type: 'clear' });
    };

    const handleExport = () => {
        vscode.postMessage({ type: 'export' });
    };

    const handleReconnect = () => {
        vscode.postMessage({ type: 'reconnect' });
    };

    // Get unique event types for filter options
    const availableEventTypes = React.useMemo(() => {
        const types = new Set<string>();
        events.forEach(event => types.add(event.name));
        return Array.from(types).sort();
    }, [events]);

    // Auto-select all databases when available databases change
    React.useEffect(() => {
        if (availableDatabases.length > 0 && filters.databaseFilter.length === 0) {
            setFilters(prev => ({ ...prev, databaseFilter: [...availableDatabases] }));
        }
    }, [availableDatabases]);

    // Filter events based on filter settings
    const filteredEvents = React.useMemo(() => {
        let filtered = events;

        // Filter by event type
        if (filters.eventTypes.length > 0) {
            filtered = filtered.filter(event => filters.eventTypes.includes(event.name));
        }

        // Filter by database (only if specific databases are selected, not all)
        if (filters.databaseFilter.length > 0 && filters.databaseFilter.length < availableDatabases.length) {
            filtered = filtered.filter(event => {
                const dbName = event.values['database_name'];
                return dbName && filters.databaseFilter.includes(String(dbName));
            });
        }

        // Filter by text search (search all fields)
        if (filters.textSearch) {
            const searchLower = filters.textSearch.toLowerCase();
            filtered = filtered.filter(event => {
                // Search in event name
                if (event.name.toLowerCase().includes(searchLower)) return true;

                // Search in timestamp
                if (event.timestamp.toLowerCase().includes(searchLower)) return true;

                // Search in all values
                return Object.values(event.values).some(value =>
                    String(value).toLowerCase().includes(searchLower)
                );
            });
        }

        return filtered;
    }, [events, filters]);

    return (
        <div className="profiler-container">
            <div className="profiler-header">
                <h2>SQL Server Profiler - {sessionName}</h2>
            </div>
            <Toolbar
                sessionState={sessionState}
                onStart={handleStart}
                onStop={handleStop}
                onPause={handlePause}
                onClear={handleClear}
                onExport={handleExport}
                onReconnect={handleReconnect}
            />
            <FilterBar
                availableEventTypes={availableEventTypes}
                availableDatabases={availableDatabases}
                filters={filters}
                onFilterChange={setFilters}
            />
            <EventGrid
                events={filteredEvents}
                maxEvents={maxEvents}
            />
        </div>
    );
};
