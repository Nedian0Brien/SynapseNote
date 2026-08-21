/**
 * Path-menu actions shared by every surface that offers "Reveal in <file
 * manager>" and "Copy path" on a workspace item — the sidebar tree's row menu
 * and the folder overview's card menu.
 *
 * A leaf module (no component imports) so both menus can share one
 * implementation without either importing the other's component file.
 */

import { t } from '@lingui/core/macro';
import { toast } from 'sonner';

/**
 * Platform-specific label for the file-manager reveal action. Mirrors VS Code's copy.
 * Linux verb asymmetry (Open vs Reveal) is intentional — no stable Linux file-manager
 * brand to "Reveal in"; a normalizing fix to "Reveal in Files" would be incorrect on
 * most distros.
 */
export function revealInFileManagerLabel(platform: 'darwin' | 'win32' | 'linux'): string {
  if (platform === 'darwin') return t`Reveal in Finder`;
  if (platform === 'win32') return t`Reveal in File Explorer`;
  return t`Open containing folder`;
}

/**
 * Copy a path and report the outcome. The copied text rides in the toast
 * description so the user can confirm what landed on the clipboard without
 * pasting it somewhere first.
 */
export async function copyPathToClipboard(text: string, kind: 'full' | 'relative'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(kind === 'full' ? t`Copied full path` : t`Copied relative path`, {
      description: text,
    });
  } catch (err) {
    console.warn('[path-menu-actions] clipboard write failed:', err);
    toast.error(kind === 'full' ? t`Could not copy full path` : t`Could not copy relative path`);
  }
}
