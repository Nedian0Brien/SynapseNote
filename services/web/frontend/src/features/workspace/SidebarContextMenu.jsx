const ACTIONS = [
  { key: 'rename', label: '이름 변경', icon: 'drive_file_rename_outline' },
  { key: 'delete', label: '삭제', icon: 'delete' },
  { key: 'create-child', label: '하위 노트 추가', icon: 'note_add' },
  { key: 'copy-path', label: '경로 복사', icon: 'content_copy' },
];

export function SidebarContextMenu({
  open,
  mobile = false,
  position = { x: 0, y: 0 },
  target,
  onAction,
  onClose,
}) {
  if (!open || !target) return null;

  return (
    <>
      <div className={`sb-menu-scrim${mobile ? ' mobile' : ''}`} onClick={onClose} />
      <div
        className={`sb-menu${mobile ? ' mobile' : ''}`}
        style={mobile ? undefined : { left: position.x, top: position.y }}
      >
        <div className="sb-menu-title">{target.name}</div>
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            className="sb-menu-item"
            onClick={() => onAction?.(action.key, target)}
          >
            <span className="icon">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}
