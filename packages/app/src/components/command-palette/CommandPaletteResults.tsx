import { CommandList } from '@/components/ui/command';
import { CommandPaletteCommandResults } from './CommandPaletteCommandResults';
import { CommandPaletteModeResults } from './CommandPaletteModeResults';
import { CommandPaletteNavigationResults } from './CommandPaletteNavigationResults';
import { CommandPaletteProjectResults } from './CommandPaletteProjectResults';
import { useCommandPaletteState } from './CommandPaletteStateProvider';

/** Composes independently-owned result families inside cmdk's listbox boundary. */
export function CommandPaletteResults() {
  const { listRef } = useCommandPaletteState();
  return (
    <CommandList ref={listRef} className="subtle-scrollbar">
      <CommandPaletteModeResults />
      <CommandPaletteNavigationResults phase="early" />
      <CommandPaletteCommandResults />
      <CommandPaletteProjectResults />
      <CommandPaletteNavigationResults phase="late" />
    </CommandList>
  );
}
