// Regenerate yrs-ffi/tests/fixtures/surrogate-splits.tsv:
//   bun native/editor-spike/scripts/gen-surrogate-fixtures.ts
// Each row: case name, base update (hex), edit update (hex), and the text a
// *receiving* Yjs peer ends with as JSON. yrs must end with the same text —
// the sender alone may keep a lone half, every peer decodes U+FFFD.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';

const cases: Record<string, (t: Y.Text) => void> = {
  'delete-high': (t) => t.delete(3, 1),
  'delete-low': (t) => t.delete(4, 1),
  'insert-between': (t) => t.insert(4, 'X'),
  'replace-low': (t) => {
    t.delete(4, 1);
    t.insert(4, '\uDE01');
  },
};

const rows: string[] = [];
for (const [name, edit] of Object.entries(cases)) {
  const origin = new Y.Doc();
  const text = origin.getText('source');
  text.insert(0, 'xya😀bzz');
  const base = Y.encodeStateAsUpdate(origin);
  const sv = Y.encodeStateVector(origin);
  origin.transact(() => edit(text));
  const change = Y.encodeStateAsUpdate(origin, sv);
  const peer = new Y.Doc();
  Y.applyUpdate(peer, base);
  Y.applyUpdate(peer, change);
  rows.push([name, Buffer.from(base).toString('hex'), Buffer.from(change).toString('hex'), JSON.stringify(peer.getText('source').toString())].join('\t'));
}
writeFileSync(join(import.meta.dir, '..', 'yrs-ffi', 'tests', 'fixtures', 'surrogate-splits.tsv'), `${rows.join('\n')}\n`);
console.log(`wrote ${rows.length} cases`);
