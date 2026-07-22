import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDatabaseManifestYaml, serializeDatabaseManifestYaml } from './manifest.ts';
import { DATABASE_MANIFEST_MIGRATIONS, planDatabaseManifestMigration } from './migration.ts';
import {
  DATABASE_MANIFEST_CURRENT_VERSION,
  DATABASE_MANIFEST_SUPPORTED_VERSIONS,
  DatabaseDefinitionSchema,
} from './schema.ts';

function manifest(): string {
  return serializeDatabaseManifestYaml(
    DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_migrations',
      key: 'migrations',
      name: 'Migrations',
      contract: {
        purpose: 'Verify manifest migration contracts',
        canonicality: 'canonical',
        vocabulary: ['migration'],
        freshness: { expectation: 'manual' },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_migrations',
          key: 'migrations',
          name: 'Migrations',
          recordMeaning: 'One migration fixture',
          folder: 'migrations',
          properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
        },
      ],
    }),
  );
}

describe('database manifest migration contract', () => {
  test('defines a canonical identity migration for every currently supported version', () => {
    expect(DATABASE_MANIFEST_CURRENT_VERSION).toBe(DATABASE_MANIFEST_SUPPORTED_VERSIONS.at(-1));
    for (const version of DATABASE_MANIFEST_SUPPORTED_VERSIONS) {
      expect(DATABASE_MANIFEST_MIGRATIONS).toContainEqual({
        id: `database-manifest-v${version}-identity`,
        fromVersion: version,
        toVersion: version,
        kind: 'identity',
        lossless: true,
        preservesSourceBytes: true,
      });

      const reachable = new Set<number>([version]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const migration of DATABASE_MANIFEST_MIGRATIONS) {
          if (reachable.has(migration.fromVersion) && !reachable.has(migration.toVersion)) {
            reachable.add(migration.toVersion);
            changed = true;
          }
        }
      }
      expect(reachable.has(DATABASE_MANIFEST_CURRENT_VERSION)).toBe(true);
    }
  });

  test('plans the v1 identity byte-for-byte without rewriting comments', () => {
    const yaml = manifest().replace('version: 1\n', '# keep migration comment\nversion: 1\n');
    expect(planDatabaseManifestMigration(yaml)).toEqual({
      status: 'not_needed',
      sourceVersion: 1,
      targetVersion: 1,
      migrationIds: ['database-manifest-v1-identity'],
      lossless: true,
      changed: false,
      outputYaml: yaml,
    });
  });

  test('refuses invalid, future source, and future target versions without output', () => {
    expect(planDatabaseManifestMigration('version: nope\n')).toMatchObject({
      status: 'blocked',
      code: 'invalid_source_version',
      outputYaml: null,
    });
    expect(planDatabaseManifestMigration('version: 1\nid: nope\n')).toMatchObject({
      status: 'blocked',
      sourceVersion: 1,
      code: 'invalid_manifest',
      outputYaml: null,
    });
    expect(
      planDatabaseManifestMigration(manifest().replace('version: 1', 'version: 2')),
    ).toMatchObject({
      status: 'blocked',
      sourceVersion: 2,
      code: 'unsupported_source_version',
      outputYaml: null,
    });
    expect(planDatabaseManifestMigration(manifest(), 2)).toMatchObject({
      status: 'blocked',
      targetVersion: 2,
      code: 'unsupported_target_version',
      outputYaml: null,
    });
  });

  test('migrates the representative supported-version corpus without byte, semantic, or ID loss', () => {
    const corpusDirectory = fileURLToPath(new URL('./fixtures/v1/corpus/', import.meta.url));
    const files = readdirSync(corpusDirectory)
      .filter((name) => name.endsWith('.yml'))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const yaml = readFileSync(
        fileURLToPath(new URL(`./fixtures/v1/corpus/${file}`, import.meta.url)),
        'utf8',
      );
      const parsed = planDatabaseManifestMigration(yaml, DATABASE_MANIFEST_CURRENT_VERSION);
      expect(parsed).toMatchObject({
        status: 'not_needed',
        sourceVersion: 1,
        targetVersion: DATABASE_MANIFEST_CURRENT_VERSION,
        lossless: true,
        changed: false,
        outputYaml: yaml,
      });
      const beforeParsed = parseDatabaseManifestYaml(yaml);
      if (!beforeParsed.ok) throw new Error(`source corpus is invalid: ${file}`);
      const before = DatabaseDefinitionSchema.parse(beforeParsed.definition);
      if (parsed.status !== 'not_needed') throw new Error(`corpus migration blocked: ${file}`);
      const afterParsed = parseDatabaseManifestYaml(parsed.outputYaml);
      if (!afterParsed.ok) throw new Error(`migrated corpus is invalid: ${file}`);
      expect(afterParsed.definition).toEqual(before);
      const collectIds = (value: unknown): string[] => {
        const ids: string[] = [];
        const visit = (entry: unknown): void => {
          if (Array.isArray(entry)) {
            entry.forEach(visit);
            return;
          }
          if (!entry || typeof entry !== 'object') return;
          for (const [key, child] of Object.entries(entry)) {
            if (key === 'id' && typeof child === 'string') ids.push(child);
            visit(child);
          }
        };
        visit(value);
        return ids.sort();
      };
      expect(collectIds(afterParsed.definition)).toEqual(collectIds(before));
    }
  });
});
