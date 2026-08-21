import { describe, expect, test } from 'bun:test';
import {
  buildChatImageAttachment,
  requestChatImageAttachment,
  subscribeToChatImageAttachment,
} from './chat-image-attachment';

describe('buildChatImageAttachment', () => {
  test('resolves a doc-relative src against the note folder', () => {
    const attachment = buildChatImageAttachment('./assets/shot.png', 'trip/day-1');
    expect(attachment?.path).toBe('trip/assets/shot.png');
    expect(attachment?.previewSrc).toBe('/trip/assets/shot.png');
  });

  test('walks a parent-relative src', () => {
    expect(buildChatImageAttachment('../images/photo.png', 'docs/guide')?.path).toBe(
      'images/photo.png',
    );
  });

  test('keeps a server-absolute src as-is', () => {
    expect(buildChatImageAttachment('/assets/shot.png', 'trip/day-1')?.path).toBe(
      'assets/shot.png',
    );
  });

  test('percent-decodes the filesystem path but not the preview href', () => {
    const attachment = buildChatImageAttachment('/assets/my%20photo.png', 'note');
    // The agent opens a file on disk — `my%20photo.png` names nothing there.
    expect(attachment?.path).toBe('assets/my photo.png');
    // The thumbnail keeps the URL form the note's own <img> loads.
    expect(attachment?.previewSrc).toBe('/assets/my%20photo.png');
  });

  test('leaves a malformed percent sequence alone instead of throwing', () => {
    expect(buildChatImageAttachment('/assets/100%.png', 'note')?.path).toBe('assets/100%.png');
  });

  test('strips query and hash from the path', () => {
    expect(buildChatImageAttachment('/assets/shot.png?v=2#top', 'note')?.path).toBe(
      'assets/shot.png',
    );
  });

  test('carries alt text only when the note has one', () => {
    expect(buildChatImageAttachment('/a.png', 'note', 'A cat')?.alt).toBe('A cat');
    expect(buildChatImageAttachment('/a.png', 'note', '')?.alt).toBeUndefined();
    expect(buildChatImageAttachment('/a.png', 'note')?.alt).toBeUndefined();
  });

  test('refuses sources with no local file behind them', () => {
    // Nothing for a local agent to open — the action must not be offered.
    expect(buildChatImageAttachment('https://example.com/shot.png', 'note')).toBeNull();
    expect(buildChatImageAttachment('//cdn.example.com/shot.png', 'note')).toBeNull();
    expect(buildChatImageAttachment('data:image/png;base64,AQI=', 'note')).toBeNull();
    expect(buildChatImageAttachment('   ', 'note')).toBeNull();
    expect(buildChatImageAttachment('/', 'note')).toBeNull();
  });

  test('a doc-relative src with no known doc stays unresolved rather than wrong', () => {
    // Without the source doc the folder is unknowable; guessing the root would
    // point the agent at a file that does not exist.
    expect(buildChatImageAttachment('shot.png', null)).toBeNull();
  });
});

describe('chat image attachment events', () => {
  test('delivers the payload to subscribers until unsubscribed', () => {
    const target = new EventTarget();
    const received: string[] = [];
    const unsubscribe = subscribeToChatImageAttachment(
      (attachment) => received.push(attachment.path),
      target,
    );
    requestChatImageAttachment({ path: 'a/one.png', previewSrc: '/a/one.png' }, target);
    unsubscribe();
    requestChatImageAttachment({ path: 'a/two.png', previewSrc: '/a/two.png' }, target);
    expect(received).toEqual(['a/one.png']);
  });

  test('ignores an event carrying no usable attachment', () => {
    const target = new EventTarget();
    let calls = 0;
    subscribeToChatImageAttachment(() => {
      calls += 1;
    }, target);
    target.dispatchEvent(new CustomEvent('synapsenote:chat-image-attachment', { detail: null }));
    expect(calls).toBe(0);
  });
});
