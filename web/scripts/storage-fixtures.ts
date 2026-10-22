// writes the values the swift storage (11c) is checked against: what morrow's session, save queue, vault
// repository and page encryption do with the same inputs. run: npm run storage-fixtures, which writes
// ../App/Tests/Fixtures/core/expected/{crypto,storage,save-queue}.json
//
// the clock moves only when a step says so, ids and random bytes come from counters, and the time zone is
// fixed (TZ=UTC in the npm script), so the output is the same on every run. the passwords here belong to
// these fixtures only.

// new Date() and Date.now() read this clock; page history is due every ten minutes, so steps move it
let clock = Date.UTC(2026, 9, 19, 9, 30, 0);
const RealDate = Date;
class SteppedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(clock);
    else super(...(args as [string | number]));
  }
  static override now(): number {
    return clock;
  }
}
globalThis.Date = SteppedDate as DateConstructor;
// snapshot ids and the salt and iv of encrypted pages: a counter and a running byte sequence
let snapshotIds = 0;
globalThis.crypto.randomUUID = () =>
  `00000000-0000-4000-8000-${String(++snapshotIds).padStart(12, '0')}` as ReturnType<Crypto['randomUUID']>;
let randomByte = 0;
globalThis.crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
  if (array instanceof Uint8Array) for (let i = 0; i < array.length; i++) array[i] = randomByte++ & 0xff;
  return array;
}) as Crypto['getRandomValues'];

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decryptPage, encryptPage, deriveKey, readEncrypted } from '../vendor/morrow/src/core/crypto';
import { markdownToDoc } from '../vendor/morrow/src/core/markdown/parse';
import { sampleCommands } from '../vendor/morrow/src/core/sample';
import type { Command } from '../vendor/morrow/src/core/commands';
import type { WorkspaceState } from '../vendor/morrow/src/core/model';
import type { VaultOp } from '../vendor/morrow/src/core/vault/plan';
import { MemoryVault } from '../vendor/morrow/src/storage/memoryVault';
import type { ExternalPatch, WriteBatch } from '../vendor/morrow/src/storage/repository';
import { SaveQueue } from '../vendor/morrow/src/storage/saveQueue';
import { WorkspaceSession } from '../vendor/morrow/src/storage/session';
import type { VaultChange } from '../vendor/morrow/src/storage/vaultBridge';
import { VaultRepository } from '../vendor/morrow/src/storage/vaultRepository';

const fixtures = process.argv[2] ?? '';
if (!fixtures) throw new Error('Give the fixtures folder.');
const out = path.join(fixtures, 'expected');

function write(name: string, value: unknown, indent = 0): void {
  writeFileSync(path.join(out, name), `${JSON.stringify(value, null, indent)}\n`);
}

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const MINUTE = 60_000;

// ---- encryption: the same password, salt, iv and text always give the same file

async function cryptoCases(): Promise<unknown> {
  const plains = [
    '',
    'one line',
    '---\ntitle: Secret\n---\n\nA page with **bold**, a [[link]] and 한글 and an emoji 🎉.\n',
    'x'.repeat(200),
  ];
  const cases: unknown[] = [];
  for (const [index, plain] of plains.entries()) {
    const password = ['fixture password', 'pässwörd ✓', ''][index % 3]!;
    const iterations = index === 2 ? 600_000 : 100_000;
    const salt = Uint8Array.from({ length: 16 }, (_, i) => (index * 31 + i * 7) & 0xff);
    const pageKey = await deriveKey(password, salt, iterations);
    const ivStart = randomByte;
    const text = await encryptPage(plain, pageKey);
    const opened = await decryptPage(text, password);
    const wrong = await decryptPage(text, `${password}!`);
    cases.push({ plain, password, iterations, salt: base64(salt), ivStart, text, decrypted: opened?.plain ?? null, wrong: wrong === null });
  }
  const headers = [
    '---\nmorrow-encrypted: aes-256-gcm\nkdf: pbkdf2-sha256\niterations: 600000\nsalt: AAAA\niv: AAAA\n---\nbody\n',
    '---\nmorrow-encrypted: aes-256-gcm\niterations: 5\nsalt: AAAA\niv: AAAA\n---\nlow iterations fall back\n',
    '---\nmorrow-encrypted: aes-128-cbc\nsalt: AAAA\niv: AAAA\n---\nother cipher\n',
    '---\nmorrow-encrypted: aes-256-gcm\nsalt: "@@"\niv: AAAA\n---\nbad salt\n',
    '---\ntitle: plain\n---\nnot encrypted\n',
    'no frontmatter at all',
  ];
  return {
    cases,
    headers: headers.map((text) => {
      const header = readEncrypted(text);
      return { text, header: header && { salt: base64(header.salt), iv: base64(header.iv), iterations: header.iterations, body: header.body } };
    }),
  };
}

