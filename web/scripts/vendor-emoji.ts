// writes the emoji the icon picker offers and pages are drawn with into ../App/Emoji, kept in the repository so
// the app builds without node: microsoft's fluent 3d emoji images, as morrow's vite.config.ts copies them, and
// the emojibase list morrow's EmojiPicker reads, without skin tones. run: npm run vendor-emoji
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: vendor-emoji <out dir>');
const modules = path.resolve('node_modules');

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'emoji'), { recursive: true });

const images = path.join(modules, '@lobehub/fluent-emoji-3d/assets');
for (const name of readdirSync(images).filter((entry) => entry.endsWith('.webp'))) {
  copyFileSync(path.join(images, name), path.join(out, 'emoji', name));
}

const data = JSON.parse(readFileSync(path.join(modules, 'emojibase-data/en/compact.json'), 'utf8')) as Array<{
  unicode: string;
  label: string;
  group?: number;
  order?: number;
  tags?: string[];
}>;
const list = data
  .filter((emoji) => emoji.group !== undefined && emoji.group !== 2)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((emoji) => ({ e: emoji.unicode, l: emoji.label, g: emoji.group, t: emoji.tags ?? [] }));
writeFileSync(path.join(out, 'emoji-index.json'), JSON.stringify(list));

const licences = ['@lobehub/fluent-emoji-3d', 'emojibase-data'].map((name) => {
  const dir = path.join(modules, name);
  const info = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version: string; license?: string };
  const file = readdirSync(dir).find((entry) => /^(licen[cs]e|copying)/i.test(entry));
  const text = file ? readFileSync(path.join(dir, file), 'utf8').trim() : `Licence: ${info.license ?? 'unknown'}`;
  return `${'='.repeat(64)}\n${name} ${info.version}\n${'='.repeat(64)}\n${text}\n`;
});
writeFileSync(path.join(out, 'THIRD_PARTY_LICENSES.txt'), `Licences of the packages in App/Emoji.\n\n${licences.join('\n')}`);
