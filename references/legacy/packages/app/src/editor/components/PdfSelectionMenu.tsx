import { PdfAnnotationSubtype } from '@embedpdf/models';
import type { AnnotationSelectionMenuProps } from '@embedpdf/plugin-annotation/react';
import type { SelectionSelectionMenuProps } from '@embedpdf/plugin-selection/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Check, Highlighter, Sparkles, StickyNote, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export const PDF_HIGHLIGHT_COLORS = [
  '#facc15',
  '#4ade80',
  '#60a5fa',
  '#f472b6',
  '#c084fc',
] as const;

interface PdfSelectionMenuProps extends SelectionSelectionMenuProps {
  canAskAi: boolean;
  highlightColor: string;
  onHighlightColorChange(color: string): void;
  onHighlight(color: string): void;
  onMemo(contents: string): void;
  onAskAi(): void;
}

export function PdfSelectionMenu(props: PdfSelectionMenuProps) {
  const { t } = useLingui();
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState('');
  const menuPosition = props.placement.suggestTop
    ? { bottom: 'calc(100% + 8px)' }
    : { top: 'calc(100% + 8px)' };

  return (
    <div
      {...props.menuWrapperProps}
      style={{ ...props.menuWrapperProps.style, zIndex: 50 }}
      data-no-interaction="true"
      contentEditable={false}
    >
      <div
        className="absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-background p-1 shadow-md"
        style={{ ...menuPosition, pointerEvents: 'auto', cursor: 'default' }}
        data-testid="pdf-selection-menu"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {memoOpen ? (
          <div className="flex w-64 items-end gap-1 p-1">
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setMemoOpen(false);
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && memo.trim()) {
                  props.onMemo(memo);
                }
              }}
              rows={3}
              aria-label={t`PDF memo`}
              placeholder={t`Add a memo`}
              className="min-h-16 flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t`Save memo`}
                disabled={!memo.trim()}
                onClick={() => props.onMemo(memo)}
              >
                <Check className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t`Cancel memo`}
                onClick={() => setMemoOpen(false)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <PdfHighlightColorPicker
              value={props.highlightColor}
              onChange={props.onHighlightColorChange}
            />
            <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
              onClick={() => props.onHighlight(props.highlightColor)}
            >
              <Highlighter
                className="size-3.5"
                style={{ color: props.highlightColor }}
                aria-hidden="true"
              />
              <Trans>Highlight</Trans>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
              onClick={() => setMemoOpen(true)}
            >
              <StickyNote className="size-3.5" aria-hidden="true" />
              <Trans>Memo</Trans>
            </Button>
            <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
              disabled={!props.canAskAi}
              onClick={props.onAskAi}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              <Trans>Ask AI</Trans>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface PdfAnnotationMenuProps extends AnnotationSelectionMenuProps {
  onUpdateMemo(contents: string): void;
  onUpdateColor(color: string): void;
  onDelete(): void;
  onClose(): void;
}

export function PdfAnnotationMenu(props: PdfAnnotationMenuProps) {
  const { t } = useLingui();
  const annotation = props.context.annotation.object;
  const isMemo = annotation.type === PdfAnnotationSubtype.TEXT;
  const isHighlight = annotation.type === PdfAnnotationSubtype.HIGHLIGHT;
  const annotationContents =
    'contents' in annotation && typeof annotation.contents === 'string' ? annotation.contents : '';
  const annotationColor =
    'strokeColor' in annotation && typeof annotation.strokeColor === 'string'
      ? annotation.strokeColor
      : PDF_HIGHLIGHT_COLORS[0];
  const [memo, setMemo] = useState(isMemo || isHighlight ? annotationContents : '');
  const [savedMemo, setSavedMemo] = useState(annotationContents);

  useEffect(() => {
    setMemo(isMemo || isHighlight ? annotationContents : '');
    setSavedMemo(annotationContents);
  }, [annotationContents, isHighlight, isMemo]);

  if (!props.selected) return null;

  const commitMemo = () => {
    const next = memo.trim();
    if (next !== savedMemo) {
      setSavedMemo(next);
      props.onUpdateMemo(next);
    }
  };

  const menuPosition = props.placement.suggestTop
    ? { bottom: 'calc(100% + 8px)' }
    : { top: 'calc(100% + 8px)' };

  return (
    <div
      {...props.menuWrapperProps}
      style={{ ...props.menuWrapperProps.style, zIndex: 50 }}
      data-no-interaction="true"
      contentEditable={false}
    >
      <div
        className="absolute left-1/2 flex w-80 -translate-x-1/2 flex-col rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl"
        style={{ ...menuPosition, pointerEvents: 'auto', cursor: 'default' }}
        data-testid="pdf-annotation-menu"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {isHighlight ? (
              <Highlighter
                className="size-4 shrink-0"
                style={{ color: annotationColor }}
                aria-hidden="true"
              />
            ) : (
              <StickyNote className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
            )}
            <p className="truncate text-sm font-semibold">
              {isHighlight ? <Trans>Highlight note</Trans> : <Trans>Memo</Trans>}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mr-1 text-muted-foreground"
            aria-label={t`Close`}
            onClick={() => {
              commitMemo();
              props.onClose();
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        {isHighlight && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              <Trans>Color</Trans>
            </span>
            <PdfHighlightColorPicker value={annotationColor} onChange={props.onUpdateColor} />
          </div>
        )}
        {(isMemo || isHighlight) && (
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') commitMemo();
            }}
            rows={3}
            aria-label={isHighlight ? t`Edit PDF highlight memo` : t`Edit PDF memo`}
            placeholder={isHighlight ? t`Add a memo` : undefined}
            className="mt-3 min-h-20 w-full resize-none rounded-lg border bg-muted/25 px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        )}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            <kbd className="rounded border bg-muted/50 px-1.5 py-0.5 font-sans">⌘↵</kbd>{' '}
            <Trans>Save</Trans>
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              aria-label={isMemo ? t`Delete memo` : t`Delete highlight`}
              onClick={props.onDelete}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-xs"
              aria-label={t`Save memo`}
              disabled={memo.trim() === savedMemo}
              onClick={commitMemo}
            >
              <Trans>Save</Trans>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfHighlightColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const { t } = useLingui();
  const groupName = useId();
  const labels = [t`Yellow`, t`Green`, t`Blue`, t`Pink`, t`Purple`];

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={t`Highlight color`}>
      {PDF_HIGHLIGHT_COLORS.map((color, index) => {
        const selected = color.toLowerCase() === value.toLowerCase();
        return (
          <label
            key={color}
            className={`relative size-6 cursor-pointer rounded-full border border-black/15 shadow-sm transition-transform hover:scale-110 has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 ${
              selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-popover' : ''
            }`}
            style={{ backgroundColor: color }}
          >
            <input
              type="radio"
              name={groupName}
              value={color}
              checked={selected}
              aria-label={labels[index]}
              className="sr-only"
              onChange={() => onChange(color)}
            />
            {selected && (
              <Check
                className="absolute inset-0 m-auto size-3.5 text-black/70"
                aria-hidden="true"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
