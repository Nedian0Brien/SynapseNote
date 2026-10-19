import { afterEach, describe, expect, it, vi } from 'vitest';
import { markdownToDoc } from '../../vendor/morrow/src/core/markdown/parse';
import { newPageMeta } from '../../vendor/morrow/src/core/model';
import { WorkspaceSession } from '../../vendor/morrow/src/storage/session';
import { ReplicaRepository, sendCommands } from './replica';
import { settle } from './rpc';

afterEach(() => {
  vi.unstubAllGlobals();
});

type Sent = { type: string; id?: number; method?: string; params?: unknown[]; json?: string };

// the app's side: answers storage calls from a table and keeps every message the page posted
function fakeApp(answers: Record<string, (params: unknown[]) => unknown>) {
  const sent: Sent[] = [];
  vi.stubGlobal('window', {
    webkit: {
      messageHandlers: {
        editor: {
          postMessage(message: Sent) {
            sent.push(message);
            if (message.type !== 'rpc') return;
            const answer = answers[message.method!];
            queueMicrotask(() => {
              try {
                settle(message.id!, { ok: true, value: answer ? answer(message.params ?? []) : null });
              } catch (error) {
                settle(message.id!, { ok: false, error: error instanceof Error ? error.message : String(error) });
              }
            });
          },
        },
      },
    },
  });
  return sent;
}

const page = (id: string, title: string) => newPageMeta({ id, parentId: null, title, createdAt: 1 });
const opened = JSON.stringify({
  pages: [page('a', 'A'), page('b', 'B')],
  docs: { a: markdownToDoc('First'), b: markdownToDoc('Second') },
  problems: [],
  unreadable: [],
  firstRun: false,
  info: { paths: { a: 'A.md', b: 'B.md' }, activity: { '2026-10-20': 3 } },
});

async function openSession(answers: Record<string, (params: unknown[]) => unknown> = {}) {
  const sent = fakeApp({ open: () => opened, flush: () => JSON.stringify({ ok: true, error: null, info: { paths: { a: 'A.md' }, activity: {} } }), ...answers });
  const repository = new ReplicaRepository('Notes');
  const result = await WorkspaceSession.open(repository, { delayMs: 0 });
  if (!result.ok) throw new Error(result.error);
  sendCommands(result.value);
  return { session: result.value, repository, sent };
}

const commandsSent = (sent: Sent[]) => sent.filter((message) => message.type === 'commands').map((message) => JSON.parse(message.json!) as unknown);

describe('replica storage', () => {
  it('opens with what the app session holds, and reads paths and activity from it', async () => {
    const { session, repository } = await openSession();
    expect(Object.keys(session.getState().pages)).toEqual(['a', 'b']);
    expect(session.getState().docs.a).toEqual(markdownToDoc('First'));
    expect(repository.pathOf('b')).toBe('B.md');
    expect(session.activity()).toEqual({ '2026-10-20': 3 });
    expect(repository.fileUrl('attachments/my photo.png')).toBe('synapse-vault://vault/attachments/my%20photo.png');
  });

  it('sends a command once it is applied, and never one that changed nothing or was refused', async () => {
    const { session, sent } = await openSession();
    const rename = { type: 'page.rename' as const, id: 'a', title: 'Renamed', now: 5 };
    expect(session.execute(rename).ok).toBe(true);
    expect(session.execute({ type: 'page.rename', id: 'a', title: 'Renamed', now: 6 }).ok).toBe(true);
    expect(session.execute({ type: 'page.rename', id: 'missing', title: 'x', now: 7 }).ok).toBe(false);
    const all = [{ type: 'page.setFavorite' as const, id: 'b', favorite: true }];
    expect(session.executeAll(all).ok).toBe(true);
    expect(commandsSent(sent)).toEqual([
      { commands: [rename], all: false },
      { commands: all, all: true },
    ]);
  });

  it('saves by asking the app, and shows its failure as morrow shows a failed save', async () => {
    let failing = true;
    const { session, sent } = await openSession({
      flush: () => JSON.stringify(failing ? { ok: false, error: 'The disk is full.', info: null } : { ok: true, error: null, info: { paths: {}, activity: {} } }),
    });
    session.execute({ type: 'page.rename', id: 'a', title: 'Renamed', now: 5 });
    expect(await session.flush()).toBe(false);
    expect(session.saveStatus).toMatchObject({ state: 'error', error: 'The disk is full.' });
    failing = false;
    expect(await session.flush()).toBe(true);
    expect(session.saveStatus.state).toBe('saved');
    expect(sent.filter((message) => message.method === 'flush')).toHaveLength(2);
    // the page never writes files itself
    expect(sent.some((message) => message.method === 'apply' || message.method === 'createFile')).toBe(false);
  });

  it('restores a version through the app and sets the same document at the time the app used', async () => {
    const { session, sent } = await openSession({ restoreSnapshot: () => JSON.stringify({ ok: true, now: 42 }) });
    const snapshot = { id: 's1', pageId: 'a', title: 'A', doc: markdownToDoc('Older'), createdAt: 1 };
    const restored = await session.restoreSnapshot(snapshot);
    expect(restored.ok).toBe(true);
    expect(session.getState().docs.a).toEqual(markdownToDoc('Older'));
    expect(session.getState().pages.a!.updatedAt).toBe(42);
    const call = sent.find((message) => message.method === 'restoreSnapshot')!;
    expect(JSON.parse(call.params![0] as string)).toEqual(snapshot);
    // the app's session applied it already, so it is not sent again
    expect(commandsSent(sent)).toEqual([]);
  });

  it('refuses to restore what the app could not keep', async () => {
    const { session } = await openSession({ restoreSnapshot: () => JSON.stringify({ ok: false, error: 'No room.' }) });
    const restored = await session.restoreSnapshot({ id: 's1', pageId: 'a', title: 'A', doc: markdownToDoc('Older'), createdAt: 1 });
    expect(restored).toEqual({ ok: false, error: 'No room.' });
    expect(session.getState().docs.a).toEqual(markdownToDoc('First'));
  });

  it('unlocks through the app and takes the page it read', async () => {
    const { session } = await openSession({
      unlock: ([id, password]) =>
        JSON.stringify(password === 'right' ? { ok: true, page: { ...page(String(id), 'Secret'), encrypted: true }, doc: markdownToDoc('Hidden') } : { ok: false, error: 'That password is not right.' }),
    });
    session.unreadable.add('b');
    expect(await session.unlockPage('b', 'wrong')).toEqual({ ok: false, error: 'That password is not right.' });
    const unlocked = await session.unlockPage('b', 'right');
    expect(unlocked.ok).toBe(true);
    expect(session.getState().pages.b!.title).toBe('Secret');
    expect(session.unreadable.has('b')).toBe(false);
  });
});
