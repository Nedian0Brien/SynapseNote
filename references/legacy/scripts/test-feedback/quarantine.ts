import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repositoryRoot } from './command.ts';

export const QUARANTINE_MANIFEST_PATH = join(
  repositoryRoot,
  'scripts/test-feedback/quarantine.json',
);

export interface QuarantineEntry {
  expiresOn: string;
  file: string;
  id: string;
  issue: string;
  owner: string;
  replacementCoverage: string[];
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function validateQuarantineEntries(entries: QuarantineEntry[], today = new Date()): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw new Error('quarantine entries must be objects');
    if (!entry.id || ids.has(entry.id))
      throw new Error(`duplicate or empty quarantine id: ${entry.id}`);
    ids.add(entry.id);
    if (!entry.file || !existsSync(join(repositoryRoot, entry.file))) {
      throw new Error(`quarantine file does not exist: ${entry.file}`);
    }
    if (!entry.owner || !entry.issue || !/^https?:\/\//.test(entry.issue)) {
      throw new Error(`quarantine entry ${entry.id} needs an owner and issue URL`);
    }
    if (!isDate(entry.expiresOn) || Date.parse(`${entry.expiresOn}T00:00:00Z`) < today.getTime()) {
      throw new Error(`quarantine entry ${entry.id} is expired or has an invalid expiry date`);
    }
    if (
      !Array.isArray(entry.replacementCoverage) ||
      entry.replacementCoverage.length === 0 ||
      entry.replacementCoverage.some((file) => !file)
    ) {
      throw new Error(`quarantine entry ${entry.id} needs replacement coverage`);
    }
  }
}

export function readQuarantineManifest(path = QUARANTINE_MANIFEST_PATH): QuarantineEntry[] {
  const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(value)) throw new Error(`quarantine manifest must be an array: ${path}`);
  const entries = value as QuarantineEntry[];
  validateQuarantineEntries(entries);
  return entries;
}