// ---- the save queue on a clock that only moves when told

async function saveQueueTimeline(): Promise<unknown> {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const events: unknown[] = [];
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = ((fn: () => void, delay: number) => {
    const id = nextTimer++;
    timers.set(id, { at: now + delay, fn });
    events.push({ t: now, schedule: delay });
    return id;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => {
    timers.delete(id);
  }) as unknown as typeof clearTimeout;
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

  let failures = 0;
  let pages: Record<string, unknown> = { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } };
  const queue = new SaveQueue(
    {
      async write(batch: WriteBatch) {
        events.push({ t: now, write: { pages: batch.pages.map((page) => page.id), docs: batch.docs.map((doc) => doc.id), removed: batch.removed } });
        if (failures > 0) {
          failures--;
          throw new Error('The disk is full.');
        }
      },
    },
    () => ({ pages, docs: Object.fromEntries(Object.keys(pages).map((id) => [id, { type: 'doc' }])) }) as unknown as WorkspaceState,
    { now: () => now },
  );
  queue.subscribe(() => events.push({ t: now, status: { ...queue.status } }));

  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
      await settle();
    }
    now = end;
  };
  const script: unknown[] = [
    { enqueue: { pages: ['a'], docs: ['a'], removed: [] } },
    { advance: 100 },
    { enqueue: { pages: [], docs: ['b'], removed: [] } },
    { advance: 400 },
    { fail: 2 },
    { enqueue: { pages: ['c'], docs: [], removed: [] } },
    { advance: 300 },
    { advance: 500 },
    { enqueue: { pages: [], docs: ['a'], removed: [] } },
    { advance: 1000 },
    { advance: 2500 },
    { remove: 'a' },
    { enqueue: { pages: [], docs: [], removed: ['a'] } },
    { flush: true },
    { advance: 1000 },
  ];
  for (const step of script as Array<Record<string, unknown>>) {
    events.push({ t: now, step });
    if (step.enqueue) queue.enqueue(step.enqueue as { pages: string[]; docs: string[]; removed: string[] });
    if (typeof step.advance === 'number') await advance(step.advance);
    if (typeof step.fail === 'number') failures = step.fail;
    if (typeof step.remove === 'string') {
      const { [step.remove]: _gone, ...rest } = pages;
      pages = rest;
    }
    if (step.flush) events.push({ t: now, flushed: await queue.flush() });
  }
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  return { script, events };
}

// ---- the whole storage: session, save queue, vault repository and an in-memory vault

type Action =
  | { type: 'commands'; commands: Command[]; all?: boolean }
  | { type: 'edits'; id: string; commands: Command[]; every: number }
  | { type: 'external'; changes: VaultChange[]; before?: Command[] }
  | { type: 'protect'; id: string; password: string }
  | { type: 'lock'; id: string }
  | { type: 'unlock'; id: string; password: string }
  | { type: 'unprotect'; id: string }
  | { type: 'restore'; id: string; index: number }
  | { type: 'putFiles'; files: Array<{ name: string; type: string; base64: string }> }
  | { type: 'deleteFiles'; ids: string[] }
  | { type: 'meta'; name: string; text: string }
  | { type: 'snapshots'; id: string };

