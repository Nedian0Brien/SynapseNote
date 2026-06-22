import { useEffect, useRef, useState } from 'react';
import { useVaultTree } from '../../shared/hooks/useVaultTree';
import { SidebarContextMenu } from './SidebarContextMenu';

function ensureMarkdownPath(name, parentPath = '') {
  const trimmed = String(name || '').trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';
  const fileName = trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
  return parentPath ? `${parentPath}/${fileName}` : fileName;
}

function buildRenamePath(path, nextName) {
  const parts = path.split('/');
  const nextFileName = ensureMarkdownPath(nextName).split('/').pop();
  parts[parts.length - 1] = nextFileName;
  return parts.join('/');
}

export function Sidebar({
  collapsed,
  mobOpen = false,
  onToggle,
  onSelectNode,
  activeNodeId,
  onUnauthorized,
  onCreated,
  onRenamed,
  onDeleted,
}) {
  const { tree, createFile, renameFile, deleteFile } = useVaultTree({ onUnauthorized });
  const [draftParentPath, setDraftParentPath] = useState('');
  const [draftName, setDraftName] = useState('');
  const [renameTargetPath, setRenameTargetPath] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [menuState, setMenuState] = useState(null);
  const touchTimerRef = useRef(null);

  useEffect(() => () => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
  }, []);

  const closeMenu = () => setMenuState(null);
  const rootDraftVisible = draftParentPath === '';

  const startCreate = (parentPath = '') => {
    setDraftParentPath(parentPath);
    setDraftName('');
    setRenameTargetPath(null);
  };

  const submitCreate = async () => {
    const nextPath = ensureMarkdownPath(draftName, draftParentPath);
    if (!nextPath) {
      setDraftParentPath('');
      setDraftName('');
      return;
    }

    const created = await createFile(nextPath, '');
    setDraftParentPath('');
    setDraftName('');
    if (created?.id) {
      onCreated?.(created.id);
    }
  };

  const submitRename = async (path) => {
    const nextPath = buildRenamePath(path, renameValue);
    if (!nextPath || nextPath === path) {
      setRenameTargetPath(null);
      setRenameValue('');
      return;
    }

    const renamed = await renameFile(path, nextPath);
    setRenameTargetPath(null);
    setRenameValue('');
    if (renamed?.id) {
      onRenamed?.(path, renamed.id);
    }
  };

  const handleDelete = async (item) => {
    const ok = window.confirm(`"${item.name}" 노트를 삭제할까요?`);
    if (!ok) return;
    const deleted = await deleteFile(item.path);
    if (deleted?.id) {
      onDeleted?.(deleted.id);
    }
  };

  const handleMenuAction = async (action, item) => {
    closeMenu();

    if (action === 'rename' && item.type === 'file') {
      setRenameTargetPath(item.path);
      setRenameValue(item.name);
      return;
    }

    if (action === 'delete' && item.type === 'file') {
      await handleDelete(item);
      return;
    }

    if (action === 'create-child' && item.type === 'dir') {
      const nextName = window.prompt('새 하위 노트 이름', '');
      if (!nextName) return;
      const created = await createFile(ensureMarkdownPath(nextName, item.path), '');
      if (created?.id) {
        onCreated?.(created.id);
      }
      return;
    }

    if (action === 'copy-path') {
      await navigator.clipboard?.writeText?.(item.path);
    }
  };

  const openMenu = (event, item, mobile = false) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuState({
      target: item,
      mobile,
      position: mobile ? { x: 0, y: 0 } : { x: event.clientX, y: event.clientY },
    });
  };

  const renderTreeNodes = (items, depth = 0) => items.map((item) => (
    <TreeNode
      key={item.path}
      item={item}
      depth={depth}
      activeId={activeNodeId}
      onSelect={onSelectNode}
      onContextMenu={openMenu}
      renameTargetPath={renameTargetPath}
      renameValue={renameValue}
      setRenameValue={setRenameValue}
      onRenameSubmit={submitRename}
      onRenameCancel={() => {
        setRenameTargetPath(null);
        setRenameValue('');
      }}
      draftParentPath={draftParentPath}
      draftName={draftName}
      setDraftName={setDraftName}
      onDraftSubmit={submitCreate}
      onDraftCancel={() => {
        setDraftParentPath('');
        setDraftName('');
      }}
      renderChildren={renderTreeNodes}
      touchTimerRef={touchTimerRef}
    />
  ));

  return (
    <>
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobOpen ? ' mob-open' : ''}`}>
        <div className="sb-header">
          <span className="sb-brand sb-hide">SynapseNote</span>
          <button className="sb-toggle" onClick={onToggle}>
            <span className="icon">{collapsed ? 'menu' : 'chevron_left'}</span>
          </button>
        </div>

        <div className="sb-search sb-hide">
          <span className="icon" style={{ fontSize: 14 }}>search</span>
          <input type="text" placeholder="검색..." />
        </div>

        <div className="sb-tree sb-hide">
          <div className="tree-section-label">
            <span className="icon" style={{ fontSize: 12 }}>folder</span>
            Vault
          </div>
          {rootDraftVisible && (
            <DraftRow
              value={draftName}
              onChange={setDraftName}
              onSubmit={submitCreate}
              onCancel={() => {
                setDraftParentPath('');
                setDraftName('');
              }}
            />
          )}
          {renderTreeNodes(tree)}
        </div>

        <div className="sb-footer sb-hide">
          <button className="sb-footer-btn" onClick={() => startCreate('')}>
            <span className="icon" style={{ fontSize: 14 }}>add</span>
            새 노트
          </button>
          <button className="sb-footer-btn">
            <span className="icon" style={{ fontSize: 14 }}>upload</span>
            가져오기
          </button>
        </div>
      </aside>

      <SidebarContextMenu
        open={Boolean(menuState)}
        mobile={menuState?.mobile}
        position={menuState?.position}
        target={menuState?.target}
        onAction={handleMenuAction}
        onClose={closeMenu}
      />
    </>
  );
}

function DraftRow({ value, onChange, onSubmit, onCancel, depth = 0 }) {
  return (
    <div className="tree-item draft" style={{ paddingLeft: 8 + (depth * 12) }}>
      <span className="icon" style={{ fontSize: 14 }}>note_add</span>
      <input
        autoFocus
        className="tree-input"
        placeholder="새 노트 이름"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onSubmit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel?.();
          }
        }}
        onBlur={() => onCancel?.()}
      />
    </div>
  );
}

function TreeNode({
  item,
  depth,
  activeId,
  onSelect,
  onContextMenu,
  renameTargetPath,
  renameValue,
  setRenameValue,
  onRenameSubmit,
  onRenameCancel,
  draftParentPath,
  draftName,
  setDraftName,
  onDraftSubmit,
  onDraftCancel,
  renderChildren,
  touchTimerRef,
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = item.type === 'dir';
  const isActive = item.path === activeId;
  const hasChildren = isDir && item.children?.length > 0;
  const isRenaming = renameTargetPath === item.path;
  const showDraftChild = isDir && draftParentPath === item.path;

  const handleClick = () => {
    if (isDir) {
      setExpanded((prev) => !prev);
      return;
    }
    onSelect?.(item.path);
  };

  return (
    <>
      <div
        className={`tree-item${isDir ? ' dir' : ''}${isActive ? ' active' : ''}`}
        onClick={handleClick}
        onContextMenu={(event) => onContextMenu?.(event, item, false)}
        onTouchStart={(event) => {
          touchTimerRef.current = setTimeout(() => {
            onContextMenu?.(event, item, true);
          }, 420);
        }}
        onTouchMove={() => {
          if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
        }}
        onTouchEnd={() => {
          if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
        }}
      >
        <span className="icon" style={{ fontSize: 14 }}>
          {isDir ? (expanded ? 'folder_open' : 'folder') : 'article'}
        </span>
        {isRenaming ? (
          <input
            autoFocus
            className="tree-input"
            value={renameValue}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void onRenameSubmit(item.path);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onRenameCancel?.();
              }
            }}
            onBlur={() => onRenameCancel?.()}
          />
        ) : (
          <span className="tree-label">{item.name}</span>
        )}
        {isDir && item.children?.length > 0 && (
          <span className="tree-item-count">{item.children.length}</span>
        )}
      </div>
      {isDir && expanded && (
        <div className="tree-child">
          {hasChildren && renderChildren(
            [...item.children].sort((a, b) => {
              if (a.type === 'dir' && b.type !== 'dir') return -1;
              if (a.type !== 'dir' && b.type === 'dir') return 1;
              return a.name.localeCompare(b.name);
            }),
            depth + 1,
          )}
          {showDraftChild && (
            <DraftRow
              value={draftName}
              onChange={setDraftName}
              onSubmit={onDraftSubmit}
              onCancel={onDraftCancel}
              depth={depth + 1}
            />
          )}
        </div>
      )}
    </>
  );
}
