import * as React from 'react';
import { ProfilerEvent } from '../../models/profilerTypes';

interface EventGridProps {
    events: ProfilerEvent[];
    maxEvents: number;
}

interface Column {
    key: string;
    label: string;
    width: string;
}

export const EventGrid: React.FC<EventGridProps> = ({ events, maxEvents }) => {
    const [selectedRow, setSelectedRow] = React.useState<number | null>(null);
    const [sortColumn, setSortColumn] = React.useState<string | null>(null);
    const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

    // Define columns dynamically based on event data
    const columns: Column[] = React.useMemo(() => {
        if (events.length === 0) {
            return [
                { key: 'name', label: 'Event Class', width: '200px' },
                { key: 'timestamp', label: 'Start Time', width: '180px' },
            ];
        }

        // Get all unique keys from all events
        const allKeys = new Set<string>();
        events.forEach(event => {
            allKeys.add('name');
            allKeys.add('timestamp');
            Object.keys(event.values).forEach(key => allKeys.add(key));
        });

        // Define column order and labels
        const columnOrder: Array<{ key: string; label: string; width: string }> = [
            { key: 'name', label: 'Event Class', width: '200px' },
            { key: 'timestamp', label: 'Start Time', width: '180px' },
            { key: 'batch_text', label: 'Text Data', width: '400px' },
            { key: 'statement', label: 'Statement', width: '400px' },
            { key: 'database_id', label: 'Database ID', width: '100px' },
            { key: 'duration', label: 'Duration (ms)', width: '120px' },
            { key: 'cpu_time', label: 'CPU (ms)', width: '100px' },
            { key: 'physical_reads', label: 'Reads', width: '100px' },
            { key: 'logical_reads', label: 'Logical Reads', width: '120px' },
            { key: 'writes', label: 'Writes', width: '100px' },
            { key: 'row_count', label: 'Rows', width: '80px' },
            { key: 'server_principal_name', label: 'Login Name', width: '150px' },
            { key: 'client_app_name', label: 'Application', width: '150px' },
            { key: 'session_id', label: 'Session', width: '80px' },
        ];

        return columnOrder.filter(col => allKeys.has(col.key));
    }, [events]);

    // Sort events
    const sortedEvents = React.useMemo(() => {
        if (!sortColumn) return events;

        return [...events].sort((a, b) => {
            let aVal = sortColumn === 'name' ? a.name :
                       sortColumn === 'timestamp' ? a.timestamp :
                       a.values[sortColumn] || '';
            let bVal = sortColumn === 'name' ? b.name :
                       sortColumn === 'timestamp' ? b.timestamp :
                       b.values[sortColumn] || '';

            // Convert to numbers for numeric columns
            if (['duration', 'cpu_time', 'physical_reads', 'logical_reads', 'writes'].includes(sortColumn)) {
                aVal = parseFloat(aVal as string) || 0;
                bVal = parseFloat(bVal as string) || 0;
            }

            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [events, sortColumn, sortDirection]);

    const handleSort = (columnKey: string) => {
        if (sortColumn === columnKey) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(columnKey);
            setSortDirection('asc');
        }
    };

    const formatValue = (value: any, columnKey: string): string => {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        // Format duration and CPU time
        if (['duration', 'cpu_time'].includes(columnKey)) {
            const ms = parseFloat(value) / 1000; // Convert microseconds to milliseconds
            return ms.toFixed(2);
        }

        // Format timestamp
        if (columnKey === 'timestamp') {
            const date = new Date(value);
            return date.toLocaleString();
        }

        return String(value);
    };

    const getCellValue = (event: ProfilerEvent, columnKey: string): string => {
        if (columnKey === 'name') {
            return event.name;
        }
        if (columnKey === 'timestamp') {
            return formatValue(event.timestamp, columnKey);
        }
        return formatValue(event.values[columnKey], columnKey);
    };

    const selectedEvent = selectedRow !== null ? sortedEvents[selectedRow] : null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            // Optional: Could show a toast notification here
        }).catch(err => {
            console.error('Failed to copy text:', err);
        });
    };

    const copyEventAsJson = () => {
        if (selectedEvent) {
            const eventData = {
                name: selectedEvent.name,
                timestamp: selectedEvent.timestamp,
                ...selectedEvent.values
            };
            copyToClipboard(JSON.stringify(eventData, null, 2));
        }
    };

    return (
        <div className="event-grid-container">
            <div className="event-count">
                Events: {events.length} {maxEvents > 0 && `(max ${maxEvents})`}
            </div>
            <div className="event-grid-content">
                <div className="event-grid-wrapper">
                    <table className="event-grid">
                        <thead>
                            <tr>
                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        style={{ width: col.width }}
                                        onClick={() => handleSort(col.key)}
                                        className={sortColumn === col.key ? 'sorted' : ''}
                                    >
                                        {col.label}
                                        {sortColumn === col.key && (
                                            <span className="sort-indicator">
                                                {sortDirection === 'asc' ? ' ▲' : ' ▼'}
                                            </span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedEvents.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} className="empty-message">
                                        No events captured yet. Start profiling to see events.
                                    </td>
                                </tr>
                            ) : (
                                sortedEvents.map((event, index) => (
                                    <tr
                                        key={index}
                                        className={selectedRow === index ? 'selected' : ''}
                                        onClick={() => setSelectedRow(index)}
                                    >
                                        {columns.map(col => (
                                            <td
                                                key={col.key}
                                                title={getCellValue(event, col.key)}
                                            >
                                                {getCellValue(event, col.key)}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {selectedEvent && (
                    <div className="event-details-panel">
                        <div className="details-header">
                            <h3>Event Details</h3>
                            <div className="details-header-actions">
                                <button
                                    className="copy-json-button"
                                    onClick={copyEventAsJson}
                                    title="Copy as JSON"
                                >
                                    <span className="codicon codicon-copy"></span>
                                </button>
                                <button
                                    className="close-details"
                                    onClick={() => setSelectedRow(null)}
                                    title="Close details"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        <div className="details-content">
                            <div className="detail-row">
                                <span className="detail-label">Event Class:</span>
                                <span className="detail-value">{selectedEvent.name}</span>
                                <button
                                    className="copy-value-button"
                                    onClick={() => copyToClipboard(selectedEvent.name)}
                                    title="Copy value"
                                >
                                    <span className="codicon codicon-copy"></span>
                                </button>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Timestamp:</span>
                                <span className="detail-value">{formatValue(selectedEvent.timestamp, 'timestamp')}</span>
                                <button
                                    className="copy-value-button"
                                    onClick={() => copyToClipboard(formatValue(selectedEvent.timestamp, 'timestamp'))}
                                    title="Copy value"
                                >
                                    <span className="codicon codicon-copy"></span>
                                </button>
                            </div>
                            {Object.entries(selectedEvent.values).map(([key, value]) => (
                                <div key={key} className="detail-row">
                                    <span className="detail-label">{key}:</span>
                                    <span className="detail-value">{String(value)}</span>
                                    <button
                                        className="copy-value-button"
                                        onClick={() => copyToClipboard(String(value))}
                                        title="Copy value"
                                    >
                                        <span className="codicon codicon-copy"></span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
