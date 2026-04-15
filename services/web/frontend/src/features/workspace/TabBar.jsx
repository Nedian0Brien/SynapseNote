export function TabBar({ tabs, activeTabId, onSelect, onClose }) {
  if (!tabs.length) return null;

  return (
    <div className="tabbar" role="tablist" aria-label="열린 노트 탭">
      {tabs.map((tab) => {
        const label = tab.path.split('/').pop()?.replace(/\.md$/, '') ?? tab.path;
        const active = tab.id === activeTabId;

        return (
          <button
            key={tab.id}
            className={`tab${active ? ' active' : ''}`}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect?.(tab.id)}
          >
            <span className="tab-label" title={tab.path}>{label}</span>
            <span
              className="tab-close"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onClose?.(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose?.(tab.id);
                }
              }}
            >
              <span className="icon">close</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
