/**
 * Which formats a pasted URL is offered, and when the menu stays shut.
 *
 * The two axes that matter: recognizing a URL that points back into this
 * vault (that's the whole precondition for the mention row), and refusing
 * to open a menu that would only restate what the paste already did.
 */

import { describe, expect, test } from 'bun:test';
import {
  defaultPasteFormatIndex,
  internalDocTarget,
  pasteFormatOptions,
} from './paste-format-options.ts';

const APP_ORIGIN = 'http://localhost:5173';

describe('internalDocTarget', () => {
  test('reads the docName out of an `synapsenote://open` deep link', () => {
    const target = internalDocTarget({
      url: 'synapsenote://open?project=%2FUsers%2Fme%2Fvault&doc=notes%2Fmeeting-2026',
      appOrigin: APP_ORIGIN,
    });
    expect(target).toEqual({ docName: 'notes/meeting-2026', anchor: null });
  });

  test('a `file=` deep link is a path on disk, not a vault document', () => {
    expect(
      internalDocTarget({
        url: 'synapsenote://open?file=%2FUsers%2Fme%2Fscratch.md',
        appOrigin: APP_ORIGIN,
      }),
    ).toBeNull();
  });

  test('a non-`open` deep-link host (share, screen) is not a document', () => {
    expect(
      internalDocTarget({ url: 'synapsenote://screen?name=graph', appOrigin: APP_ORIGIN }),
    ).toBeNull();
  });

  test('app-origin URL with a document hash resolves, carrying its anchor', () => {
    expect(
      internalDocTarget({
        url: `${APP_ORIGIN}/#/Design%20Notes#the-plan`,
        appOrigin: APP_ORIGIN,
      }),
    ).toEqual({ docName: 'Design Notes', anchor: 'the-plan' });
  });

  test('the same hash on a different origin is somebody else’s app', () => {
    expect(
      internalDocTarget({ url: 'https://example.com/#/Design%20Notes', appOrigin: APP_ORIGIN }),
    ).toBeNull();
  });

  test('app-origin non-document surfaces (graph, chat) are not documents', () => {
    for (const hash of ['#/__graph__', '#/__chat__']) {
      expect(internalDocTarget({ url: `${APP_ORIGIN}/${hash}`, appOrigin: APP_ORIGIN })).toBeNull();
    }
  });

  test('a plain web page is not a document', () => {
    expect(
      internalDocTarget({ url: 'https://example.com/docs/intro', appOrigin: APP_ORIGIN }),
    ).toBeNull();
  });

  test('unparseable input returns null rather than throwing', () => {
    expect(internalDocTarget({ url: 'not a url at all', appOrigin: APP_ORIGIN })).toBeNull();
  });
});

describe('pasteFormatOptions', () => {
  test('web page → url / bookmark / embed, in that order', () => {
    expect(pasteFormatOptions({ url: 'https://example.com', appOrigin: APP_ORIGIN })).toEqual([
      'url',
      'bookmark',
      'embed',
    ]);
  });

  test('vault document → mention / url only', () => {
    expect(
      pasteFormatOptions({
        url: 'synapsenote://open?project=%2Fv&doc=Design%20Notes',
        appOrigin: APP_ORIGIN,
      }),
    ).toEqual(['mention', 'url']);
  });

  test('a non-web scheme has one form, so the menu never opens', () => {
    expect(pasteFormatOptions({ url: 'mailto:a@example.com', appOrigin: APP_ORIGIN })).toEqual([
      'url',
    ]);
  });
});

describe('defaultPasteFormatIndex', () => {
  test('opens on `url` — the format the paste already applied', () => {
    expect(defaultPasteFormatIndex(['url', 'bookmark', 'embed'])).toBe(0);
    expect(defaultPasteFormatIndex(['mention', 'url'])).toBe(1);
  });
});
