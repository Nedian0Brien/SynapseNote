import { afterEach, describe, expect, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { type AnyExtension, Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { DatabaseOverlayHost } from '@/components/DatabaseOverlayHost';
import { createDatabaseTestFixture } from '@/components/database-tests/database-test-fixture';
import {
  getAllDatabaseInteractionTraces,
  resetDatabaseInteractionTraces,
} from '@/lib/database-interaction-trace';
import { resetDatabaseOverlayState } from '@/lib/database-overlay-store';
import { requestOpenDatabaseRecord } from '@/lib/database-record-open-command';
import { sharedExtensions as appExtensions } from './shared';

i18n.load('en', {});
i18n.activate('en');

const content = {
  type: 'doc',
  content: [
    {
      type: 'jsxComponent',
      attrs: {
        componentName: 'Callout',
        kind: 'element',
        sourceRaw: '<Callout type="info" title="Lifecycle">Body</Callout>',
        sourceDirty: false,
        props: { type: 'info', title: 'Lifecycle' },
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
    },
  ],
};

afterEach(() => {
  cleanup();
  resetDatabaseOverlayState();
  resetDatabaseInteractionTraces();
});

describe('production JsxComponentView integration', () => {
  test('mounts the real React NodeView and keeps the root overlay across editor remount', async () => {
    const fixture = createDatabaseTestFixture();
    const extensions = appExtensions as AnyExtension[];
    const host = document.createElement('div');
    document.body.append(host);
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);
    const editor = new Editor({ element: host, extensions, content });
    try {
      render(
        <I18nProvider i18n={i18n}>
          {createPortal(
            // biome-ignore lint/plugin/no-unportaled-editor-content: test harness uses a private portal target just like the production editor
            <EditorContent editor={editor} />,
            portalTarget,
          )}
          <DatabaseOverlayHost />
        </I18nProvider>,
      );
      expect(await screen.findByText('Lifecycle')).toBeTruthy();

      act(() => {
        requestOpenDatabaseRecord({
          ...fixture,
          recordPaths: [fixture.record.path],
          origin: 'inline',
          notionSurface: true,
        });
      });
      expect(await screen.findByRole('button', { name: 'Open full page' })).toBeTruthy();

      act(() => {
        editor.commands.setContent({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'replacement' }] }],
        });
      });
      await waitFor(() => {
        const nodeViewEvents = getAllDatabaseInteractionTraces().filter(
          (event) => event.details?.component === 'Callout',
        );
        expect(nodeViewEvents.some((event) => event.kind === 'node_view_unmounted')).toBe(true);
      });

      act(() => {
        editor.commands.setContent(content);
      });
      await waitFor(() => {
        const nodeViewEvents = getAllDatabaseInteractionTraces().filter(
          (event) => event.details?.component === 'Callout',
        );
        expect(nodeViewEvents.some((event) => event.kind === 'node_view_mounted')).toBe(true);
        expect(screen.getByRole('button', { name: 'Open full page' })).toBeTruthy();
      });
    } finally {
      act(() => {
        editor.destroy();
      });
      host.remove();
      portalTarget.remove();
    }
  });
});