async function storageSteps(): Promise<unknown> {
  // where the byte sequence and the snapshot ids stand when the session opens
  const start = { randomByte, snapshotIds, clock };
  const vault = new MemoryVault();
  let ops: unknown[] = [];
  const apply = vault.apply.bind(vault);
  vault.apply = async (list: VaultOp[]) => {
    ops.push(...list);
    return apply(list);
  };
  const createFile = vault.createFile.bind(vault);
  vault.createFile = async (file: string, data: ArrayBuffer) => {
    ops.push({ op: 'create', path: file, size: data.byteLength });
    return createFile(file, data);
  };
  const opened = await WorkspaceSession.open(new VaultRepository(vault, counter('r')), { delayMs: 0 });
  if (!opened.ok) throw new Error(opened.error);
  const session = opened.value;
  let external: { patch: ExternalPatch; accepted: string[] } | null = null;
  session.onExternal((patch, accepted) => {
    external = { patch: JSON.parse(JSON.stringify(patch)) as ExternalPatch, accepted: [...accepted] };
  });
  const listeners = (vault as unknown as { listeners: Set<(changes: VaultChange[]) => void> }).listeners;
  // a change another app makes: the files change first, then the watcher reports them
  const deliver = (changes: VaultChange[]) => {
    for (const change of changes) {
      if (change.dir) continue;
      if (change.text === null) vault.files.delete(change.path);
      else (vault as unknown as { put(path: string, data: string): void }).put(change.path, change.text);
    }
    for (const listener of listeners) listener(changes);
  };

  const state = () => session.getState();
  const byTitle = (title: string) => {
    const page = Object.values(state().pages).find((candidate) => candidate.title === title);
    if (!page) throw new Error(`No page ${title}`);
    return page.id;
  };
  const steps: unknown[] = [];
  let previous: WorkspaceState = state();
  const record = (name: string, action: Action, at: number, result: unknown) => {
    const now = state();
    const docs: Record<string, unknown> = {};
    for (const [id, doc] of Object.entries(now.docs)) if (previous.docs[id] !== doc) docs[id] = doc;
    const goneDocs = Object.keys(previous.docs).filter((id) => !(id in now.docs));
    steps.push({
      name,
      at,
      action,
      result,
      external,
      ops,
      pages: now.pages,
      docs,
      goneDocs,
      unreadable: [...session.unreadable],
      activity: session.activity(),
      status: session.saveStatus.state,
    });
    previous = now;
    ops = [];
    external = null;
  };
  const run = async (name: string, minutes: number, make: () => Action) => {
    clock += minutes * MINUTE;
    const at = clock;
    const action = make();
    let result: unknown = null;
    switch (action.type) {
      case 'commands':
        if (action.all) {
          const done = session.executeAll(action.commands);
          result = [done.ok ? { ok: true } : { ok: false, error: done.error }];
        } else {
          result = action.commands.map((command) => {
            const done = session.execute(command);
            return done.ok ? { ok: true } : { ok: false, error: done.error };
          });
        }
        await session.flush();
        break;
      case 'edits':
        for (const command of action.commands) {
          clock += action.every;
          session.execute(command);
          await session.flush();
        }
        break;
      case 'external':
        for (const command of action.before ?? []) session.execute(command);
        deliver(action.changes);
        await session.flush();
        break;
      case 'protect': {
        const done = await session.protectPage(action.id, action.password);
        result = done.ok ? { ok: true } : { ok: false, error: done.error };
        break;
      }
      case 'lock':
        await session.lockPage(action.id);
        break;
      case 'unlock': {
        const done = await session.unlockPage(action.id, action.password);
        result = done.ok ? { ok: true } : { ok: false, error: done.error };
        break;
      }
      case 'unprotect': {
        const done = await session.unprotectPage(action.id);
        result = done.ok ? { ok: true } : { ok: false, error: done.error };
        break;
      }
      case 'restore': {
        const snapshot = (await session.listSnapshots(action.id))[action.index]!;
        const done = await session.restoreSnapshot(snapshot);
        result = done.ok ? { ok: true, snapshot: snapshot.id } : { ok: false, error: done.error };
        await session.flush();
        break;
      }
      case 'putFiles': {
        const added = await session.addFiles(
          action.files.map((file) => {
            const bytes = Buffer.from(file.base64, 'base64');
            return {
              meta: { id: 'new', name: file.name, type: file.type, size: bytes.byteLength, createdAt: clock },
              data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
            };
          }),
        );
        result = added.ok ? { ok: true, files: added.value } : { ok: false, error: added.error };
        break;
      }
      case 'deleteFiles':
        await session.deleteFiles(action.ids);
        result = { files: (await session.listFiles()).map((file) => file.id) };
        break;
      case 'meta':
        await session.writeMeta(action.name, action.text);
        result = { read: await session.readMeta(action.name), refused: await session.readMeta('../escape.json') };
        break;
      case 'snapshots':
        result = (await session.listSnapshots(action.id)).map((snapshot) => ({ id: snapshot.id, title: snapshot.title, createdAt: snapshot.createdAt, doc: snapshot.doc }));
        break;
    }
    record(name, action, at, result);
  };

  const now = () => clock;
  await run('guide', 0, () => ({ type: 'commands', commands: sampleCommands(counter('s'), clock), all: true }));
  const writing = byTitle('Writing and formatting');
  const welcome = byTitle('Welcome to Morrow');
  const links = byTitle('Links, tags and the graph');
  const fileOf = (id: string) => session.pathOf(id)!;
  const doc = (markdown: string) => markdownToDoc(markdown);

  // page history: a version at most every ten minutes, at most fifty per page
  await run('edit', 1, () => ({ type: 'commands', commands: [{ type: 'page.setDoc', id: writing, doc: doc('First edit.'), now: now() }] }));
  await run('edit again soon', 2, () => ({ type: 'commands', commands: [{ type: 'page.setDoc', id: writing, doc: doc('Second edit, too soon for a version.'), now: now() }] }));
  await run('edit later', 11, () => ({ type: 'commands', commands: [{ type: 'page.setDoc', id: writing, doc: doc('Third edit, ten minutes on.'), now: now() }] }));
  await run('many edits', 0, () => ({
    type: 'edits',
    id: links,
    every: 11 * MINUTE,
    commands: Array.from({ length: 52 }, (_, i) => ({ type: 'page.setDoc' as const, id: links, doc: doc(`Version ${i + 1} of the page.`), now: clock + (i + 1) * 11 * MINUTE })),
  }));
  await run('versions', 1, () => ({ type: 'snapshots', id: writing }));
  await run('restore', 1, () => ({ type: 'restore', id: writing, index: 1 }));

  // edits made by other apps
  await run('outside edit', 1, () => ({
    type: 'external',
    changes: [{ path: fileOf(welcome), text: '---\ntitle: Welcome, from outside\n---\n\nEdited in another app.\n', mtime: clock, birthtime: clock - MINUTE }],
  }));
  await run('own write comes back', 1, () => ({
    type: 'external',
    changes: [{ path: fileOf(welcome), text: vault.text(fileOf(welcome))!, mtime: clock, birthtime: clock - MINUTE }],
  }));
  await run('new files', 1, () => ({
    type: 'external',
    changes: [
      { path: 'From outside.md', text: '# From outside\n\nLinks to [[Writing and formatting]] and ![[photo.png]].\n', mtime: clock, birthtime: clock },
      { path: 'Outside folder/Nested note.md', text: 'A note in a new folder.\n', mtime: clock, birthtime: clock },
      { path: 'photo.png', text: '', mtime: clock, birthtime: clock, other: true },
      { path: '.obsidian/workspace.json', text: '{}', mtime: clock, birthtime: clock },
    ],
  }));
  await run('rename outside', 1, () => ({
    type: 'external',
    changes: [
      { path: 'From outside.md', text: null, mtime: clock, birthtime: 0 },
      { path: 'Renamed outside.md', text: vault.text('From outside.md')!, mtime: clock, birthtime: clock },
    ],
  }));
  await run('delete outside', 1, () => ({
    type: 'external',
    changes: [{ path: 'Outside folder/Nested note.md', text: null, mtime: clock, birthtime: 0 }],
  }));
  await run('folder gone', 1, () => ({ type: 'external', changes: [{ path: 'Outside folder', text: null, mtime: clock, birthtime: 0, dir: true, other: true }] }));
  // an edit here that is not saved yet keeps winning, the other version goes to page history
  const daily = byTitle('Daily notes, tasks and templates');
  await run('conflict', 1, () => ({
    type: 'external',
    before: [{ type: 'page.setDoc', id: daily, doc: doc('Typed here, not saved yet.'), now: now() }],
    changes: [{ path: fileOf(daily), text: 'Typed in another app at the same time.\n', mtime: clock, birthtime: clock }],
  }));
  await run('conflict versions', 1, () => ({ type: 'snapshots', id: daily }));

  // password protected pages
  const secret = byTitle('Privacy, history and encryption');
  await run('protect', 1, () => ({ type: 'protect', id: secret, password: 'fixture password' }));
  await run('edit encrypted', 1, () => ({ type: 'commands', commands: [{ type: 'page.setDoc', id: secret, doc: doc('Still secret, edited.'), now: now() }] }));
  await run('lock', 1, () => ({ type: 'lock', id: secret }));
  await run('wrong password', 1, () => ({ type: 'unlock', id: secret, password: 'not it' }));
  await run('unlock', 1, () => ({ type: 'unlock', id: secret, password: 'fixture password' }));
  await run('edit unlocked', 11, () => ({ type: 'commands', commands: [{ type: 'page.setDoc', id: secret, doc: doc('Edited after unlocking.'), now: now() }] }));
  await run('unprotect', 1, () => ({ type: 'unprotect', id: secret }));

  // attachments and morrow's own files
  const png = base64(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  await run('files', 1, () => ({
    type: 'putFiles',
    files: [
      { name: 'photo.png', type: 'image/png', base64: png },
      { name: 'photo.png', type: 'image/png', base64: png },
      { name: 'Report: Q3?.PDF', type: 'application/pdf', base64: base64(Uint8Array.from([1, 2, 3])) },
      { name: 'no extension', type: 'application/octet-stream', base64: base64(Uint8Array.from([4])) },
      { name: '.hidden', type: 'text/plain', base64: base64(Uint8Array.from([5])) },
    ],
  }));
  await run('delete files', 1, () => ({ type: 'deleteFiles', ids: ['attachments/photo 2.png'] }));
  await run('meta', 1, () => ({ type: 'meta', name: 'review.json', text: '{"card":{"due":"2026-10-20"}}' }));

  const files: Record<string, string> = {};
  for (const [file, data] of vault.files) if (typeof data === 'string') files[file] = data;
  await session.close();
  return { start, steps, files };
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  write('crypto.json', await cryptoCases(), 1);
  write('save-queue.json', await saveQueueTimeline(), 1);
  write('storage.json', await storageSteps());
  console.log(`wrote crypto.json, save-queue.json and storage.json to ${path.relative(process.cwd(), out)}`);
}

await main();
