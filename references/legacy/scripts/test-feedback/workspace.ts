import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repositoryRoot } from './command.ts';

export interface WorkspacePackage {
  directory: string;
  key: string;
  name: string;
  scripts: Record<string, string>;
  dependencies: string[];
}

type PackageJson = {
  name?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  optionalDependencies?: unknown;
  peerDependencies?: unknown;
};

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
}

function dependencyNames(packageJson: PackageJson): string[] {
  const names = new Set<string>();
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const) {
    const value = packageJson[field];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const name of Object.keys(value)) names.add(name);
  }
  return [...names].sort();
}

/** Discover package manifests without depending on a package-manager-specific graph API. */
export function discoverWorkspacePackages(root = repositoryRoot): WorkspacePackage[] {
  const packageDirectories: string[] = [];
  const packagesRoot = join(root, 'packages');

  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) packageDirectories.push(join(packagesRoot, entry.name));
  }

  const docsDirectory = join(root, 'docs');
  packageDirectories.push(docsDirectory);

  return packageDirectories
    .filter((directory) => {
      try {
        readFileSync(join(directory, 'package.json'));
        return true;
      } catch {
        return false;
      }
    })
    .map((directory) => {
      const packageJson = readPackageJson(join(directory, 'package.json'));
      if (typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
        throw new Error(`Workspace package at ${directory} is missing a string name`);
      }

      const scripts =
        packageJson.scripts &&
        typeof packageJson.scripts === 'object' &&
        !Array.isArray(packageJson.scripts)
          ? Object.fromEntries(
              Object.entries(packageJson.scripts).filter((entry): entry is [string, string] => {
                return typeof entry[1] === 'string';
              }),
            )
          : {};

      return {
        directory: relative(root, directory).replaceAll('\\', '/'),
        key: relative(root, directory)
          .replaceAll('\\', '/')
          .replace(/^packages\//, ''),
        name: packageJson.name,
        scripts,
        dependencies: dependencyNames(packageJson),
      };
    })
    .sort((left, right) => left.directory.localeCompare(right.directory));
}

export function packageByKey(root = repositoryRoot): Map<string, WorkspacePackage> {
  return new Map(
    discoverWorkspacePackages(root).map((workspacePackage) => [
      workspacePackage.key,
      workspacePackage,
    ]),
  );
}
