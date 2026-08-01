import { describe, expect, test } from 'bun:test';
import {
  type CommandPaletteRegistryEntry,
  filterCommandPaletteRegistry,
} from './command-palette-command-registry';

const registry: readonly CommandPaletteRegistryEntry[] = [
  { id: 'new-file', label: 'New file', aliases: ['create file'], available: true },
  { id: 'settings', label: 'Settings', aliases: ['preferences', 'config'], available: true },
  { id: 'graph', label: 'Open graph', aliases: ['network'], available: false },
];

describe('filterCommandPaletteRegistry', () => {
  test('indexes translated labels and aliases while excluding unavailable actions', () => {
    expect(filterCommandPaletteRegistry(registry, 'preferences').map((entry) => entry.id)).toEqual([
      'settings',
    ]);
    expect(filterCommandPaletteRegistry(registry, 'create').map((entry) => entry.id)).toEqual([
      'new-file',
    ]);
    expect(filterCommandPaletteRegistry(registry, 'network')).toEqual([]);
  });

  test('returns all available commands for an empty query in registry order', () => {
    expect(filterCommandPaletteRegistry(registry, '').map((entry) => entry.id)).toEqual([
      'new-file',
      'settings',
    ]);
  });
});
