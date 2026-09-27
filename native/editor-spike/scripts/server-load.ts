// Server cost of Y.Text-only typing on a large document (REPORT.md, R6 note).
//
//   bun native/editor-spike/scripts/server-load.ts --doc <name> [--seconds 30] [--rate-ms 100]
//
// One Yjs client types into Y.Text('source') the way the native app does;
// a second client measures how long each keystroke takes to come back, and
// the script times GET /api/config once a second. On a small document both
// stay in single-digit milliseconds; the question is how they grow with size.
import { parseArgs } from 'node:util';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

const { values } = parseArgs({
  options: {
    doc: { type: 'string' },
    port: { type: 'string', default: '5180' },
    seconds: { type: 'string', default: '30' },
    'rate-ms': { type: 'string', default: '100' },
    // text: edit Y.Text('source') like the native app; fragment: edit a
    // paragraph's Y.XmlText like the web editor.
    mode: { type: 'string', default: 'text' },
  },
});
if (!values.doc) throw new Error('--doc is required');
const docName = values.doc;
const base = `http://localhost:${values.port}`;
const url = `ws://localhost:${values.port}/collab`;

function connect(): Promise<{ provider: HocuspocusProvider; doc: Y.Doc }> {
  const doc = new Y.Doc();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sync timed out')), 60_000);
    const provider = new HocuspocusProvider({
      url, name: docName, document: doc, token: '{}',
      onSynced: () => { clearTimeout(timer); resolve({ provider, doc }); },
    });
  });
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `n=${s.length} p50=${q(0.5)}ms p95=${q(0.95)}ms max=${s.at(-1)}ms`;
};

const typist = await connect();
const watcher = await connect();
const text = typist.doc.getText('source');
console.log(`doc '${docName}': ${text.length} utf16 units, mode ${values.mode}`);

const sent = new Map<string, number>();
const echo: number[] = [];
watcher.doc.getText('source').observe((event) => {
  for (const op of event.delta) {
    if (typeof op.insert !== 'string') continue;
    for (const m of op.insert.matchAll(/⟦k(\d+)⟧/g)) {
      const t = sent.get(m[1]);
      if (t !== undefined) { echo.push(Date.now() - t); sent.delete(m[1]); }
    }
  }
});

const api: number[] = [];
let n = 0;
const middle = Math.floor(text.length / 2);
const paragraphs = typist.doc
  .getXmlFragment('default')
  .toArray()
  .filter((node): node is Y.XmlElement => node instanceof Y.XmlElement && node.nodeName === 'paragraph');
const target = paragraphs[Math.floor(paragraphs.length / 2)]?.toArray().find((c): c is Y.XmlText => c instanceof Y.XmlText);
if (values.mode === 'fragment' && !target) throw new Error('no paragraph to edit');
const typing = setInterval(() => {
  n++;
  sent.set(String(n), Date.now());
  if (values.mode === 'fragment') target?.insert(0, `⟦k${n}⟧`);
  else text.insert(middle, `⟦k${n}⟧`);
}, Number(values['rate-ms']));
const probing = setInterval(async () => {
  const t = Date.now();
  await fetch(`${base}/api/config`);
  api.push(Date.now() - t);
}, 1000);

await new Promise((r) => setTimeout(r, Number(values.seconds) * 1000));
clearInterval(typing);
clearInterval(probing);
await new Promise((r) => setTimeout(r, 5000));
console.log(`keystrokes sent=${n} echoed=${echo.length} (unechoed after 5s: ${sent.size})`);
console.log(`echo to second client: ${stats(echo)}`);
console.log(`GET /api/config:       ${stats(api)}`);
typist.provider.destroy();
watcher.provider.destroy();
process.exit(0);
