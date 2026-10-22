import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';
import sharp from 'sharp';

// Regenerates the downloadable SynapseNote brand kit from the public wordmark
// and icon assets. Run after changing either source asset.

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'public', 'brand');
const wordmark = readFileSync(path.join(root, 'public', 'synapsenote-wordmark.svg'), 'utf8');
const darkWordmark = wordmark
  .replaceAll('#0F172A', '#F8FAFC')
  .replace('stroke="white"', 'stroke="#0F172A"');
const icon = readFileSync(path.join(root, 'public', 'synapsenote-logo.png'));

type SvgAsset = { file: string; svg: string };
const svgAssets: SvgAsset[] = [
  { file: 'synapsenote-logo', svg: wordmark },
  { file: 'synapsenote-logo-white', svg: darkWordmark },
];

mkdirSync(outDir, { recursive: true });

async function main() {
  const zipEntries: Record<string, Uint8Array> = {};

  for (const asset of svgAssets) {
    const svgBytes = new TextEncoder().encode(asset.svg);
    const png = await sharp(Buffer.from(asset.svg), { density: 400 })
      .resize({ width: 2400 })
      .png()
      .toBuffer();
    writeFileSync(path.join(outDir, `${asset.file}.svg`), asset.svg);
    writeFileSync(path.join(outDir, `${asset.file}.png`), png);
    zipEntries[`${asset.file}.svg`] = svgBytes;
    zipEntries[`${asset.file}.png`] = new Uint8Array(png);
  }

  writeFileSync(path.join(outDir, 'synapsenote-icon.png'), icon);
  zipEntries['synapsenote-icon.png'] = new Uint8Array(icon);

  const zip = zipSync(zipEntries, { level: 6 });
  writeFileSync(path.join(outDir, 'synapsenote-brand.zip'), zip);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
