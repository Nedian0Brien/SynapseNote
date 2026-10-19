// writes the values the swift port of morrow's sync is checked against: morrow's own planPull, and the
// key derivation and sealing done with node's crypto exactly as morrow's electron/sync.cts does them.
// run: npm run sync-fixtures, which writes ../App/Tests/Fixtures/sync-fixtures.json
import { createCipheriv, hkdfSync, pbkdf2Sync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { conflictName, isSyncedPath, planPull } from '../vendor/morrow/src/core/sync';

const day = new Date(2026, 9, 16);
type Files = Record<string, string>;
const cases: Array<{ name: string; local: Files; remote: Files; base: Files; device: string }> = [
  { name: 'only remote changed', local: { 'a.md': '1' }, remote: { 'a.md': '2' }, base: { 'a.md': '1' }, device: 'Laptop' },
  { name: 'only local changed', local: { 'a.md': '2' }, remote: { 'a.md': '1' }, base: { 'a.md': '1' }, device: 'Laptop' },
  { name: 'new on both sides', local: { 'x.md': 'x' }, remote: { 'y.md': 'y' }, base: {}, device: 'Laptop' },
  { name: 'deleted there', local: { 'a.md': '1' }, remote: {}, base: { 'a.md': '1' }, device: 'Laptop' },
  { name: 'deleted here', local: {}, remote: { 'a.md': '1' }, base: { 'a.md': '1' }, device: 'Laptop' },
  { name: 'both changed, theirs larger', local: { 'a.md': '2' }, remote: { 'a.md': '9' }, base: { 'a.md': '1' }, device: 'Laptop' },
  { name: 'both changed, ours larger', local: { 'a.md': '9' }, remote: { 'a.md': '2' }, base: { 'a.md': '1' }, device: 'Laptop' },
  { name: 'deleted there, edited here', local: { 'a.md': '2' }, remote: {}, base: { 'a.md': '1' }, device: 'Laptop' },
  { name: 'deleted here, edited there', local: {}, remote: { 'a.md': '2' }, base: { 'a.md': '1' }, device: 'Laptop' },
  { name: 'both added differently', local: { 'n/a.md': 'b' }, remote: { 'n/a.md': 'c' }, base: {}, device: 'Desk: top/1' },
  {
    name: 'kept local bookkeeping',
    local: { '.morrow/workspace.json': '2', '.morrow/review.json': '5' },
    remote: { '.morrow/workspace.json': '3', '.morrow/review.json': '6' },
    base: { '.morrow/workspace.json': '1', '.morrow/review.json': '5' },
    device: 'Laptop',
  },
  {
    name: 'hidden and temporary files are not synced',
    local: { '.obsidian/x.json': 'm', '.trash/old.md': '1', 'a.morrow-tmp-1': 't', '.morrow/history/x.json': 'h' },
    remote: { '.obsidian/x.json': 't', '.trash/old.md': '2', 'a.morrow-tmp-1': 'u', '.morrow/history/x.json': 'i' },
    base: { '.trash/old.md': '1' },
    device: 'Laptop',
  },
  {
    name: 'conflict copy name taken',
    local: { 'a.md': '2', 'a (conflict from Laptop 2026-10-16).md': 'z' },
    remote: { 'a.md': '9', 'a (conflict from Laptop 2026-10-16).md': 'z' },
    base: { 'a.md': '1', 'a (conflict from Laptop 2026-10-16).md': 'z' },
    device: 'Laptop',
  },
  { name: 'empty device name', local: { 'a.md': '2' }, remote: { 'a.md': '9' }, base: { 'a.md': '1' }, device: '  ' },
];

const plans = cases.map((item) => ({ ...item, plan: planPull(item.local, item.remote, item.base, item.device, day) }));
const paths = ['a.md', '.trash/x.md', '.trash', '.morrow/workspace.json', '.morrow/review.json', '.morrow/vault.json', 'x/.git/y', 'a.morrow-tmp-3', 'a.morrow-move-3', '', 'notes/.hidden.md', 'b/.trash/c.md'];

// node's hkdfSync(digest, ikm, salt, info, length), as morrow's peerKey
const secret = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
const ids = ['device-bbbbbbbb', 'device-aaaaaaaa'].sort().join('|');
const peerKey = Buffer.from(hkdfSync('sha256', secret, 'morrow-sync-v1', ids, 32));
// morrow's pairingKey: the code with only A-Z and 2-7 kept, salted with the id of the computer showing it
const code = 'abcd-efgh-2345-6777';
const normal = code.toUpperCase().replace(/[^A-Z2-7]/g, '');
const pairingKey = pbkdf2Sync(normal, 'morrow-pair:device-aaaaaaaa', 200_000, 32, 'sha256');
// morrow's seal with a fixed iv and body, so the swift output can be compared byte for byte
const iv = Buffer.from('0102030405060708090a0b0c', 'hex');
const body = JSON.stringify({ ts: 1792000000000, nonce: 'bm9uY2Vub25jZW5v', payload: { op: 'hello' } });
const cipher = createCipheriv('aes-256-gcm', peerKey, iv);
const sealed = Buffer.concat([cipher.update(body, 'utf8'), cipher.final(), cipher.getAuthTag()]);

const target = process.argv[2];
if (!target) throw new Error('Give the file to write.');
writeFileSync(
  target,
  `${JSON.stringify(
    {
      day: '2026-10-16',
      plans,
      conflictNames: [
        { path: 'notes/Plan.md', device: 'Mac: mini?', name: conflictName('notes/Plan.md', 'Mac: mini?', day) },
        { path: 'README', device: 'iPad', name: conflictName('README', 'iPad', day) },
      ],
      synced: paths.map((path) => ({ path, synced: isSyncedPath(path) })),
      crypto: {
        secret: secret.toString('base64'),
        ids,
        peerKey: peerKey.toString('base64'),
        code,
        pairingSalt: 'morrow-pair:device-aaaaaaaa',
        pairingKey: pairingKey.toString('base64'),
        iv: iv.toString('base64'),
        body,
        data: sealed.toString('base64'),
      },
    },
    null,
    1,
  )}\n`,
);
