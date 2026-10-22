import { join } from 'node:path';

export function wrapperPathInBundle(executablePath: string): string {
  const bundleRoot = executablePath.replace(/\/Contents\/MacOS\/.*$/, '');
  return join(bundleRoot, 'Contents', 'Resources', 'cli', 'bin', 'ok.sh');
}
