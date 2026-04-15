import { useTheme } from '../../shared/theme/ThemeContext';

export function Topbar({
  breadcrumb,
  onMobileMenu,
  onGraphView,
  onSplitToggle,
  activeView,
  splitDisabled = false,
}) {
  const { theme, toggle } = useTheme();

  return (
    <header className="topbar">
      <button className="tb-btn mob-menu-btn" onClick={onMobileMenu}>
        <span className="icon">menu</span>
      </button>

      <div className="topbar-bc">
        <span className="icon" style={{ fontSize: 14 }}>hub</span>
        {breadcrumb.map((seg, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && (
              <span className="icon" style={{ fontSize: 12, color: 'var(--outline)' }}>
                chevron_right
              </span>
            )}
            <span className={i === breadcrumb.length - 1 ? 'active' : ''}>
              {seg}
            </span>
          </span>
        ))}
      </div>

      {activeView !== 'graph' && (
        <button className="tb-btn" onClick={onGraphView} title="그래프 보기">
          <span className="icon">hub</span>
        </button>
      )}

      <button
        className={`tb-btn${activeView === 'split' ? ' active' : ''}`}
        onClick={onSplitToggle}
        title={splitDisabled ? '그래프/에디터 전환' : '스플릿 보기'}
      >
        <span className="icon">view_column</span>
      </button>

      <button className="tb-btn" onClick={toggle}>
        <span className="icon">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
      </button>
    </header>
  );
}
