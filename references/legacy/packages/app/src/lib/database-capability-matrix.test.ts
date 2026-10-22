import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATABASE_TOOLBAR_CAPABILITIES,
  databaseCapabilityById,
} from './database-capability-matrix';

const APP_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('database toolbar capability matrix', () => {
  test('every visible capability points at an existing production owner and command', () => {
    for (const capability of DATABASE_TOOLBAR_CAPABILITIES) {
      const sourcePath = join(APP_SRC, 'editor/components', capability.owner);
      const componentPath = join(APP_SRC, 'components', capability.owner);
      const file = existsSync(sourcePath) ? sourcePath : componentPath;
      expect(existsSync(file), `${capability.id} owner must exist`).toBe(true);
      const source = readFileSync(file, 'utf8');
      expect(source, `${capability.id} must call ${capability.handler}`).toContain(
        capability.handler,
      );
      expect(source, `${capability.id} must not be an empty click target`).not.toMatch(
        /onClick=\{\s*\(?(?:event)?\)?\s*=>\s*\{\s*\}\s*\}/,
      );
    }
  });

  test('row open is owned by the canonical command, not an optional callback branch', () => {
    expect(databaseCapabilityById('row-open').handler).toBe('requestOpenDatabaseRecord');
    expect(
      readFileSync(join(APP_SRC, 'editor/components/use-inline-database-commands.ts'), 'utf8'),
    ).toContain('requestOpenDatabaseRecord');
  });
});
