// Concurrency soak for the native editor spike (spec R2).
//
//   bun native/editor-spike/scripts/soak.ts --minutes 10 \
//     --content-dir <dir the dev server was started with> --udid <simulator>
//
// Runs three writers against one document for the given time:
//   a  the iPad app, typing into Y.Text('source') (launched here with -soakSeconds)
//   f  a Yjs client editing Y.XmlFragment('default') the way the web editor does
//   p  POST /api/agent-patch find/replace calls
// Each writer periodically inserts a marker `⟦<source>:<unix ms>⟧`; an observer
// client records when each marker first appears in Y.Text('source'). After the
// writers stop it waits for the server's store debounce, then compares SHA-256
// of the file on disk, a fresh client's Y.Text, and the app's Y.Text.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

const { values } = parseArgs({
  options: {
    minutes: { type: 'string', default: '10' },
    port: { type: 'string', default: '5180' },
    // Default: a fresh copy of fixtures/spike.md per run, so markers and
    // block rewrites from earlier runs cannot leak into this one's numbers.
    doc: { type: 'string' },
    'content-dir': { type: 'string' },
    udid: { type: 'string' },
    bundle: { type: 'string', default: 'dev.synapsenote.spike.editor' },
    'settle-seconds': { type: 'string', default: '15' },
    // No writer deletes anything; every marker must be in the final text.
    'insert-only': { type: 'boolean', default: false },
    // Control runs: launch the app to sync only (no typing), or make it type
    // plain words without Markdown/MDX punctuation.
    'app-idle': { type: 'boolean', default: false },
    'app-plain': { type: 'boolean', default: false },
    'no-fragment': { type: 'boolean', default: false },
    'no-patch': { type: 'boolean', default: false },
    // Leave the app out entirely: only the fragment/patch writers and the server.
    'no-app': { type: 'boolean', default: false },
  },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const contentDir = values['content-dir'];
const udid = values.udid;
const noApp = values['no-app'] as boolean;
if (!contentDir || (!udid && !noApp)) throw new Error('--content-dir and --udid are required');

const durationMs = Number(values.minutes) * 60_000;
const insertOnly = values['insert-only'] as boolean;
const docName = values.doc ?? `soak-${Date.now()}`;
if (!values.doc) {
  copyFileSync(join(import.meta.dir, '..', 'fixtures', 'spike.md'), join(contentDir, `${docName}.md`));
  await sleep(2000); // let the server's watcher index the new file
}
const runStartedAt = Date.now();
const httpBase = `http://localhost:${values.port}`;
const wsUrl = `ws://localhost:${values.port}/collab`;
const MARKER = /⟦([afp]):(\d{13})⟧/g;

/** Move `offset` past any marker it falls strictly inside. */
function outsideMarkers(text: string, offset: number): number {
  for (const m of text.matchAll(MARKER)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (start < offset && offset < end) return end;
  }
  return offset;
}

// Yjs (JS) lets a peer split a surrogate pair; yrs cannot represent the
// resulting lone surrogate and diverges (see REPORT.md). Real editors do not
// split pairs, so the synthetic writers must not either.
const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
/** Move a boundary off the middle of a surrogate pair. */
function onCodePoint(text: string, offset: number): number {
  return offset > 0 && offset < text.length && isLow(text.charCodeAt(offset)) && isHigh(text.charCodeAt(offset - 1))
    ? offset + 1
    : offset;
}

function overlapsMarker(text: string, start: number, end: number): boolean {
  for (const m of text.matchAll(MARKER)) {
    const ms = m.index ?? 0;
    if (ms < end && start < ms + m[0].length) return true;
  }
  return false;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const rand = (n: number) => Math.floor(Math.random() * n);

function connect(label: string): Promise<{ provider: HocuspocusProvider; doc: Y.Doc }> {
  const doc = new Y.Doc();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: sync timed out`)), 15_000);
    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: docName,
      document: doc,
      token: '{}',
      onSynced: () => {
        clearTimeout(timer);
        resolve({ provider, doc });
      },
    });
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarize(label: string, samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  return `${label}: n=${s.length} p50=${percentile(s, 50)}ms p95=${percentile(s, 95)}ms max=${s.at(-1) ?? 'n/a'}ms`;
}

function appContainer(): string {
  return execFileSync('xcrun', ['simctl', 'get_app_container', udid as string, values.bundle as string, 'data'], {
    encoding: 'utf8',
  }).trim();
}

// ── observer: first-seen latency of every marker in Y.Text('source') ───────
const observer = await connect('observer');
const seen = new Map<string, number>();
const observedLatency: Record<string, number[]> = { a: [], f: [], p: [] };
// A marker inserted again means the server deleted and re-inserted the span
// around it (a block rewrite during fragment → Y.Text serialization).
let observedReinserts = 0;
observer.doc.getText('source').observe((event) => {
  const now = Date.now();
  for (const op of event.delta) {
    if (typeof op.insert !== 'string') continue;
    for (const m of op.insert.matchAll(MARKER)) {
      if (Number(m[2]) < runStartedAt) continue;
      if (seen.has(m[0])) {
        observedReinserts++;
        continue;
      }
      seen.set(m[0], now);
      observedLatency[m[1]].push(now - Number(m[2]));
    }
  }
});

// ── f: fragment writer ──────────────────────────────────────────────────────
const fragmentWriter = await connect('fragment-writer');
let fragmentEdits = 0;
function fragmentStep() {
  const fragment = fragmentWriter.doc.getXmlFragment('default');
  const paragraphs = fragment
    .toArray()
    .filter((n): n is Y.XmlElement => n instanceof Y.XmlElement && n.nodeName === 'paragraph')
    .map((p) => p.toArray().find((c): c is Y.XmlText => c instanceof Y.XmlText))
    .filter((t): t is Y.XmlText => t !== undefined && t.length > 0);
  if (paragraphs.length === 0) return;
  const text = paragraphs[rand(paragraphs.length)];
  fragmentWriter.doc.transact(() => {
    const current = text.toString();
    if (!insertOnly && fragmentEdits % 3 === 2 && text.length > 8) {
      const at = onCodePoint(current, rand(text.length - 3));
      const end = onCodePoint(current, Math.min(current.length, at + 2));
      if (end > at && !overlapsMarker(current, at, end)) text.delete(at, end - at);
    } else {
      const at = onCodePoint(current, outsideMarkers(current, rand(text.length + 1)));
      text.insert(at, fragmentEdits % 3 === 0 ? `⟦f:${Date.now()}⟧` : ' 편집');
    }
  });
  fragmentEdits++;
}

// ── p: agent-patch writer ───────────────────────────────────────────────────
let patchOk = 0;
let patchMiss = 0;
async function patchStep() {
  const res = await fetch(`${httpBase}/api/document?docName=${encodeURIComponent(docName)}`);
  const { content } = (await res.json()) as { content: string };
  if (content.length < 40) return;
  const start = onCodePoint(content, rand(content.length - 20));
  const find = content.slice(start, onCodePoint(content, start + 12));
  if (!find.trim() || overlapsMarker(content, start, start + 12) || find.includes('⟦') || find.includes('⟧')) return;
  const patch = await fetch(`${httpBase}/api/agent-patch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ docName, find, replace: `${find}⟦p:${Date.now()}⟧`, summary: 'native spike soak' }),
  });
  if (patch.ok) patchOk++;
  else patchMiss++;
}

