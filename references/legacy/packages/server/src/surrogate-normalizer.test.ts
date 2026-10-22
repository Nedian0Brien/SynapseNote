import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { attachSurrogateNormalizer, SURROGATE_REPAIR_ORIGIN } from './surrogate-normalizer.ts';

function setup(initial: string) {
  const server = new Y.Doc();
  server.getText('source').insert(0, initial);
  const repairs: number[] = [];
  const detach = attachSurrogateNormalizer(server, (count) => repairs.push(count));
  return { server, text: server.getText('source'), repairs, detach };
}

describe('surrogate normalizer', () => {
  test('a lone half written by the server itself becomes U+FFFD, and the fix reaches peers', () => {
    const { server, text, repairs } = setup('a😀b');
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(server));
    server.on('update', (update: Uint8Array) => Y.applyUpdate(peer, update));

    // The shape the old DMP path produced for 😀→😁: keep the high half,
    // swap the low one. Yjs splits the item and writes U+FFFD for the high
    // half; the inserted low half stays lone in this doc only.
    text.delete(2, 1);
    text.insert(2, '\uDE01');

    expect(text.toString()).toBe('a\uFFFD\uFFFDb');
    expect(peer.getText('source').toString()).toBe('a\uFFFD\uFFFDb');
    expect(repairs).toEqual([1]);
  });

  test('a lone half sent by a client arrives as U+FFFD, so the server needs no repair', () => {
    const { server, text, repairs } = setup('x');
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    const sv = Y.encodeStateVector(client);
    client.getText('source').insert(1, '\uD83D');
    Y.applyUpdate(server, Y.encodeStateAsUpdate(client, sv));
    expect(client.getText('source').toString()).toBe('x\uD83D'); // the sender keeps it
    expect(text.toString()).toBe('x\uFFFD'); // UTF-8 on the wire turned it into U+FFFD
    expect(repairs).toEqual([]);
  });

  test('well-formed text and edits that keep pairs intact are left alone', () => {
    const { text, repairs } = setup('한글 😀');
    text.insert(text.length, ' 👍🏽');
    text.delete(0, 1);
    expect(text.toString()).toBe('글 😀 👍🏽');
    expect(repairs).toEqual([]);
  });

  test('the repair transaction does not trigger another repair', () => {
    const { server, text, repairs } = setup('ab');
    let repairDrains = 0;
    server.on('afterTransaction', (tr: Y.Transaction) => {
      if (tr.origin === SURROGATE_REPAIR_ORIGIN) repairDrains++;
    });
    server.transact(() => text.insert(1, '\uDE00\uD83D'));
    expect(text.toString()).toBe('a\uFFFD\uFFFDb');
    expect(repairDrains).toBe(1);
    expect(repairs).toEqual([2]);
  });

  test('detach stops normalizing', () => {
    const { text, detach, repairs } = setup('ab');
    detach();
    text.insert(1, '\uD83D');
    expect(text.toString()).toBe('a\uD83Db');
    expect(repairs).toEqual([]);
  });
});
