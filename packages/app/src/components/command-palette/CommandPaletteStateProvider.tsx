import { createContext, type ReactNode, use } from 'react';
import type { CommandPaletteProps } from './command-palette-types';
import { useCommandPaletteController } from './use-command-palette-controller';

type CommandPaletteController = ReturnType<typeof useCommandPaletteController>;

const CommandPaletteStateContext = createContext<CommandPaletteController | null>(null);

/** Provides the one palette state owner to independently-rendered result families. */
export function CommandPaletteStateProvider({
  children,
  ...props
}: CommandPaletteProps & { children: ReactNode }) {
  const controller = useCommandPaletteController(props);
  return (
    <CommandPaletteStateContext.Provider value={controller}>
      {children}
    </CommandPaletteStateContext.Provider>
  );
}

/** Reads the palette's typed state/action boundary from a render-only child. */
export function useCommandPaletteState(): CommandPaletteController {
  const state = use(CommandPaletteStateContext);
  if (!state) throw new Error('CommandPaletteStateProvider is required');
  return state;
}
