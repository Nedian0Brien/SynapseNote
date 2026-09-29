/**
 * Deterministic three-writer simulator for the server bridge.
 *
 * A server `Document` runs the real observers; an app client edits
 * `Y.Text('source')` and a web client edits the XmlFragment through
 * ProseMirror transactions, while an agent patches the server document with
 * `applyAgentMarkdownWrite`. Updates travel through per-direction FIFO queues
 * and are delivered in batches chosen by a seeded PRNG, so a seed replays
 * the same interleaving exactly. Each writer inserts unique markers
 * `⟦<writer>:<n>⟧`; after the queues drain, every marker is classified as
 * intact, duplicated, split (its characters survive in order with other text
 * between them — a concurrent insert, not a loss) or deleted.
 */
import { Document } from '@hocuspocus/server';
import { EditorState } from '@tiptap/pm/state';
import { initProseMirrorDoc, updateYFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { AGENT_WRITE_ORIGIN, applyAgentMarkdownWrite } from './agent-sessions.ts';
import { mdManager, schema } from './md-manager.ts';
import { setupServerObservers } from './server-observers.ts';
import { attachSurrogateNormalizer } from './surrogate-normalizer.ts';

export type Writer = 'app' | 'web' | 'agent';

export interface SimOptions {
  seed: number;
  steps: number;
  writers: readonly Writer[];
  /** Initial markdown (defaults to a generated document of `blocks` sections). */
  markdown?: string;
  sections?: number;
  /** Record the first step after which the server's Y.Text or fragment holds a marker twice. */
  trace?: boolean;
  /** With `trace`: an invariant on the server's Y.Text; the first step that breaks it is recorded. */
  check?: (text: string) => boolean;
}

export interface InvariantBreak {
  step: number;
  action: string;
  observerAPaths: string[];
  before: string;
  after: string;
}

export interface FirstDuplication {
  step: number;
  action: string;
  surface: 'ytext' | 'fragment';
  /** Observer A paths taken during that step (`incremental` or `full:<reason>`). */
  observerAPaths: string[];
  marker: string;
  before: { ytext: string; fragment: string };
  after: { ytext: string; fragment: string };
}

export interface MarkerVerdict {
  marker: string;
  writer: Writer;
  verdict: 'intact' | 'duplicated' | 'split' | 'deleted';
  count: number;
}

export interface SimResult {
  converged: boolean;
  text: string;
  written: number;
  duplicated: MarkerVerdict[];
  deleted: MarkerVerdict[];
  split: number;
  firstDuplication?: FirstDuplication;
  firstInvariantBreak?: InvariantBreak;
}

/** Tokens the native spike app types, including Markdown caught mid-typing. */
const APP_TOKENS = [
  'hello',
  '세상',
  '노트',
  'sync',
  ' ',
  ' ',
  '\n',
  '\n\n',
  '*',
  '**',
  '**bo',
  'bold**',
  '_',
  '`',
  '``',
  '[',
  '[ ]',
  '[x',
  '] ',
  '- ',
  '- [ ] ',
  '1. ',
  '# ',
  '## ',
  '#',
  '> ',
  '|',
  'é',
];

export function generateDocument(sections: number): string {
  const lines: string[] = [];
  for (let s = 0; s < sections; s++) {
    lines.push(`## Section ${s}`, '');
    for (let p = 0; p < 8; p++) {
      lines.push(
        `Paragraph ${s}.${p} with **bold**, *italic*, \`code\`, and a [link](https://example.com/${s}/${p}).`,
      );
    }
    lines.push(
      '',
      '- [ ] a task',
      '- [x] a done task',
      '- a bullet with **emphasis**',
      '',
      '> a quote line',
      '',
    );
  }
  return lines.join('\n');
}

function prng(seed: number): { next(): number; int(n: number): number } {
  let s = seed >>> 0 || 1;
  const next = () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n) };
}

const MARKER = /⟦[a-z]+:\d+⟧/g;
const MARKER_PREFIX: Record<Writer, string> = { app: 'a', web: 'w', agent: 'p' };

/** Move `offset` out of any marker and off the low half of a surrogate pair. */
function safeOffset(text: string, offset: number): number {
  let at = offset;
  for (const m of text.matchAll(MARKER)) {
    const start = m.index ?? 0;
    if (start < at && at < start + m[0].length) at = start + m[0].length;
  }
  if (at > 0 && at < text.length && (text.charCodeAt(at) & 0xfc00) === 0xdc00) at++;
  return at;
}

interface Queue {
  updates: Uint8Array[];
}

