import { FILE_TREE_TAG_NAME, type FileTree as PierreFileTreeModel } from '@pierre/trees';
import { FileTree as PierreFileTree } from '@pierre/trees/react';
import { type ComponentProps, type MutableRefObject, type ReactNode, useEffect } from 'react';
import { createFileTreeStyle } from '@/components/file-tree-density';
import { FILE_TREE_CREATION_CLEARED_ATTR } from './FileTreePresentation';

type Props = {
  hostRef: MutableRefObject<HTMLDivElement | null>;
  model: PierreFileTreeModel;
  resolvedTheme: string | undefined;
  creationDirCleared: boolean;
  header: ReactNode;
  onContentHeightChange?: (px: number) => void;
  onClickCapture: ComponentProps<typeof PierreFileTree>['onClickCapture'];
  onMouseMove: ComponentProps<typeof PierreFileTree>['onMouseMove'];
  onMouseLeave: ComponentProps<typeof PierreFileTree>['onMouseLeave'];
  renderContextMenu: ComponentProps<typeof PierreFileTree>['renderContextMenu'];
};

/** Renders the Pierre virtualizer and reports its uncapped content height to the sidebar. */
export function FileTreeViewport({
  hostRef,
  model,
  resolvedTheme,
  creationDirCleared,
  header,
  onContentHeightChange,
  onClickCapture,
  onMouseMove,
  onMouseLeave,
  renderContextMenu,
}: Props) {
  // The virtualizer stores its real row height on the list's inline style.
  // Scroller box metrics are clamped by the sidebar cap and would ratchet a
  // short tree up to the cap instead of allowing the Skills section to rise.
  useEffect(() => {
    if (!onContentHeightChange) return;
    let raf = 0;
    let attachRaf = 0;
    const getList = () =>
      (hostRef.current
        ?.querySelector(FILE_TREE_TAG_NAME)
        ?.shadowRoot?.querySelector('[data-file-tree-virtualized-list]') as HTMLElement | null) ??
      null;
    const report = () => {
      const list = getList();
      if (!list) return;
      const height = Number.parseFloat(list.style.height);
      if (Number.isFinite(height)) onContentHeightChange(height);
    };
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(report);
    };
    const observer = new MutationObserver(report);
    const attach = () => {
      const list = getList();
      if (list) {
        observer.observe(list, { attributes: true, attributeFilter: ['style'] });
        report();
      } else {
        attachRaf = requestAnimationFrame(attach);
      }
    };
    attach();
    const unsubscribe = model.subscribe(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(attachRaf);
      observer.disconnect();
      unsubscribe();
      window.removeEventListener('resize', measure);
    };
  }, [hostRef, model, onContentHeightChange]);

  return (
    <div ref={hostRef} className="flex min-h-0 flex-1 flex-col">
      <PierreFileTree
        header={header}
        model={model}
        style={createFileTreeStyle(resolvedTheme)}
        {...{ [FILE_TREE_CREATION_CLEARED_ATTR]: creationDirCleared ? '' : undefined }}
        onClickCapture={onClickCapture}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        renderContextMenu={renderContextMenu}
      />
    </div>
  );
}
