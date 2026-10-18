// replaces morrow's src/app/actions.ts, which reaches the whole app, the editor only needs shortcut labels
import { isMac } from './desktop';

// same output as formatShortcut in morrow's src/app/actions.ts
export function formatShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((key) => {
      if (key === 'Mod') return isMac ? '⌘' : 'Ctrl';
      if (key === 'Alt') return isMac ? '⌥' : 'Alt';
      if (key === 'Shift') return isMac ? '⇧' : 'Shift';
      return key;
    })
    .join(isMac ? '' : '+');
}
