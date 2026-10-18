// a canvas page as morrow's PageView draws one: the canvas fills the view, or a notice when its file could not
// be read, which is left untouched
import { CanvasView } from '../vendor/morrow/src/app/components/CanvasView';
import type { DocNode, PageMeta } from '../vendor/morrow/src/core/model';

export function CanvasPage({ page, doc, unreadable }: { page: PageMeta; doc: DocNode | undefined; unreadable: boolean }) {
  return (
    <div className="view">
      {unreadable ? (
        <div className="banner is-error" role="alert">
          This canvas file could not be read. It has been left untouched on disk.
        </div>
      ) : (
        <CanvasView pageId={page.id} doc={doc} editable />
      )}
    </div>
  );
}