// ── a: launch the app in soak mode ──────────────────────────────────────────
const soakSeconds = Math.round(durationMs / 1000);
if (!noApp) {
  try {
    execFileSync('xcrun', ['simctl', 'terminate', udid as string, values.bundle as string], { stdio: 'ignore' });
  } catch {}
  execFileSync('xcrun', [
    'simctl', 'launch', udid as string, values.bundle as string,
    '-serverURL', wsUrl, '-docName', docName, '-soakSeconds', values['app-idle'] ? '0' : String(soakSeconds),
    '-soakInsertOnly', insertOnly ? '1' : '0',
    '-soakPlainTokens', values['app-plain'] ? '1' : '0',
  ]);
}
console.log(`soak: ${values.minutes} min on '${docName}' — app, fragment writer, agent-patch`);

const startedAt = Date.now();
const fragmentTimer = setInterval(() => {
  if (!values['no-fragment']) fragmentStep();
}, 400);
let patching = !values['no-patch'];
const patchLoop = (async () => {
  while (patching) {
    await patchStep().catch(() => patchMiss++);
    await sleep(700);
  }
})();
const progress = setInterval(() => {
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`  ${elapsed}s  fragment=${fragmentEdits} patch ok/miss=${patchOk}/${patchMiss} markers seen=${seen.size}`);
}, 30_000);

