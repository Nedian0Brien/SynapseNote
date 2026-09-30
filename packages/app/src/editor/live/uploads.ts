import { type Extension, Prec, StateEffect } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { t } from '@lingui/core/macro';
import { DEFAULT_DEDUP_UI, type UploadAssetSuccess } from '@nedian0brien/synapsenote-core';
import { toast } from 'sonner';
import { buildUnresolvedWikiLinkAttrs } from '../extensions/wiki-link-helpers';
import { parentDir, pickInsertShape, shortestImageRef } from '../image-upload/source-shape';
import { uploadAsset } from '../image-upload/upload-file';
import type { MediaContext } from './media-widgets';

export function uploadedFileSource(
  filename: string,
  asset: UploadAssetSuccess,
  docName: string,
): { source: string; block: boolean } {
  const shape = pickInsertShape(filename);
  const path = asset.path ?? [parentDir(docName), asset.src].filter(Boolean).join('/');
  const url = `/${path.replace(/^\//, '')}`;
  const attr = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  if (shape.kind === 'jsx-img') return { source: `<img src="${attr}" />`, block: true };
  if (shape.kind === 'jsx-video' || shape.kind === 'jsx-audio') {
    return {
      source: `<${shape.kind === 'jsx-video' ? 'video' : 'audio'} src="${attr}" controls />`,
      block: true,
    };
  }
  if (shape.kind === 'jsx-file' || shape.kind === 'wikiembed') {
    return { source: `![[${asset.src}]]`, block: true };
  }
  if (shape.kind === 'wiki-link') {
    const title = filename.replace(/\.(md|mdx)$/i, '');
    const attrs = buildUnresolvedWikiLinkAttrs(asset.src.replace(/\.(md|mdx)$/i, ''));
    const alias = attrs && title !== attrs.target ? title : null;
    return {
      source: attrs ? `[[${attrs.target}${alias ? `|${alias}` : ''}]]` : filename,
      block: false,
    };
  }
  const label = filename.replace(/([\\[\]*_`~])/g, '\\$1');
  const target = shortestImageRef(path.replace(/^\//, ''), docName)
    .replace(/ /g, '%20')
    .replace(/[()]/g, '\\$&');
  return { source: `[${label}](${target})`, block: false };
}

class UploadWidget extends WidgetType {
  constructor(readonly filename: string) {
    super();
  }
  eq(other: UploadWidget) {
    return this.filename === other.filename;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className =
      'cm-live-upload text-muted-foreground animate-pulse motion-reduce:animate-none';
    span.setAttribute('role', 'status');
    span.textContent = t`Uploading ${this.filename}`;
    return span;
  }
}

const refreshUploads = StateEffect.define<null>();
type UploadRequest = (file: File, docName: string) => Promise<UploadAssetSuccess>;
interface PendingUpload {
  position: number;
  filename: string;
}
interface UploadController {
  upload(file: File, position: number): Promise<void>;
  pick(): void;
}
const controllers = new WeakMap<EditorView, UploadController>();
export function pickLiveUpload(view: EditorView): void {
  controllers.get(view)?.pick();
}
export function uploadLiveFile(
  view: EditorView,
  file: File,
  position = view.state.selection.main.from,
): Promise<void> {
  return controllers.get(view)?.upload(file, position) ?? Promise.resolve();
}

export function createLiveUploads(
  context: MediaContext,
  request: UploadRequest = (file, docName) => uploadAsset(file, [], { docName }),
): Extension {
  const plugin = ViewPlugin.fromClass(
    class implements UploadController {
      pending = new Map<string, PendingUpload>();
      decorations: DecorationSet = Decoration.none;
      disposed = false;
      pickers = new Set<HTMLInputElement>();
      constructor(readonly view: EditorView) {
        controllers.set(view, this);
      }
      update(update: ViewUpdate) {
        if (update.docChanged)
          for (const item of this.pending.values())
            item.position = update.changes.mapPos(item.position, 1);
        if (
          update.docChanged ||
          update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshUploads)))
        ) {
          this.decorations = Decoration.set(
            [...this.pending.values()].map((item) =>
              Decoration.widget({ widget: new UploadWidget(item.filename), side: 1 }).range(
                item.position,
              ),
            ),
            true,
          );
        }
      }
      async upload(file: File, position: number): Promise<void> {
        const docName = context.docName;
        if (!docName) {
          toast.error(t`Cannot upload: no document is open`);
          return;
        }
        const id = crypto.randomUUID();
        this.pending.set(id, { position, filename: file.name });
        this.view.dispatch({ effects: refreshUploads.of(null) });
        try {
          const asset = await request(file, docName);
          const item = this.pending.get(id);
          if (this.disposed || !item) return;
          const model = uploadedFileSource(file.name, asset, docName);
          const line = this.view.state.doc.lineAt(item.position);
          const lead =
            model.block && this.view.state.doc.sliceString(line.from, item.position).trim()
              ? '\n\n'
              : '';
          const tail = model.block ? '\n\n' : '';
          this.pending.delete(id);
          this.view.dispatch({
            changes: { from: item.position, insert: lead + model.source + tail },
            effects: refreshUploads.of(null),
            userEvent: 'input.upload',
          });
          if (asset.deduped && DEFAULT_DEDUP_UI !== 'silent')
            toast.info(t`Already at ${asset.path ?? asset.src} — reusing.`);
        } catch (error) {
          if (!this.disposed)
            toast.error(error instanceof Error ? error.message : t`Upload failed`);
        } finally {
          if (!this.disposed && this.pending.delete(id))
            this.view.dispatch({ effects: refreshUploads.of(null) });
        }
      }
      pick() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*/*';
        input.hidden = true;
        this.pickers.add(input);
        const remove = () => {
          this.pickers.delete(input);
          input.remove();
        };
        input.addEventListener(
          'change',
          () => {
            const file = input.files?.[0];
            if (file && !this.disposed) void this.upload(file, this.view.state.selection.main.from);
            remove();
          },
          { once: true },
        );
        input.addEventListener('cancel', remove, { once: true });
        document.body.append(input);
        input.click();
      }
      destroy() {
        this.disposed = true;
        controllers.delete(this.view);
        this.pending.clear();
        for (const picker of this.pickers) picker.remove();
        this.pickers.clear();
      }
    },
    { decorations: (value) => value.decorations },
  );
  return [
    plugin,
    Prec.highest(
      EditorView.domEventHandlers({
        paste(event, view) {
          const files = [...(event.clipboardData?.files ?? [])];
          if (!files.length) return false;
          event.preventDefault();
          for (const file of files) void uploadLiveFile(view, file);
          return true;
        },
        drop(event, view) {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (!files.length) return false;
          event.preventDefault();
          const position =
            view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
            view.state.selection.main.from;
          for (const file of files) void uploadLiveFile(view, file, position);
          return true;
        },
      }),
    ),
  ];
}
