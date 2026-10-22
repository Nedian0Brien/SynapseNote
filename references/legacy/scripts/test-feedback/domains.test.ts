import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { repositoryRoot } from './command.ts';
import { DOMAIN_MANIFESTS, REQUIRED_DOMAIN_NAMES } from './domains.ts';

describe('L1 domain manifests', () => {
  test('registers the required domain contracts with ownership and budgets', () => {
    for (const name of REQUIRED_DOMAIN_NAMES) {
      const manifest = DOMAIN_MANIFESTS[name];
      expect(manifest, `missing domain manifest: ${name}`).toBeDefined();
      expect(manifest.owner.length).toBeGreaterThan(0);
      expect(manifest.reason.length).toBeGreaterThan(0);
      expect(manifest.maxSeconds).toBeGreaterThan(0);
      expect(manifest.maxSeconds).toBeLessThanOrEqual(60);
      expect(manifest.commands.length).toBeGreaterThan(0);
      expect(manifest.files.length).toBeGreaterThan(0);
    }
  });

  test('has no duplicate test files across the domain registry', () => {
    const seen = new Map<string, string>();
    for (const [domain, manifest] of Object.entries(DOMAIN_MANIFESTS)) {
      for (const file of manifest.files) {
        const previous = seen.get(file);
        expect(
          previous,
          `duplicate domain file ${file}: ${previous} and ${domain}`,
        ).toBeUndefined();
        seen.set(file, domain);
      }
    }
  });

  test('points at version-controlled test files', () => {
    for (const manifest of Object.values(DOMAIN_MANIFESTS)) {
      for (const file of manifest.files) {
        expect(existsSync(join(repositoryRoot, file)), `missing domain test file: ${file}`).toBe(
          true,
        );
      }
    }
  });

  test('does not contain empty or shell-concatenated command specs', () => {
    for (const [domain, manifest] of Object.entries(DOMAIN_MANIFESTS)) {
      for (const command of manifest.commands) {
        expect(command.args.length, `${domain} has an empty command`).toBeGreaterThan(0);
        expect(
          command.args.some((arg) => arg === '&&' || arg === '||'),
          `${domain} joins commands in a shell`,
        ).toBe(false);
      }
    }
  });
});
