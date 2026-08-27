import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { signalProcessTree } from './process-tree';

test.skipIf(process.platform !== 'win32')(
  'Windows cancellation terminates agent descendants',
  async () => {
    const parent = spawn(
      'node',
      [
        '-e',
        `
    const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    console.log(child.pid);
    setInterval(() => {}, 1000);
  `,
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const childPid = await new Promise<number>((resolve) =>
      parent.stdout.once('data', (data) => resolve(Number(data.toString().trim()))),
    );
    try {
      expect(childPid).toBeGreaterThan(0);
      signalProcessTree(parent, 'SIGTERM');
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        try {
          process.kill(childPid, 0);
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(() => process.kill(childPid, 0)).toThrow();
    } finally {
      parent.kill();
      try {
        process.kill(childPid);
      } catch {}
    }
  },
);
