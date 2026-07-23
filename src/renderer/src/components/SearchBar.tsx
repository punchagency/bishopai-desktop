/**
 * A small filter box for the pages whose lists grow without bound (approved
 * sessions, leads, the customer map). Filtering is client-side over what's
 * already loaded, so results are instant and there's no request per keystroke.
 * A clear button appears once there's text, and Escape clears too.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search…',
  /** Result count to echo back, so an empty result reads as "0 of N", not a bug. */
  count,
  total,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  count?: number;
  total?: number;
}) {
  const active = value.trim().length > 0;
  return (
    <div className="il-search">
      <span className="il-search__icon" aria-hidden>⌕</span>
      <input
        type="search"
        className="il-input il-search__input"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && active) {
            e.preventDefault();
            onChange('');
          }
        }}
      />
      {active && (
        <button className="il-search__clear" onClick={() => onChange('')} aria-label="Clear search">
          ×
        </button>
      )}
      {active && typeof count === 'number' && (
        <span className="il-search__count">
          {typeof total === 'number' ? `${count} of ${total}` : `${count} found`}
        </span>
      )}
    </div>
  );
}
