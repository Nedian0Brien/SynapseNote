// the page's storage once the app's Swift session owns the vault (11c-2): morrow's session here applies every
// command for its own screens and sends it to the app, whose session applies the same command and is the only
// one that writes files. this repository never writes a page; a save is the app saving, and its answer is the
// save result morrow's save queue shows and retries on
import type { Command } from '../../vendor/morrow/src/core/commands';
import type { LoadedWorkspace } from '../../vendor/morrow/src/core/migrations';
import type { DocNode, FileId, FileMeta, PageId, PageMeta, Snapshot, WorkspaceState } from '../../vendor/morrow/src/core/model';
import { errorMessage, fail, ok } from '../../vendor/morrow/src/core/result';
import type { Result } from '../../vendor/morrow/src/core/result';
import { encodePathForUrl } from '../../vendor/morrow/src/core/vault/paths';
import type { StoredFile, WorkspaceRepository, WriteBatch } from '../../vendor/morrow/src/storage/repository';
import type { WorkspaceSession } from '../../vendor/morrow/src/storage/session';
import { post } from '../bridge';
import { call, fromBase64, toBase64 } from './rpc';

export const VAULT_FILE_SCHEME = 'synapse-vault';

// where each page lies and the saves per day, which morrow reads without waiting
export interface VaultInfo {
  paths: Record<PageId, string>;
  activity: Record<string, number>;
}

interface Opened {
  pages: PageMeta[];
  docs: Record<PageId, DocNode>;
  problems: string[];
  unreadable: PageId[];
  firstRun: boolean;
  info: VaultInfo;
}

// answers that carry pages or documents come as JSON text, so their keys keep the order the app holds them in
const callJSON = async <T>(method: string, ...params: unknown[]): Promise<T> =>
  JSON.parse(await call<string>(method, ...params)) as T;

export class ReplicaRepository implements WorkspaceRepository {
  private info: VaultInfo = { paths: {}, activity: {} };

  constructor(readonly location: string) {}

  // where pages lie and the activity count, as the app sends them after saves and outside edits
  absorb(info: VaultInfo | null | undefined): void {
    if (info) this.info = info;
  }

  async load(): Promise<Result<LoadedWorkspace & { firstRun: boolean }>> {
    try {
      const opened = await callJSON<Opened>('open');
      this.absorb(opened.info);
      return ok({ pages: opened.pages, docs: opened.docs, problems: opened.problems, unreadable: opened.unreadable, firstRun: opened.firstRun });
    } catch (error) {
      return fail(`Could not open the folder ${this.location}: ${errorMessage(error)}`);
    }
  }

  // morrow's save queue decides when; the app writes what its session holds and answers with how it went. the
  // versions the queue offers are left out, the app's session takes its own as it writes
  async write(batch: WriteBatch): Promise<void> {
    const queued = batch.pages.length > 0 || batch.docs.length > 0 || batch.removed.length > 0;
    if (!queued && batch.snapshots?.length) {
      await call<null>('importSnapshots', JSON.stringify(batch.snapshots));
      return;
    }
    const saved = await callJSON<{ ok: boolean; error: string | null; info: VaultInfo }>('flush');
    this.absorb(saved.info);
    if (!saved.ok) throw new Error(saved.error ?? 'The app could not save.');
  }

  async markInitialized(): Promise<void> {
    await call<null>('markInitialized');
  }

  async putFiles(files: StoredFile[]): Promise<FileMeta[]> {
    return callJSON<FileMeta[]>('putFiles', JSON.stringify(files.map((file) => ({ meta: file.meta, data: toBase64(file.data) }))));
  }

  fileUrl(id: FileId): string | null {
    return `${VAULT_FILE_SCHEME}://vault/${encodePathForUrl(id)}`;
  }

  pathOf(id: PageId): string | null {
    return this.info.paths[id] ?? null;
  }

  readMeta(name: string): Promise<string | null> {
    return call<string | null>('readMeta', name);
  }

  async writeMeta(name: string, text: string): Promise<void> {
    await call<null>('writeMeta', name, text);
  }

  activity(): Record<string, number> {
    return this.info.activity;
  }

  async unlockPage(id: PageId, password: string): Promise<Result<{ page: PageMeta; doc: DocNode }>> {
    const opened = await callJSON<{ ok: true; page: PageMeta; doc: DocNode } | { ok: false; error: string }>('unlock', id, password);
    return opened.ok ? ok({ page: opened.page, doc: opened.doc }) : fail(opened.error);
  }

  // the app saves the page before it forgets the key; nothing waits for it, as in morrow
  lockPage(id: PageId): void {
    void call<null>('lock', id);
  }

  async protectPage(id: PageId, password: string): Promise<void> {
    await call<null>('protect', id, password);
  }

  unprotectPage(id: PageId): void {
    void call<null>('unprotect', id);
  }

  async getFile(id: FileId): Promise<StoredFile | null> {
    const file = await callJSON<{ meta: FileMeta; data: string } | null>('getFile', id);
    return file ? { meta: file.meta, data: fromBase64(file.data) } : null;
  }

  listFiles(): Promise<FileMeta[]> {
    return callJSON<FileMeta[]>('listFiles');
  }

  async deleteFiles(ids: FileId[]): Promise<void> {
    await call<null>('deleteFiles', JSON.stringify(ids));
  }

  listSnapshots(pageId: PageId): Promise<Snapshot[]> {
    return callJSON<Snapshot[]>('listSnapshots', pageId);
  }

  allSnapshots(): Promise<Snapshot[]> {
    return callJSON<Snapshot[]>('allSnapshots');
  }

  close(): void {}
}

// every command this session applies goes to the app's session too, in the order applied; one that changes
// nothing, or that this session refuses, is not sent
export function sendCommands(session: WorkspaceSession, send: (json: string) => void = (json) => post({ type: 'commands', json })): void {
  const execute = session.execute.bind(session);
  const executeAll = session.executeAll.bind(session);
  session.execute = (command: Command) => {
    const before = session.getState();
    const result = execute(command);
    if (result.ok && session.getState() !== before) send(JSON.stringify({ commands: [command], all: false }));
    return result;
  };
  session.executeAll = (commands: Command[]) => {
    const result = executeAll(commands);
    if (result.ok) send(JSON.stringify({ commands, all: true }));
    return result;
  };
  // restoring keeps the current version first, which only the app's session can write; this session then sets
  // the same document at the same time, without sending it again
  session.restoreSnapshot = async (snapshot: Snapshot): Promise<Result<WorkspaceState>> => {
    if (!session.getState().pages[snapshot.pageId]) return fail('That page no longer exists.');
    await session.flush();
    const restored = await callJSON<{ ok: true; now: number } | { ok: false; error: string }>('restoreSnapshot', JSON.stringify(snapshot));
    if (!restored.ok) return fail(restored.error);
    return execute({ type: 'page.setDoc', id: snapshot.pageId, doc: snapshot.doc, now: restored.now });
  };
}