await sleep(durationMs);
clearInterval(fragmentTimer);
patching = false;
await patchLoop;
clearInterval(progress);

// Wait for the app timer to stop, the server's 2s/10s store debounce, and the
// shadow-repo idle flush.
const endedAt = Date.now();
await sleep(Number(values['settle-seconds']) * 1000);

// ── compare ─────────────────────────────────────────────────────────────────
// Poll until disk, a fresh client, and the app agree (or 30s pass), so a store
// debounce that is merely late is told apart from one that never converges.
const fresh = await connect('verifier');
const readAppHash = () => {
  if (noApp) return { hash: 'n/a', length: 'n/a', at: Number.POSITIVE_INFINITY };
  const [hash, length, at] = readFileSync(join(appContainer(), 'Documents', 'soak-hash.txt'), 'utf8').trim().split(' ');
  return { hash, length, at: Number(at) };
};
let disk = '';
let serverText = '';
let app = readAppHash();
let convergedAfterMs = -1;
const compareStartedAt = Date.now();
while (Date.now() - compareStartedAt <= 30_000) {
  disk = readFileSync(join(contentDir, `${docName}.md`), 'utf8');
  serverText = fresh.doc.getText('source').toString();
  app = readAppHash();
  const diskOk = sha256(disk) === sha256(serverText);
  const appOk = noApp || (app.at > endedAt && app.hash === sha256(serverText));
  if (diskOk && appOk) {
    convergedAfterMs = Date.now() - compareStartedAt;
    break;
  }
  await sleep(2000);
}
const lifecycle = fresh.doc.getMap('lifecycle').toJSON();
const appHash = app.hash;
const appLength = app.length;

const appLatency: Record<string, number[]> = { f: [], p: [] };
let appReinserts = 0;
const appFile = (name: string) => (noApp ? '' : readFileSync(join(appContainer(), 'Documents', name), 'utf8'));
for (const line of appFile('soak-latency.txt').split('\n')) {
  const [source, ms] = line.split(' ');
  if (source === 'r') appReinserts++;
  else if (source in appLatency) appLatency[source].push(Number(ms));
}
const appLog = appFile('soak-log.txt');
const divergences = appLog.split('\n').filter((l) => l.includes('diverged') || l.includes('rejected')).length;

const missing = insertOnly ? [...seen.keys()].filter((m) => !serverText.includes(m)) : [];
const hashes = { disk: sha256(disk), server: sha256(serverText), app: appHash };
const match = hashes.disk === hashes.server && (noApp || hashes.server === hashes.app);
console.log('\nresult');
console.log(`  disk   ${hashes.disk}  (${disk.length} utf16)`);
console.log(`  server ${hashes.server}  (${serverText.length} utf16)`);
console.log(`  app    ${hashes.app}  (${appLength} utf16)`);
console.log(`  hashes ${match ? 'MATCH' : 'MISMATCH'}${convergedAfterMs >= 0 ? ` (converged ${convergedAfterMs}ms after the ${values['settle-seconds']}s settle)` : ' (not converged within 30s)'}`);
console.log(`  doc ${docName}`);
console.log(`  lifecycle ${JSON.stringify(lifecycle)}`);
console.log(`  app binding divergences/rejections: ${divergences}`);
if (insertOnly) {
  const bySource = { a: 0, f: 0, p: 0 } as Record<string, number>;
  for (const m of missing) bySource[m[1]]++;
  console.log(`  insert-only: markers seen=${seen.size} missing from final text=${missing.length} (a=${bySource.a} f=${bySource.f} p=${bySource.p})${missing.length ? ` e.g. ${missing.slice(0, 5).join(' ')}` : ''}`);
}
console.log(`  marker re-inserts (block rewrites): observer=${observedReinserts} app=${appReinserts}`);
console.log(`  writes: fragment=${fragmentEdits} patch ok=${patchOk} miss=${patchMiss}`);
console.log('latency to server Y.Text (observer):');
for (const [source, samples] of Object.entries(observedLatency)) console.log(`  ${summarize(source, samples)}`);
console.log('latency to app:');
for (const [source, samples] of Object.entries(appLatency)) console.log(`  ${summarize(source, samples)}`);

observer.provider.destroy();
fragmentWriter.provider.destroy();
fresh.provider.destroy();
process.exit(match && missing.length === 0 ? 0 : 1);
