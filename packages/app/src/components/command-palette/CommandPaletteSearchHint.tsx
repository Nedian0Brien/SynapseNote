import { Trans } from '@lingui/react/macro';
import type { classifyOmnibarSearchHint } from '../command-palette-search';

/** Renders the non-listbox search-index hint for normal lexical mode only. */
export function CommandPaletteSearchHint({
  inExclusiveMode,
  mode,
  paletteModeKind,
}: {
  inExclusiveMode: boolean;
  mode: ReturnType<typeof classifyOmnibarSearchHint>;
  paletteModeKind: 'normal' | 'tag-list' | 'tag-docs';
}) {
  if (inExclusiveMode || paletteModeKind !== 'normal' || mode === 'idle' || mode === 'content') {
    return null;
  }
  return (
    <div
      aria-live="polite"
      data-testid={`command-palette-search-hint-${mode}`}
      className="border-t px-3 py-2 text-muted-foreground text-xs"
    >
      {mode === 'name-only' ? (
        <Trans>
          Search matches file names, paths, and folders. Open a file to search its body (⌘F).
        </Trans>
      ) : mode === 'truncated' ? (
        <Trans>
          Results capped — this workspace has more files than search can index. A missing file may
          be a cap artifact, not a typo.
        </Trans>
      ) : (
        <Trans>No matches. Some files are excluded from search (hidden or ignored files).</Trans>
      )}
    </div>
  );
}
