/** Stable public facade for the workspace command palette. */

import { CommandPaletteStateProvider } from './command-palette/CommandPaletteStateProvider';
import { CommandPaletteSurface } from './command-palette/CommandPaletteSurface';
import type { CommandPaletteProps } from './command-palette/command-palette-types';

export { NavigationItem } from './command-palette/CommandPaletteNavigationItem';
export type { CommandPaletteProps } from './command-palette/command-palette-types';
export { computeVisibleSearchResults, runWithToast } from './command-palette/command-palette-utils';

/** Provides state and renders the independently-owned command palette surface. */
export function CommandPalette(props: CommandPaletteProps) {
  return (
    <CommandPaletteStateProvider {...props}>
      <CommandPaletteSurface />
    </CommandPaletteStateProvider>
  );
}
