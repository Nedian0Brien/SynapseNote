import { useLingui } from '@lingui/react/macro';
import type { LucideIcon } from 'lucide-react';
import { AppWindow, Bookmark, Link2, TextQuote } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { PasteFormat } from './paste-format-options.ts';

/**
 * The "Paste as" menu that follows a pasted URL.
 *
 * Deliberately smaller than the slash menu: four rows at most, no
 * categories, no preview panel. It appears unbidden right after a paste,
 * so it has to read as a quiet offer rather than a dialog demanding an
 * answer — one glance to see the alternatives, one keystroke to leave.
 *
 * Focus stays in the editor throughout (every pointer interaction calls
 * `preventDefault` on mousedown), which is what lets the arrow keys and
 * Escape keep working while the menu is open.
 */

interface PasteFormatMenuProps {
  options: readonly PasteFormat[];
  selectedIndex: number;
  onSelect: (format: PasteFormat) => void;
  onHoverIndex?: (index: number) => void;
}

const FORMAT_ICONS: Record<PasteFormat, LucideIcon> = {
  mention: TextQuote,
  url: Link2,
  bookmark: Bookmark,
  embed: AppWindow,
};

export function PasteFormatMenu({
  options,
  selectedIndex,
  onSelect,
  onHoverIndex,
}: PasteFormatMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const { t } = useLingui();

  const labels: Record<PasteFormat, string> = {
    mention: t`Mention`,
    url: t`URL`,
    bookmark: t`Bookmark`,
    embed: t`Embed`,
  };

  const activeDescendant =
    selectedIndex >= 0 && selectedIndex < options.length
      ? `${listboxId}-option-${selectedIndex}`
      : undefined;

  // Any click inside the popup must not pull focus out of the
  // contenteditable — the plugin's key handling lives on the editor view.
  const preventFocusSteal = (e: React.MouseEvent) => e.preventDefault();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('[role="option"]').item(selectedIndex)?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedIndex]);

  const selectedFormat =
    selectedIndex >= 0 && selectedIndex < options.length ? options[selectedIndex] : null;

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label={t`Paste as`}
      aria-activedescendant={activeDescendant}
      tabIndex={-1}
      onMouseDown={preventFocusSteal}
      data-paste-format-menu="true"
      className="w-44 overflow-y-auto subtle-scrollbar rounded-lg border bg-popover p-1 shadow-md"
      style={{ maxHeight: 'var(--suggestion-menu-max-height, 40vh)' }}
    >
      {/* Focus never leaves ProseMirror, so `aria-activedescendant` on this
          listbox is inert for screen readers — the live region is what
          actually announces arrow-key movement. Mirrors SlashCommandMenu. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedFormat ? labels[selectedFormat] : ''}
      </span>
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{t`Paste as`}</div>
      {options.map((format, index) => {
        const isSelected = index === selectedIndex;
        const Icon = FORMAT_ICONS[format];
        return (
          <button
            key={format}
            id={`${listboxId}-option-${index}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-selected={isSelected}
            data-paste-format={format}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left ${
              isSelected ? 'bg-accent text-accent-foreground' : ''
            }`}
            onMouseEnter={() => onHoverIndex?.(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(format);
            }}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{labels[format]}</span>
          </button>
        );
      })}
    </div>
  );
}
