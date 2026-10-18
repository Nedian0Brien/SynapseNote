// the pages inside a page, listed under its text as morrow's Subpages in src/app/components/PageView.tsx
import { useMemo } from 'react';
import { displayTitle } from '../vendor/morrow/src/core/model';
import type { PageId } from '../vendor/morrow/src/core/model';
import { childrenOf } from '../vendor/morrow/src/core/tree';
import { relativeTime } from '../vendor/morrow/src/app/components/primitives';
import { useWorkspace } from '../vendor/morrow/src/app/workspace';
import { openPage } from './host/router';
import { PageIcon } from './host/sidebar';

export function Subpages({ parentId }: { parentId: PageId }) {
  const state = useWorkspace();
  const children = useMemo(() => childrenOf(state.pages, parentId), [state.pages, parentId]);
  if (children.length === 0) return null;
  return (
    <section className="page-section" aria-label="Subpages">
      <h2 className="section-label">Subpages</h2>
      <ul className="link-list">
        {children.map((child) => (
          <li key={child.id}>
            <button type="button" className="link-row" data-page-id={child.id} onClick={() => openPage(child.id)}>
              <span className="tree-icon">
                <PageIcon page={child} />
              </span>
              <span className="link-row-title">{displayTitle(child)}</span>
              <span className="link-row-meta">{relativeTime(child.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
