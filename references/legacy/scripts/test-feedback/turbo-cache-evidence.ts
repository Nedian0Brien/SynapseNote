import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { repositoryRoot } from './command.ts';

interface TurboRunSummary {
  execution?: {
    attempted?: number;
    cached?: number;
  };
}

function latestSummary(directory: string): string | undefined {
  if (!existsSync(directory)) return undefined;
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(directory, name))
    .filter((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    })
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0];
}

export function turboCacheHit(directory = resolve(repositoryRoot, '.turbo/runs')): boolean | null {
  const path = latestSummary(directory);
  if (!path) return null;
  try {
    const summary = JSON.parse(readFileSync(path, 'utf8')) as TurboRunSummary;
    const attempted = summary.execution?.attempted ?? 0;
    const cached = summary.execution?.cached ?? 0;
    return attempted > 0 ? cached === attempted : null;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const hit = turboCacheHit(process.argv[2] ? resolve(repositoryRoot, process.argv[2]) : undefined);
  console.log(hit === null ? 'unknown' : String(hit));
}
