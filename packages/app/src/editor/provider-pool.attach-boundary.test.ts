/**
 * Structural enforcement of the persistence-attach boundary contract
 * (see the `buildPersistence` JSDoc in provider-pool.ts): every
 * persistence attach is either CLAIM-FENCED (the synchronous admission
 * attach in `open()`) or STORED-STATE-VALIDATED (the spine's terminal
 * attach arm, `attachValidatedPersistence`) — so `buildPersistence`
 * has exactly those two callers. A third call site would bypass both
 * fences and re-open the dead-lineage union-merge corruption class,
 * invisibly in the field — which is why the contract is machine-
 * enforced rather than comment-enforced. Mirrors the registry meta-test
 * idiom of `paired-write-enforcement.test.ts` (packages/server).
 *
 * Structural, not runtime, by necessity: "no third caller exists" is a
 * property of the source, not of any executable behavior a unit test
 * could observe.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';

const SANCTIONED_CALLERS = ['attachValidatedPersistence', 'open'] as const;

describe('persistence-attach boundary (buildPersistence callers)', () => {
  test('buildPersistence has exactly the two sanctioned callers', () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const sourceFiles = ['provider-pool-persistence.ts', 'provider-pool-connection.ts'].map(
      (file) => project.addSourceFileAtPath(join(import.meta.dir, file)),
    );

    const callerMethods = sourceFiles
      .flatMap((sourceFile) => sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression))
      .filter((call) => {
        const expression = call.getExpression();
        return (
          expression.getKind() === SyntaxKind.PropertyAccessExpression &&
          expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName() ===
            'buildPersistence'
        );
      })
      .map((call) => {
        const method = call.getFirstAncestorByKind(SyntaxKind.MethodDeclaration);
        const line = call.getStartLineNumber();
        return `${method?.getName() ?? '<outside-method>'} (${call.getSourceFile().getBaseName()}:${line})`;
      })
      .sort();

    // Must-fire check: a new `this.buildPersistence(...)` call site changes
    // this list and fails with the offending method name + line. Route the
    // new attach through `validateStoredStateThenAttach` instead — or, if a
    // third sanctioned caller is genuinely being introduced, update the
    // boundary-contract JSDoc on `buildPersistence` in the same change.
    expect(callerMethods.map((entry) => entry.split(' ')[0])).toEqual([...SANCTIONED_CALLERS]);
  });
});

describe('ProviderPool capability composition', () => {
  test('keeps the public facade small and delegates to named collaborators', () => {
    const facade = join(import.meta.dir, 'provider-pool.ts');
    expect(existsSync(facade)).toBe(true);
    expect(readFileSync(facade, 'utf8').split('\n').length).toBeLessThanOrEqual(600);

    const collaborators = [
      'provider-pool-state.ts',
      'provider-pool-lineage.ts',
      'provider-pool-recovery.ts',
      'provider-pool-persistence.ts',
      'provider-pool-connection.ts',
      'provider-pool-eviction.ts',
    ];
    for (const collaborator of collaborators) {
      const file = join(import.meta.dir, collaborator);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8').split('\n').length).toBeLessThanOrEqual(450);
    }
  });
});
