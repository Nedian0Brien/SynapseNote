import { useState } from 'react';
import { useVaultTree } from '../../shared/hooks/useVaultTree';

export function Sidebar({ collapsed, onToggle, onSelectNode, activeNodeId, onUnauthorized }) {
  const { tree } = useVaultTree({ onUnauthorized });

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
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
        {tree.map(item => (
          <TreeNode
            key={item.path}
            item={item}
            activeId={activeNodeId}
            onSelect={onSelectNode}
            depth={0}
          />
        ))}
      </div>

      <div className="sb-footer sb-hide">
        <button className="sb-footer-btn">
          <span className="icon" style={{ fontSize: 14 }}>add</span>
          새 노트
        </button>
        <button className="sb-footer-btn">
          <span className="icon" style={{ fontSize: 14 }}>upload</span>
          가져오기
        </button>
      </div>
    </aside>
  );
}

function TreeNode({ item, activeId, onSelect, depth }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = item.type === 'dir';
  const isActive = item.path === activeId;
  const hasChildren = isDir && item.children?.length > 0;

  const handleClick = () => {
    if (isDir) {
      setExpanded(e => !e);
    } else {
      onSelect?.(item.path);
    }
  };

  return (
    <>
      <div
        className={`tree-item${isDir ? ' dir' : ''}${isActive ? ' active' : ''}`}
        onClick={handleClick}
      >
        <span className="icon" style={{ fontSize: 14 }}>
          {isDir ? (expanded ? 'folder_open' : 'folder') : 'article'}
        </span>
        {item.name}
        {isDir && item.children?.length > 0 && (
          <span className="tree-item-count">{item.children.length}</span>
        )}
      </div>
      {isDir && expanded && hasChildren && (
        <div className="tree-child">
          {item.children
            .sort((a, b) => {
              if (a.type === 'dir' && b.type !== 'dir') return -1;
              if (a.type !== 'dir' && b.type === 'dir') return 1;
              return a.name.localeCompare(b.name);
            })
            .map(child => (
              <TreeNode
                key={child.path}
                item={child}
                activeId={activeId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
        </div>
      )}
    </>
  );
}
