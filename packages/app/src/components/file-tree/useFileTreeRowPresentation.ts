import { FILE_TREE_TAG_NAME } from '@pierre/trees';
import { type MutableRefObject, useEffect } from 'react';
import { applyExtensionBadges } from '@/components/file-tree-extension-badge';
import { applyRenameInputAffordance } from '@/components/file-tree-rename-chip';

type Input = {
  hostRef: MutableRefObject<HTMLDivElement | null>;
  loading: boolean;
  documentCount: number;
};

/** Maintains shadow-DOM row titles, extension badges, and rename input affordances. */
export function useFileTreeRowPresentation({ hostRef, loading, documentCount }: Input): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the shadow host is read once per visibility transition.
  useEffect(() => {
    if (loading || documentCount === 0) return;
    const shadow = hostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const titleForPath = (treePath: string) =>
      treePath.endsWith('/') ? treePath.slice(0, -1) : treePath;
    const stampTitles = () => {
      for (const row of shadow.querySelectorAll<HTMLElement>('[data-item-path]')) {
        const treePath = row.dataset.itemPath;
        if (!treePath) continue;
        const title = titleForPath(treePath);
        if (row.title !== title) row.title = title;
      }
      const anchor = shadow.querySelector<HTMLElement>('[data-type="context-menu-anchor"]');
      if (!anchor) return;
      const hoveredPath = shadow.querySelector<HTMLElement>(
        '[data-item-context-hover="true"][data-item-path]',
      )?.dataset.itemPath;
      const title = hoveredPath ? titleForPath(hoveredPath) : '';
      if (anchor.title !== title) anchor.title = title;
    };
    stampTitles();
    const observer = new MutationObserver(stampTitles);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-item-path', 'data-item-context-hover'],
    });
    return () => observer.disconnect();
  }, [documentCount, loading]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the shadow host is read once per visibility transition.
  useEffect(() => {
    if (loading || documentCount === 0) return;
    const shadow = hostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const apply = () => applyExtensionBadges(shadow);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-item-path'],
    });
    return () => observer.disconnect();
  }, [documentCount, loading]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the shadow host is read once per visibility transition.
  useEffect(() => {
    if (loading || documentCount === 0) return;
    const shadow = hostRef.current?.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot;
    if (!shadow) return;
    const apply = () => applyRenameInputAffordance(shadow);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(shadow, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-item-path'],
    });
    return () => observer.disconnect();
  }, [documentCount, loading]);
}
