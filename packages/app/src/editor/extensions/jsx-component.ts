/**
 * App-specific JsxComponent extension — extends core with React NodeView.
 *
 * The core JsxComponent handles schema + markdown. This version adds
 * the React NodeView renderer for the browser editor.
 */
import { JsxComponent as BaseJsxComponent } from '@nedian0brien/synapsenote-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { JsxComponentView } from './JsxComponentView';

export function shouldStopJsxComponentEvent(event: Pick<Event, 'target'>): boolean {
  return (
    event.target instanceof Element &&
    event.target.closest('[data-database-inline-surface]') !== null
  );
}

export const JsxComponent = BaseJsxComponent.extend<{ docName: string }>({
  addOptions() {
    return {
      ...this.parent?.(),
      docName: '',
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(JsxComponentView, {
      // Inline databases are complete interactive applications inside the
      // document. Let their grid, popovers, and keyboard handlers own events
      // instead of allowing ProseMirror to turn a cell click into NodeSelection.
      stopEvent: ({ event }) => shouldStopJsxComponentEvent(event),
    });
  },
});
