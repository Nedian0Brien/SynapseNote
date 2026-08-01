import { matchesCommandQuery } from '../command-palette-search';

/** One searchable command and the capability gate that owns its availability. */
export interface CommandPaletteRegistryEntry {
  aliases: readonly string[];
  available: boolean;
  id: string;
  label: string;
}

/** Filters the declarative command registry without coupling it to rendering or actions. */
export function filterCommandPaletteRegistry(
  entries: readonly CommandPaletteRegistryEntry[],
  query: string,
): readonly CommandPaletteRegistryEntry[] {
  return entries.filter(
    (entry) => entry.available && matchesCommandQuery(entry.label, query, [...entry.aliases]),
  );
}
