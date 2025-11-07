import * as React from 'react';

export interface FilterOptions {
    eventTypes: string[];
    textSearch: string;
    databaseFilter: string[];  // Changed to array for multi-select
}

interface FilterBarProps {
    availableEventTypes: string[];
    availableDatabases: string[];
    filters: FilterOptions;
    onFilterChange: (filters: FilterOptions) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
    availableEventTypes,
    availableDatabases,
    filters,
    onFilterChange
}) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [isDatabaseDropdownOpen, setIsDatabaseDropdownOpen] = React.useState(false);
    const [isEventTypeDropdownOpen, setIsEventTypeDropdownOpen] = React.useState(false);

    const databaseDropdownRef = React.useRef<HTMLDivElement>(null);
    const eventTypeDropdownRef = React.useRef<HTMLDivElement>(null);

    // Close dropdowns when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (databaseDropdownRef.current && !databaseDropdownRef.current.contains(event.target as Node)) {
                setIsDatabaseDropdownOpen(false);
            }
            if (eventTypeDropdownRef.current && !eventTypeDropdownRef.current.contains(event.target as Node)) {
                setIsEventTypeDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleEventTypeToggle = (eventType: string) => {
        const newTypes = filters.eventTypes.includes(eventType)
            ? filters.eventTypes.filter(t => t !== eventType)
            : [...filters.eventTypes, eventType];

        onFilterChange({ ...filters, eventTypes: newTypes });
    };

    const handleTextSearchChange = (text: string) => {
        onFilterChange({ ...filters, textSearch: text });
    };

    const handleDatabaseToggle = (database: string) => {
        const newDatabases = filters.databaseFilter.includes(database)
            ? filters.databaseFilter.filter(d => d !== database)
            : [...filters.databaseFilter, database];

        onFilterChange({ ...filters, databaseFilter: newDatabases });
    };

    const handleSelectAllDatabases = () => {
        onFilterChange({ ...filters, databaseFilter: [...availableDatabases] });
    };

    const handleDeselectAllDatabases = () => {
        onFilterChange({ ...filters, databaseFilter: [] });
    };

    const handleSelectAllEventTypes = () => {
        onFilterChange({ ...filters, eventTypes: [...availableEventTypes] });
    };

    const handleDeselectAllEventTypes = () => {
        onFilterChange({ ...filters, eventTypes: [] });
    };

    const handleClearFilters = () => {
        onFilterChange({
            eventTypes: [],
            textSearch: '',
            databaseFilter: []
        });
    };

    const hasActiveFilters = filters.eventTypes.length > 0 ||
                            filters.textSearch !== '' ||
                            filters.databaseFilter.length > 0;

    return (
        <div className="filter-bar">
            <div className="filter-bar-header">
                <button
                    className="filter-toggle"
                    onClick={() => setIsExpanded(!isExpanded)}
                    title={isExpanded ? "Hide filters" : "Show filters"}
                >
                    <span className={`codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`}></span>
                    Filters
                    {hasActiveFilters && <span className="filter-badge">{
                        filters.eventTypes.length +
                        (filters.textSearch ? 1 : 0) +
                        filters.databaseFilter.length
                    }</span>}
                </button>
                {hasActiveFilters && (
                    <button
                        className="filter-clear"
                        onClick={handleClearFilters}
                        title="Clear all filters"
                    >
                        Clear
                    </button>
                )}
            </div>

            {isExpanded && (
                <div className="filter-bar-content">
                    <div className="filter-section">
                        <label className="filter-label">Text Search:</label>
                        <input
                            type="text"
                            className="filter-input"
                            placeholder="Search in all columns..."
                            value={filters.textSearch}
                            onChange={(e) => handleTextSearchChange(e.target.value)}
                        />
                    </div>

                    <div className="filter-section-row">
                        {/* Databases Dropdown */}
                        <div className="filter-section filter-section-half">
                            <label className="filter-label">Databases ({filters.databaseFilter.length} selected):</label>
                            <div className="filter-dropdown" ref={databaseDropdownRef}>
                                <button
                                    className="filter-dropdown-button"
                                    onClick={() => setIsDatabaseDropdownOpen(!isDatabaseDropdownOpen)}
                                >
                                    {filters.databaseFilter.length === 0 ? 'No databases selected' :
                                     filters.databaseFilter.length === availableDatabases.length ? 'All databases' :
                                     `${filters.databaseFilter.length} database(s)`}
                                    <span className={`codicon ${isDatabaseDropdownOpen ? 'codicon-chevron-up' : 'codicon-chevron-down'}`}></span>
                                </button>
                                {isDatabaseDropdownOpen && (
                                    <div className="filter-dropdown-menu">
                                        <div className="filter-dropdown-actions">
                                            <button
                                                className="filter-dropdown-action-btn"
                                                onClick={handleSelectAllDatabases}
                                            >
                                                Select All
                                            </button>
                                            <button
                                                className="filter-dropdown-action-btn"
                                                onClick={handleDeselectAllDatabases}
                                            >
                                                Deselect All
                                            </button>
                                        </div>
                                        <div className="filter-dropdown-items">
                                            {availableDatabases.map(db => (
                                                <label key={db} className="filter-dropdown-item">
                                                    <input
                                                        type="checkbox"
                                                        checked={filters.databaseFilter.includes(db)}
                                                        onChange={() => handleDatabaseToggle(db)}
                                                    />
                                                    <span>{db}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Event Types Dropdown */}
                        <div className="filter-section filter-section-half">
                            <label className="filter-label">Event Types ({filters.eventTypes.length} selected):</label>
                            <div className="filter-dropdown" ref={eventTypeDropdownRef}>
                                <button
                                    className="filter-dropdown-button"
                                    onClick={() => setIsEventTypeDropdownOpen(!isEventTypeDropdownOpen)}
                                >
                                    {filters.eventTypes.length === 0 ? 'All event types' :
                                     filters.eventTypes.length === availableEventTypes.length ? 'All event types' :
                                     `${filters.eventTypes.length} event type(s)`}
                                    <span className={`codicon ${isEventTypeDropdownOpen ? 'codicon-chevron-up' : 'codicon-chevron-down'}`}></span>
                                </button>
                                {isEventTypeDropdownOpen && (
                                    <div className="filter-dropdown-menu">
                                        <div className="filter-dropdown-actions">
                                            <button
                                                className="filter-dropdown-action-btn"
                                                onClick={handleSelectAllEventTypes}
                                            >
                                                Select All
                                            </button>
                                            <button
                                                className="filter-dropdown-action-btn"
                                                onClick={handleDeselectAllEventTypes}
                                            >
                                                Deselect All
                                            </button>
                                        </div>
                                        <div className="filter-dropdown-items">
                                            {availableEventTypes.map(eventType => (
                                                <label key={eventType} className="filter-dropdown-item">
                                                    <input
                                                        type="checkbox"
                                                        checked={filters.eventTypes.includes(eventType)}
                                                        onChange={() => handleEventTypeToggle(eventType)}
                                                    />
                                                    <span>{eventType}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
