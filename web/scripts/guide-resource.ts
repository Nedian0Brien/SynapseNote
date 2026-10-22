// morrow's welcome guide (core/sample.ts with this app's renames) as the app puts it in a new vault, written as
// commands with placeholders the app fills when it opens a vault for the first time (App/Sources/Core/Session/
// WelcomeGuide.swift): every new page id, every day named relative to today and every time relative to now.
// it also writes the guide made at a fixed time with counted ids, for the app's test of the filling.
// run: npm run guide-resource, which writes ../App/Resources/WelcomeGuide.json and
// ../App/Tests/Fixtures/core/expected/guide.json
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { sampleCommands } from '../vendor/morrow/src/core/sample';
import { dateKey } from '../vendor/morrow/src/core/daily';

const [resource, fixtures] = process.argv.slice(2);
if (!resource || !fixtures) throw new Error('usage: guide-resource <resource file> <fixtures dir>');
if (process.env.TZ !== 'UTC') throw new Error('run with TZ=UTC, the days are read back from UTC dates');

const DAY = 86_400_000;
// a time no guide text names, so a date or a number near it can only come from now
const BASE = Date.UTC(2100, 0, 15, 12, 0, 0);
const NEAR = 400;

let next = 0;
const ids: string[] = [];
const commands = sampleCommands(() => {
  const id = `@@id:${++next}@@`;
  ids.push(id);
  return id;
}, BASE);

const baseDay = Date.UTC(2100, 0, 15);
function placeholders(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (key, year: string, month: string, day: string) => {
      const offset = Math.round((Date.UTC(Number(year), Number(month) - 1, Number(day)) - baseDay) / DAY);
      if (Math.abs(offset) > NEAR) return key;
      if (dateKey(new Date(BASE + offset * DAY)) !== key) throw new Error(`${key} is not a day from now`);
      return `@@day:${offset}@@`;
    });
  }
  if (typeof value === 'number') {
    return Math.abs(value - BASE) <= NEAR * DAY ? { '@@now': value - BASE } : value;
  }
  if (Array.isArray(value)) return value.map(placeholders);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, placeholders(item)]));
  }
  return value;
}

const template = placeholders(commands);
const text = JSON.stringify(template);
// every id the guide made is a placeholder, and nothing near now is left as it was
if (/2100-01/.test(text)) throw new Error('a day from now was left in the guide');
writeFileSync(resource, `${JSON.stringify({ ids: next, commands: template })}\n`);

// the same guide at a fixed time with counted ids, as the session fixtures make it
const FIXED_NOW = Date.UTC(2026, 9, 19, 9, 30, 0);
let counted = 0;
writeFileSync(
  path.join(fixtures, 'expected', 'guide.json'),
  `${JSON.stringify({ now: FIXED_NOW, commands: sampleCommands(() => `s${++counted}`, FIXED_NOW) }, null, 1)}\n`,
);
