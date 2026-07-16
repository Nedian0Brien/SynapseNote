import { describe, expect, test } from 'bun:test';
import { wrapperPathInBundle } from './bundle-paths.ts';

describe('wrapperPathInBundle', () => {
  test('maps packaged executable path to bundled ok.sh wrapper', () => {
    expect(wrapperPathInBundle('/Applications/SynapseNote.app/Contents/MacOS/SynapseNote')).toBe(
      '/Applications/SynapseNote.app/Contents/Resources/cli/bin/ok.sh',
    );
  });
});
