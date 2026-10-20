// writes archives made by fflate, as Morrow makes its exports and reads its imports (zipSync, unzipSync), with
// what is in them, for the Swift zip to read. run: npm run zip-fixtures, which writes
// ../App/Tests/Fixtures/core/expected/zip.json
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';

const out = process.argv[2];
if (!out) throw new Error('usage: zip-fixtures <fixtures dir>');

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const long = 'Morrow keeps your notes as Markdown. '.repeat(400);
const binary = new Uint8Array(512).map((_, index) => (index * 37) % 256);
const entries: Record<string, Uint8Array> = {
  'Morrow/Home.md': strToU8('# Home\n\nStart here.\n'),
  'Morrow/한글 페이지.md': strToU8('한글 본문과 😀\n'),
  'Morrow/attachments/picture.bin': binary,
  'Morrow/empty.md': new Uint8Array(0),
  'Morrow/long.md': strToU8(long),
};
const archives = [
  // Morrow's own exports: level 6
  { name: 'level6', data: zipSync(entries, { level: 6 }) },
  // stored, and a folder entry, as other tools write them
  { name: 'stored', data: zipSync({ 'folder/': new Uint8Array(0), 'folder/a.md': strToU8('a') }, { level: 0 }) },
];
writeFileSync(
  path.join(out, 'expected', 'zip.json'),
  `${JSON.stringify(
    {
      archives: archives.map((archive) => ({ name: archive.name, zip: base64(archive.data) })),
      entries: Object.fromEntries(Object.entries(entries).map(([name, data]) => [name, base64(data)])),
    },
    null,
    1,
  )}\n`,
);
