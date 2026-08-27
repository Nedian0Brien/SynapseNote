import { posix, win32 } from 'node:path';

export function localOpCliArgsInBundle(
  executablePath: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    return [
      executablePath,
      win32.join(win32.dirname(executablePath), 'resources', 'cli', 'dist', 'cli.mjs'),
    ];
  }
  return [wrapperPathInBundle(executablePath, platform)];
}

export function wrapperPathInBundle(
  executablePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return win32.join(win32.dirname(executablePath), 'resources', 'cli', 'bin', 'ok.cmd');
  }
  const bundleRoot = executablePath.replace(/\/Contents\/MacOS\/.*$/, '');
  return posix.join(bundleRoot, 'Contents', 'Resources', 'cli', 'bin', 'ok.sh');
}
