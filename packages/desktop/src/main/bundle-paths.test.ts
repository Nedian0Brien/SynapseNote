import { describe, expect, test } from 'bun:test';
import { localOpCliArgsInBundle, wrapperPathInBundle } from './bundle-paths.ts';

describe('wrapperPathInBundle', () => {
  test('spawns the Windows CLI directly without putting user arguments through cmd.exe', () => {
    expect(
      localOpCliArgsInBundle('C:\\Apps With Spaces\\SynapseNote\\SynapseNote.exe', 'win32'),
    ).toEqual([
      'C:\\Apps With Spaces\\SynapseNote\\SynapseNote.exe',
      'C:\\Apps With Spaces\\SynapseNote\\resources\\cli\\dist\\cli.mjs',
    ]);
  });
  test('maps packaged executable path to bundled ok.sh wrapper', () => {
    expect(
      wrapperPathInBundle('/Applications/SynapseNote.app/Contents/MacOS/SynapseNote', 'darwin'),
    ).toBe('/Applications/SynapseNote.app/Contents/Resources/cli/bin/ok.sh');
  });

  test('maps a Windows executable with spaces to the bundled command wrapper', () => {
    expect(wrapperPathInBundle('C:\\Users\\Test User\\SynapseNote\\SynapseNote.exe', 'win32')).toBe(
      'C:\\Users\\Test User\\SynapseNote\\resources\\cli\\bin\\ok.cmd',
    );
  });
});
