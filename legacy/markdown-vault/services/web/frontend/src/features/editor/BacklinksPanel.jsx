import { useBacklinks } from '../../shared/hooks/useBacklinks';

export function BacklinksPanel({ path, onUnauthorized, onNavigate }) {
  const { backlinks, loading, error } = useBacklinks(path, { onUnauthorized });

  return (
    <aside className="backlinks-panel fp">
      <div className="fp-handle">
        <span className="icon fp-icon">arrow_circle_left</span>
        <span className="fp-label">Backlinks</span>
      </div>
      <div className="backlinks-body">
        {loading && <p className="backlinks-empty">불러오는 중...</p>}
        {!loading && error && <p className="backlinks-empty">{error}</p>}
        {!loading && !error && backlinks.length === 0 && (
          <p className="backlinks-empty">아직 연결된 노트가 없습니다.</p>
        )}
        {!loading && !error && backlinks.map((link) => (
          <button
            key={link.id}
            className="backlink-item"
            onClick={() => onNavigate?.(link.id)}
          >
            <span className="icon">link</span>
            <span className="backlink-copy">
              <strong>{link.title}</strong>
              <small>{link.id}</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
