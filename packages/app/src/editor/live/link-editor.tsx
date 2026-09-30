import { type EditorState, type Extension, Prec } from '@codemirror/state';
import { type EditorView, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import { sourceLinkAt } from '@nedian0brien/synapsenote-core';
import { toast } from 'sonner';
import { livePortalRegistryFor } from './live-portals';
import type { MediaContext } from './media-widgets';

const editors = new WeakMap<EditorView, { open: (placeholder?: boolean) => boolean }>();

export function openLiveLinkEditor(view: EditorView, placeholder = false): boolean {
  return editors.get(view)?.open(placeholder) ?? false;
}

export function createLiveLinkEditor(
  context: MediaContext,
  apply: (view: EditorView, from: number, to: number, href: string, label?: string) => void,
  allowed: (state: EditorState, position: number) => boolean,
): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      id: number | null = null;
      target: HTMLElement | null = null;
      from = 0;
      to = 0;
      disposed = false;
      generation = 0;
      active = false;
      constructor(readonly view: EditorView) {
        editors.set(view, this);
      }
      update(update: ViewUpdate) {
        if (this.active && update.docChanged) {
          this.from = update.changes.mapPos(this.from, 1);
          this.to = update.changes.mapPos(this.to, -1);
        }
      }
      close(focus = true) {
        this.generation++;
        this.active = false;
        const registry = context.portalRegistry ?? livePortalRegistryFor(this.view);
        if (this.id !== null) registry.unregister(this.id);
        this.id = null;
        this.target?.remove();
        this.target = null;
        if (focus && !this.disposed) this.view.focus();
      }
      open(placeholder = false): boolean {
        const selection = this.view.state.selection.main;
        if (!allowed(this.view.state, selection.head)) return false;
        const source = this.view.state.doc.toString();
        const model = sourceLinkAt(source, selection.anchor, selection.head);
        if (!model && selection.empty) return false;
        this.close(false);
        this.from = model?.from ?? selection.from;
        this.to = model?.to ?? selection.to;
        this.active = true;
        const label = model?.label ?? source.slice(this.from, this.to);
        const generation = this.generation;
        void import('./link-dialog').then(({ LiveLinkDialog }) => {
          if (this.disposed || generation !== this.generation) return;
          const registry = context.portalRegistry ?? livePortalRegistryFor(this.view);
          this.target = document.createElement('div');
          this.view.dom.append(this.target);
          this.id = registry.register(
            this.target,
            <LiveLinkDialog
              href={model?.href ?? ''}
              label={label}
              onClose={() => {
                if (placeholder && this.view.state.doc.sliceString(this.from, this.to) === label) {
                  this.view.dispatch({
                    changes: { from: this.from, to: this.to },
                    userEvent: 'input.link',
                  });
                }
                this.close();
              }}
              onSave={(href, text) => {
                if (
                  model &&
                  (this.from >= this.to ||
                    !sourceLinkAt(this.view.state.doc.toString(), this.from, this.to))
                ) {
                  toast.error(t`The link was removed while you were editing it.`);
                  this.close();
                  return;
                }
                apply(this.view, this.from, this.to, href, text);
                this.close();
              }}
              onRemove={
                model
                  ? () => {
                      apply(this.view, this.from, this.to, '');
                      this.close();
                    }
                  : undefined
              }
            />,
          );
        });
        return true;
      }
      destroy() {
        editors.delete(this.view);
        this.disposed = true;
        this.close(false);
      }
    },
  );
  return [
    plugin,
    Prec.highest(
      keymap.of([
        {
          key: 'Mod-k',
          run: (view) => view.plugin(plugin)?.open() ?? false,
          stopPropagation: true,
        },
      ]),
    ),
  ];
}
