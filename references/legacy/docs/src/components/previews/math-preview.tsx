'use client';

import 'katex/dist/katex.min.css';
import katex from 'katex';

/**
 * Preview of the app `Math` — KaTeX rendered from a LaTeX source string.
 * Uses the same underlying library as the app render (`katex`), just
 * without the editor's block-selection chrome. Renders in block mode by
 * default so the demo reads at a comfortable size.
 */
export function MathPreview({ formula, display = true }: { formula: string; display?: boolean }) {
  const html = renderFormula(formula, display);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: katex output is trusted
  return <div className="text-fd-foreground" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Render inline — React Compiler handles memoization; per CLAUDE.md the
 * project bans manual `useMemo` / `useCallback`. */
function renderFormula(formula: string, display: boolean): string {
  try {
    return katex.renderToString(formula, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
    });
  } catch (err) {
    return `<span style="color:tomato">${(err as Error)?.message ?? 'Failed to render'}</span>`;
  }
}
