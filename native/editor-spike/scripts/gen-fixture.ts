// Populate a content directory for the spike's dev server:
//   bun native/editor-spike/scripts/gen-fixture.ts --out <dir>
// Writes spike.md (copied from fixtures/) and large.md (5,000 lines, R6).
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('--out <dir> is required');
mkdirSync(values.out, { recursive: true });

copyFileSync(join(import.meta.dir, '..', 'fixtures', 'spike.md'), join(values.out, 'spike.md'));

const lines: string[] = [];
for (let section = 0; lines.length < 5000; section++) {
  lines.push(`## Section ${section}`, '');
  for (let i = 0; i < 8; i++) {
    lines.push(`Paragraph ${section}.${i} with **bold**, *italic*, \`code\`, and a [link](https://example.com/${section}/${i}).`);
  }
  lines.push('', '- [ ] a task', '- [x] a done task', '- a bullet with **emphasis**', '', '> a quote line', '');
}
writeFileSync(join(values.out, 'large.md'), `${lines.slice(0, 5000).join('\n')}\n`);
console.log(`wrote spike.md and large.md (5000 lines) to ${values.out}`);