export function runSimulation(options: SimOptions): SimResult {
  const rng = prng(options.seed);
  const markdown = options.markdown ?? generateDocument(options.sections ?? 3);

  let stepPaths: string[] = [];
  const server = new Document('sim');
  const serverText = server.getText('source');
  const serverFragment = server.getXmlFragment('default');
  server.transact(() => {
    serverText.insert(0, markdown);
    updateYFragment(server, serverFragment, schema.nodeFromJSON(mdManager.parse(markdown)), {
      mapping: new Map(),
      isOMark: new Map(),
    });
  });
  const cleanupObservers = setupServerObservers({
    doc: server,
    xmlFragment: serverFragment,
    ytext: serverText,
    mdManager,
    schema,
    docName: 'sim',
    onObserverAPath: (path, reason) =>
      stepPaths.push(path === 'incremental' ? path : `full:${reason}`),
  });
  const detachNormalizer = attachSurrogateNormalizer(server);

  const REMOTE = Symbol('remote');
  const clients = { app: new Y.Doc(), web: new Y.Doc() };
  const connections = { app: { connection: 'app' }, web: { connection: 'web' } };
  const toServer: Record<'app' | 'web', Queue> = { app: { updates: [] }, web: { updates: [] } };
  const toClient: Record<'app' | 'web', Queue> = { app: { updates: [] }, web: { updates: [] } };
  const initial = Y.encodeStateAsUpdate(server);
  for (const name of ['app', 'web'] as const) {
    Y.applyUpdate(clients[name], initial, REMOTE);
    clients[name].on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE) toServer[name].updates.push(update);
    });
  }
  // Hocuspocus sends every server update to every connection, the sender included.
  server.on('update', (update: Uint8Array) => {
    toClient.app.updates.push(update);
    toClient.web.updates.push(update);
  });

  const deliver = (queue: Queue, apply: (update: Uint8Array) => void, count: number): void => {
    for (const update of queue.updates.splice(0, count)) apply(update);
  };
  const deliverSome = (): void => {
    const which = rng.int(4);
    const name = which % 2 === 0 ? 'app' : 'web';
    lastAction = which < 2 ? `deliver ${name}→server` : `deliver server→${name}`;
    if (which < 2) {
      const q = toServer[name];
      deliver(
        q,
        (u) => Y.applyUpdate(server, u, connections[name]),
        1 + rng.int(q.updates.length || 1),
      );
    } else {
      const q = toClient[name];
      deliver(
        q,
        (u) => Y.applyUpdate(clients[name], u, REMOTE),
        1 + rng.int(q.updates.length || 1),
      );
    }
  };

  const written: { marker: string; writer: Writer }[] = [];
  let markerCount = 0;
  const nextMarker = (writer: Writer): string => {
    const marker = `⟦${MARKER_PREFIX[writer]}:${markerCount++}⟧`;
    written.push({ marker, writer });
    return marker;
  };

  let appEdits = 0;
  const appEdit = (): void => {
    const text = clients.app.getText('source');
    const current = text.toString();
    const at = safeOffset(current, rng.int(current.length + 1));
    const token =
      ++appEdits % 10 === 0 ? nextMarker('app') : APP_TOKENS[rng.int(APP_TOKENS.length)];
    clients.app.transact(() => text.insert(at, token));
  };

  let webEdits = 0;
  const webEdit = (): void => {
    const fragment = clients.web.getXmlFragment('default');
    const { doc: pmDoc, meta } = initProseMirrorDoc(fragment, schema);
    const spots: { from: number; text: string }[] = [];
    pmDoc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return true;
      // Plain-text paragraphs only, so textContent offsets are positions.
      let plain = node.content.size > 0;
      node.forEach((child) => {
        if (!child.isText) plain = false;
      });
      if (plain) spots.push({ from: pos + 1, text: node.textContent });
      return false;
    });
    if (spots.length === 0) return;
    const spot = spots[rng.int(spots.length)];
    const offset = safeOffset(spot.text, rng.int(spot.text.length + 1));
    const insert = ++webEdits % 3 === 0 ? nextMarker('web') : ' 편집';
    const tr = EditorState.create({ doc: pmDoc }).tr.insertText(insert, spot.from + offset);
    clients.web.transact(() => updateYFragment(clients.web, fragment, tr.doc, meta));
  };

  const agentPatch = (): void => {
    const current = serverText.toString();
    if (current.length < 40) return;
    const start = safeOffset(current, rng.int(current.length - 20));
    const find = current.slice(start, start + 12);
    if (!find.trim() || find.includes('⟦') || find.includes('⟧')) return;
    const pos = current.indexOf(find);
    const marker = nextMarker('agent');
    const next = current.slice(0, pos) + find + marker + current.slice(pos + find.length);
    server.transact(() => {
      applyAgentMarkdownWrite(server, next, 'patch');
    }, AGENT_WRITE_ORIGIN);
  };

  /** The fragment's text content (attributes such as link hrefs left out). */
  const fragmentText = (): string => {
    const parts: string[] = [];
    const walk = (node: Y.XmlElement | Y.XmlFragment | Y.XmlText): void => {
      if (node instanceof Y.XmlText) {
        for (const op of node.toDelta() as { insert: unknown }[]) {
          if (typeof op.insert === 'string') parts.push(op.insert);
        }
        return;
      }
      for (const child of node.toArray()) {
        if (child instanceof Y.XmlText || child instanceof Y.XmlElement) walk(child);
      }
      parts.push('\n');
    };
    walk(serverFragment);
    return parts.join('');
  };
  const duplicatedMarker = (text: string): string | undefined => {
    const seen = new Set<string>();
    for (const m of text.matchAll(MARKER)) {
      if (seen.has(m[0])) return m[0];
      seen.add(m[0]);
    }
    return undefined;
  };
  let firstDuplication: FirstDuplication | undefined;
  let firstInvariantBreak: InvariantBreak | undefined;
  let lastAction = '';
  const traced = (name: string, run: () => void) => (): void => {
    if (!options.trace || (firstDuplication && (!options.check || firstInvariantBreak)))
      return run();
    const before = { ytext: serverText.toString(), fragment: fragmentText() };
    lastAction = name;
    stepPaths = [];
    run();
    const after = { ytext: serverText.toString(), fragment: fragmentText() };
    if (
      options.check &&
      !firstInvariantBreak &&
      !options.check(after.ytext) &&
      options.check(before.ytext)
    ) {
      firstInvariantBreak = {
        step: currentStep,
        action: lastAction,
        observerAPaths: stepPaths,
        before: before.ytext,
        after: after.ytext,
      };
    }
    for (const surface of ['ytext', 'fragment'] as const) {
      const marker = duplicatedMarker(after[surface]);
      if (marker && !firstDuplication) {
        firstDuplication = {
          step: currentStep,
          action: lastAction,
          surface,
          marker,
          observerAPaths: stepPaths,
          before,
          after,
        };
      }
    }
  };
  let currentStep = 0;

  const actions: { weight: number; run: () => void }[] = [];
  if (options.writers.includes('app'))
    actions.push({ weight: 6.7, run: traced('app edit', appEdit) });
  if (options.writers.includes('web'))
    actions.push({ weight: 2.5, run: traced('web edit', webEdit) });
  if (options.writers.includes('agent'))
    actions.push({ weight: 1.4, run: traced('agent patch', agentPatch) });
  actions.push({ weight: 6, run: traced('deliver', deliverSome) });
  const total = actions.reduce((sum, a) => sum + a.weight, 0);

  for (let step = 0; step < options.steps; step++) {
    currentStep = step;
    let roll = rng.next() * total;
    for (const action of actions) {
      roll -= action.weight;
      if (roll <= 0) {
        action.run();
        break;
      }
    }
  }

  // Drain every queue until nothing is in flight.
  for (let round = 0; round < 1000; round++) {
    const pending =
      toServer.app.updates.length +
      toServer.web.updates.length +
      toClient.app.updates.length +
      toClient.web.updates.length;
    if (pending === 0) break;
    currentStep = options.steps + round;
    for (const name of ['app', 'web'] as const) {
      traced(`drain ${name}→server`, () =>
        deliver(
          toServer[name],
          (u) => Y.applyUpdate(server, u, connections[name]),
          toServer[name].updates.length,
        ),
      )();
      traced(`drain server→${name}`, () =>
        deliver(
          toClient[name],
          (u) => Y.applyUpdate(clients[name], u, REMOTE),
          toClient[name].updates.length,
        ),
      )();
    }
  }

  const text = serverText.toString();
  const converged =
    clients.app.getText('source').toString() === text &&
    clients.web.getText('source').toString() === text;
  cleanupObservers();
  detachNormalizer();

  const verdicts = written.map(({ marker, writer }) => classify(text, marker, writer));
  return {
    converged,
    text,
    written: written.length,
    duplicated: verdicts.filter((v) => v.verdict === 'duplicated'),
    deleted: verdicts.filter((v) => v.verdict === 'deleted'),
    split: verdicts.filter((v) => v.verdict === 'split').length,
    firstDuplication,
    firstInvariantBreak,
  };
}

/** Intact once, duplicated if more, split if its characters survive in order nearby, else deleted. */
export function classify(text: string, marker: string, writer: Writer): MarkerVerdict {
  const count = text.split(marker).length - 1;
  if (count === 1) return { marker, writer, verdict: 'intact', count };
  if (count > 1) return { marker, writer, verdict: 'duplicated', count };
  const head = marker.slice(0, 3); // `⟦w:`
  for (let i = text.indexOf(head); i >= 0; i = text.indexOf(head, i + 1)) {
    let j = 0;
    for (let k = i; k < text.length && k < i + 400 && j < marker.length; k++) {
      if (text[k] === marker[j]) j++;
    }
    if (j === marker.length) return { marker, writer, verdict: 'split', count };
  }
  return { marker, writer, verdict: 'deleted', count };
}
