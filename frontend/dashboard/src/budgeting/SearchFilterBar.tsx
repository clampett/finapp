import { formFieldStyle } from './types';

export interface SearchFilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  showDateFilters?: boolean;
  searchPlaceholder?: string;
}

export function SearchFilterBar({
  searchQuery,
  onSearchQueryChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onClear,
  hasActiveFilters,
  showDateFilters = true,
  searchPlaceholder = 'Search by name, category, or account...',
}: SearchFilterBarProps) {
  const hasInvalidDateRange = Boolean(
    showDateFilters && startDate && endDate && startDate > endDate,
  );

  return (
    <div
      role="search"
      aria-label="Search financial information"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.875rem 1rem',
        marginBottom: '1rem',
        borderRadius: '8px',
        background: 'var(--ui-paint-1e2838)',
        border: '1px solid var(--ui-paint-283347)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'flex-end',
        }}
      >
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flex: '1 1 220px',
            fontSize: '12px',
            color: 'var(--ui-text-97a7c2)',
          }}
        >
          Search by name
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            style={{ ...formFieldStyle, width: '100%' }}
          />
        </label>

        {showDateFilters && (
          <>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                flex: '0 1 160px',
                fontSize: '12px',
                color: 'var(--ui-text-97a7c2)',
              }}
            >
              From date
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => onStartDateChange(e.target.value)}
                style={{ ...formFieldStyle, width: '100%' }}
              />
            </label>

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                flex: '0 1 160px',
                fontSize: '12px',
                color: 'var(--ui-text-97a7c2)',
              }}
            >
              To date
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => onEndDateChange(e.target.value)}
                style={{ ...formFieldStyle, width: '100%' }}
              />
            </label>
          </>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-[7px] font-medium cursor-pointer bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              border: '1px solid var(--ui-paint-283347)',
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {hasInvalidDateRange && (
        <p role="alert" style={{ margin: 0, fontSize: '12px', color: 'var(--ui-paint-f87171)' }}>
          From date must be on or before To date.
        </p>
      )}
    </div>
  );
}
