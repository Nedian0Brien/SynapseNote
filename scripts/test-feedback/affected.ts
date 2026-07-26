import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { repositoryRoot } from './command.ts';
import { discoverWorkspacePackages, type WorkspacePackage } from './workspace.ts';

export const SUPPORTED_PACKAGE_KEYS = ['app', 'server', 'core', 'cli', 'desktop'] as const;
export type SupportedPackageKey = (typeof SUPPORTED_PACKAGE_KEYS)[number];

export interface AffectedPlan {
  changedFiles: string[];
  docsOnly: boolean;
  domains: string[];
  packages: SupportedPackageKey[];
  reasons: string[];
  repository: boolean;
}

const ROOT_GATE_PATTERNS = [
  /^\.github\//,
  /^\.changeset\//,
  /^package\.json$/,
  /^bun\.lock(?:b)?$/,
  /^turbo\.json$/,
  /^(?:biome|oxlint|tsconfig)[^/]*\.(?:jsonc?|ts)$/,
  /^scripts\//,
];

const DOC_PATTERNS = [/^docs\//, /^(?:README|CONTRIBUTING|AGENTS)(?:\.[^/]+)?$/];

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

function packageForFile(
  file: string,
  workspacePackages: WorkspacePackage[],
): WorkspacePackage | undefined {
  return workspacePackages.find((workspacePackage) => {
    return file === workspacePackage.directory || file.startsWith(`${workspacePackage.directory}/`);
  });
}

function reverseDependencyClosure(
  packageKeys: string[],
  workspacePackages: WorkspacePackage[],
): Set<string> {
  const byName = new Map(
    workspacePackages.map((workspacePackage) => [workspacePackage.name, workspacePackage.key]),
  );
  const dependents = new Map<string, string[]>();

  for (const workspacePackage of workspacePackages) {
    for (const dependency of workspacePackage.dependencies) {
      const dependencyKey = byName.get(dependency);
      if (!dependencyKey) continue;
      const current = dependents.get(dependencyKey) ?? [];
      current.push(workspacePackage.key);
      dependents.set(dependencyKey, current);
    }
  }

  const affected = new Set(packageKeys);
  const queue = [...packageKeys];
  while (queue.length > 0) {
    const packageKey = queue.shift();
    if (!packageKey) continue;
    for (const dependent of dependents.get(packageKey) ?? []) {
      if (affected.has(dependent)) continue;
      affected.add(dependent);
      queue.push(dependent);
    }
  }
  return affected;
}

export function domainsForFiles(changedFiles: string[]): string[] {
  const domains = new Set<string>();

  for (const file of changedFiles) {
    if (/^packages\/app\/src\/(?:components\/)?database/i.test(file)) domains.add('database');
    if (/^packages\/app\/src\/editor\//i.test(file)) domains.add('editor');
    if (
      /^packages\/app\/src\/(?:components\/(?:FileTree|EditorNavigation|CommandPalette|Sidebar)|hooks\/use-navigation)/i.test(
        file,
      )
    ) {
      domains.add('navigation');
    }
    if (/^packages\/(?:app\/src\/.*search|core\/src\/search\/)/i.test(file)) domains.add('search');
    if (
      /^packages\/app\/src\/components\/(?:Sync|ServerDrift)/i.test(file) ||
      /^packages\/server\/src\/sync-/i.test(file)
    ) {
      domains.add('sync');
    }
    if (
      /^packages\/server\/src\/(?:server-factory|boot|server-lock|loopback|idle-shutdown|process)/i.test(
        file,
      )
    ) {
      domains.add('server-startup');
    }
    if (
      /^packages\/(?:core\/src\/schemas|server\/src\/(?:api|mcp|.*contract|.*schema))/i.test(file)
    ) {
      domains.add('contract');
    }
  }

  return [...domains].sort();
}

export function computeAffectedPlan(changedFiles: string[], root = repositoryRoot): AffectedPlan {
  const normalizedFiles = [...new Set(changedFiles.map(normalizePath).filter(Boolean))].sort();
  const workspacePackages = discoverWorkspacePackages(root);
  const reasons: string[] = [];

  if (normalizedFiles.length === 0) {
    return {
      changedFiles: [],
      docsOnly: false,
      domains: [],
      packages: [],
      reasons: ['No changed files were found.'],
      repository: false,
    };
  }

  const repository = normalizedFiles.some((file) => matchesAny(file, ROOT_GATE_PATTERNS));
  if (repository)
    reasons.push('A root/shared/CI configuration file changed; use the repository gate.');

  const owners = normalizedFiles
    .map((file) => packageForFile(file, workspacePackages))
    .filter(
      (workspacePackage): workspacePackage is WorkspacePackage => workspacePackage !== undefined,
    );
  const ownerKeys = [...new Set(owners.map((workspacePackage) => workspacePackage.key))];
  const docsOnly = normalizedFiles.every((file) => matchesAny(file, DOC_PATTERNS));
  const unsupportedOwner = docsOnly
    ? undefined
    : ownerKeys.find(
        (packageKey) => !SUPPORTED_PACKAGE_KEYS.includes(packageKey as SupportedPackageKey),
      );
  if (unsupportedOwner) {
    reasons.push(`The changed workspace package '${unsupportedOwner}' has no narrow package gate.`);
  }

  if (docsOnly) reasons.push('Only documentation files changed.');

  const hasUnknownFile = normalizedFiles.some(
    (file) => !packageForFile(file, workspacePackages) && !matchesAny(file, DOC_PATTERNS),
  );
  if (hasUnknownFile)
    reasons.push('A changed file is outside a known package or documentation tree.');

  const mustUseRepositoryGate = repository || Boolean(unsupportedOwner) || hasUnknownFile;
  if (mustUseRepositoryGate) {
    return {
      changedFiles: normalizedFiles,
      docsOnly: false,
      domains: [],
      packages: [],
      reasons,
      repository: true,
    };
  }

  if (docsOnly) {
    return {
      changedFiles: normalizedFiles,
      docsOnly: true,
      domains: [],
      packages: [],
      reasons,
      repository: false,
    };
  }

  const affectedKeys = reverseDependencyClosure(ownerKeys, workspacePackages);
  const packages = [...affectedKeys]
    .filter((packageKey): packageKey is SupportedPackageKey => {
      return SUPPORTED_PACKAGE_KEYS.includes(packageKey as SupportedPackageKey);
    })
    .sort() as SupportedPackageKey[];

  if (packages.length === 0) {
    reasons.push('No supported runtime package was identified; use the repository gate.');
    return {
      changedFiles: normalizedFiles,
      docsOnly: false,
      domains: [],
      packages: [],
      reasons,
      repository: true,
    };
  }

  reasons.push(`Run the affected package closure: ${packages.join(', ')}.`);
  return {
    changedFiles: normalizedFiles,
    docsOnly: false,
    domains: domainsForFiles(normalizedFiles),
    packages,
    reasons,
    repository: false,
  };
}

function gitFileList(args: string[], cwd = repositoryRoot): string[] {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed: ${result.error?.message ?? result.stderr ?? 'unknown error'}`,
    );
  }
  return String(result.stdout)
    .split('\n')
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean);
}

function verifiedGitRef(ref: string, cwd = repositoryRoot): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--verify', ref], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? ref : undefined;
}

export function readChangedFiles(
  options: { pr: boolean; baseRef?: string } = { pr: false },
  root = repositoryRoot,
): string[] {
  const files = new Set<string>();

  if (options.pr) {
    const configuredBase =
      options.baseRef ??
      (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined) ??
      'origin/main';
    const base = verifiedGitRef(configuredBase, root);
    if (base) {
      for (const file of gitFileList(['diff', '--name-only', `${base}...HEAD`], root))
        files.add(file);
    } else {
      console.warn(
        `[check:changed] base ref '${configuredBase}' is unavailable; using the working-tree diff.`,
      );
    }
  }

  for (const file of gitFileList(['diff', '--name-only', 'HEAD'], root)) files.add(file);
  for (const file of gitFileList(['diff', '--cached', '--name-only'], root)) files.add(file);
  for (const file of gitFileList(['ls-files', '--others', '--exclude-standard'], root))
    files.add(file);

  return [...files].sort();
}

export function assertRepositoryPath(path: string): void {
  if (!existsSync(join(repositoryRoot, path))) {
    throw new Error(`Expected repository path does not exist: ${path}`);
  }
}
