import { describe, expect, test } from 'bun:test';
import { formatInstanceAppName, resolveInstanceLabel } from './instance-identity.ts';

describe('resolveInstanceLabel', () => {
  test('returns null for the default install userData names', () => {
    expect(resolveInstanceLabel('/Users/me/Library/Application Support/SynapseNote')).toBeNull();
    expect(resolveInstanceLabel('/Users/me/Library/Application Support/SynapseNote')).toBeNull();
    expect(resolveInstanceLabel('/tmp/Electron')).toBeNull();
  });

  test('uses the userData basename for launcher-style instance dirs', () => {
    expect(resolveInstanceLabel('/Users/me/.ok/instances/work')).toBe('work');
    expect(resolveInstanceLabel('/Users/me/.ok/instances/review-2')).toBe('review-2');
  });

  test('unwraps the dev OK_INSTANCE sibling-dir form to the bare name', () => {
    expect(resolveInstanceLabel('/Users/me/Library/Application Support/SynapseNote (a)')).toBe('a');
    expect(resolveInstanceLabel('/data/SynapseNote (feature-x)')).toBe('feature-x');
  });

  test('returns null when the basename trims to empty', () => {
    expect(resolveInstanceLabel('/Users/me/.ok/instances/   ')).toBeNull();
  });
});

describe('formatInstanceAppName', () => {
  test('suffixes the app name with the label', () => {
    expect(formatInstanceAppName('SynapseNote', 'work')).toBe('SynapseNote (work)');
  });
});
