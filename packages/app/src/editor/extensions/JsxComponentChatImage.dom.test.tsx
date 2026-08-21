/**
 * The image block's "Send to AI" chrome button — the entry point that stages a
 * note image in the Chat composer. Mounts the real NodeView so the gating
 * (image descriptors only, local files only, desktop only) is exercised against
 * the production chrome rather than a stand-in.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type AnyExtension, Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { createPortal } from 'react-dom';
import {
  type ChatImageAttachmentRequest,
  subscribeToChatImageAttachment,
} from '@/components/chat/chat-image-attachment';
import { TerminalLaunchProvider } from '@/components/handoff/TerminalLaunchContext';
import { sharedExtensions as appExtensions } from './shared';

i18n.load('en', {});
i18n.activate('en');

const SEND_TO_AI_LABEL = 'Send image to AI';

function imageDoc(src: string, alt = 'Shot') {
  return {
    type: 'doc',
    content: [
      {
        type: 'jsxComponent',
        attrs: {
          componentName: 'img',
          kind: 'element',
          sourceRaw: `<img src="${src}" alt="${alt}" />`,
          sourceDirty: false,
          props: { src, alt },
        },
      },
    ],
  };
}

const calloutDoc = {
  type: 'doc',
  content: [
    {
      type: 'jsxComponent',
      attrs: {
        componentName: 'Callout',
        kind: 'element',
        sourceRaw: '<Callout type="info" title="Note">Body</Callout>',
        sourceDirty: false,
        props: { type: 'info', title: 'Note' },
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
    },
  ],
};

const editors: Editor[] = [];

function mount(content: unknown, { desktop = true }: { desktop?: boolean } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const portalTarget = document.createElement('div');
  document.body.append(portalTarget);
  const editor = new Editor({
    element: host,
    extensions: appExtensions as AnyExtension[],
    content: content as never,
  });
  editors.push(editor);
  render(
    <I18nProvider i18n={i18n}>
      <TerminalLaunchProvider
        value={desktop ? { launchInTerminal: () => {}, installedClis: {} } : null}
      >
        {createPortal(
          // biome-ignore lint/plugin/no-unportaled-editor-content: test harness uses a private portal target just like the production editor
          <EditorContent editor={editor} />,
          portalTarget,
        )}
      </TerminalLaunchProvider>
    </I18nProvider>,
  );
  return editor;
}

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe('image chrome "Send to AI"', () => {
  test('emits the image attachment for a local image', async () => {
    mount(imageDoc('/assets/shot.png'));
    const received: ChatImageAttachmentRequest[] = [];
    const unsubscribe = subscribeToChatImageAttachment((attachment) => received.push(attachment));
    try {
      fireEvent.click(await screen.findByLabelText(SEND_TO_AI_LABEL));
    } finally {
      unsubscribe();
    }
    expect(received).toEqual([
      { path: 'assets/shot.png', previewSrc: '/assets/shot.png', alt: 'Shot' },
    ]);
  });

  test('is absent for an image hosted outside the workspace', async () => {
    // A remote URL has no file a local agent could open, so offering the
    // action would hand it a reference it cannot resolve.
    mount(imageDoc('https://example.com/shot.png'));
    await screen.findByRole('button', { name: /Delete/ });
    expect(screen.queryByLabelText(SEND_TO_AI_LABEL)).toBeNull();
  });

  test('is absent for a non-image block', async () => {
    mount(calloutDoc);
    await screen.findByRole('button', { name: /Delete/ });
    expect(screen.queryByLabelText(SEND_TO_AI_LABEL)).toBeNull();
  });

  test('is absent on hosts with no chat surface', async () => {
    mount(imageDoc('/assets/shot.png'), { desktop: false });
    await screen.findByRole('button', { name: /Delete/ });
    expect(screen.queryByLabelText(SEND_TO_AI_LABEL)).toBeNull();
  });
});
