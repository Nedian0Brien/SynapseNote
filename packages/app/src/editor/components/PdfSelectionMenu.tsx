import { PdfAnnotationSubtype } from '@embedpdf/models';
import type { AnnotationSelectionMenuProps } from '@embedpdf/plugin-annotation/react';
import type { SelectionSelectionMenuProps } from '@embedpdf/plugin-selection/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Check, Highlighter, Sparkles, StickyNote, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface PdfSelectionMenuProps extends SelectionSelectionMenuProps {
  canAskAi: boolean;
  onHighlight(): void;
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 px-2 text-sm font-medium text-accent-foreground/80"
              onClick={props.onHighlight}
            >
              <Highlighter className="size-3.5" aria-hidden="true" />
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
  onDelete(): void;
}

export function PdfAnnotationMenu(props: PdfAnnotationMenuProps) {
  const { t } = useLingui();
  const annotation = props.context.annotation.object;
  const isMemo = annotation.type === PdfAnnotationSubtype.TEXT;
  const [memo, setMemo] = useState(isMemo ? annotation.contents : '');

  useEffect(() => {
    setMemo(isMemo ? annotation.contents : '');
  }, [annotation.contents, isMemo]);

  if (!props.selected) return null;

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
        className="absolute left-1/2 flex -translate-x-1/2 items-end gap-1 rounded-lg border bg-background p-1 shadow-md"
        style={{ ...menuPosition, pointerEvents: 'auto', cursor: 'default' }}
        data-testid="pdf-annotation-menu"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {isMemo && (
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            onBlur={() => {
              const next = memo.trim();
              if (next && next !== annotation.contents) props.onUpdateMemo(next);
            }}
            rows={3}
            aria-label={t`Edit PDF memo`}
            className="min-h-16 w-56 resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={isMemo ? t`Delete memo` : t`Delete highlight`}
          onClick={props.onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
