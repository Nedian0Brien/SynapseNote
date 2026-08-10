import { useLingui } from '@lingui/react/macro';
import { ChevronRight, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EditorBreadcrumb, type EditorBreadcrumbSegment } from './EditorBreadcrumb';

interface DocumentViewerHeaderProps {
  documentPath: string;
  title: string;
  fileType: 'MD' | 'PDF';
  showBreadcrumb?: boolean;
  breadcrumbSegments?: readonly (string | EditorBreadcrumbSegment)[];
  /**
   * Renderer-specific contextual tools, inlined into this row rather than
   * stacked under it. Markdown's formatting controls live here; giving them
   * their own 40px band made the viewer read as three header bars (tab strip,
   * identity, tools) before any content. The slot takes the flexible middle
   * column and is expected to scroll internally when the row is tight.
   */
  toolbar?: ReactNode;
  leadingAccessory?: ReactNode;
  actions?: ReactNode;
  panelToggle?: {
    open: boolean;
    onToggle: () => void;
    controlsId: string;
  };
  className?: string;
}

/**
 * Shared identity row for document-shaped viewers.
 *
 * Markdown and PDF intentionally keep separate renderers and contextual tools,
 * but this row gives both surfaces one stable information hierarchy: location,
 * human-readable title, file kind, centered view controls, and the right-rail
 * toggle at the pane edge.
 */
export function DocumentViewerHeader({
  documentPath,
  title,
  fileType,
  showBreadcrumb = true,
  breadcrumbSegments,
  toolbar,
  leadingAccessory,
  actions,
  panelToggle,
  className,
}: DocumentViewerHeaderProps) {
  const { t } = useLingui();
  const hasBreadcrumb =
    showBreadcrumb &&
    (breadcrumbSegments ? breadcrumbSegments.length > 0 : documentPath.includes('/'));

  return (
    <div
      data-testid="document-viewer-header"
      data-file-type={fileType.toLowerCase()}
      className={cn(
        'grid h-11 shrink-0 items-center border-b bg-background px-3',
        // With tools inlined the identity hugs its content and the tool band
        // takes the slack, so a long title can't starve the toolbar (and a wide
        // toolbar can't push the actions off the row — it scrolls instead).
        toolbar
          ? 'grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] gap-2'
          : 'grid-cols-[minmax(0,1fr)_auto]',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {showBreadcrumb ? (
          <EditorBreadcrumb docName={documentPath} segments={breadcrumbSegments} />
        ) : null}
        {hasBreadcrumb ? (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        ) : null}
        <span
          className="min-w-0 truncate text-[13px] text-foreground font-medium tracking-[-0.01em]"
          title={title}
        >
          {title}
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium leading-none">
          {fileType}
        </span>
        {leadingAccessory}
      </div>

      {toolbar ? <div className="flex min-w-0 items-center">{toolbar}</div> : null}

      <div className="flex min-w-0 items-center justify-end gap-1">
        {actions}
        {panelToggle ? (
          <Button
            data-doc-panel-toggle=""
            variant="ghost"
            size="icon"
            onClick={panelToggle.onToggle}
            aria-expanded={panelToggle.open}
            aria-controls={panelToggle.controlsId}
            aria-label={panelToggle.open ? t`Hide panel` : t`Show panel`}
            title={panelToggle.open ? t`Hide panel` : t`Show panel`}
          >
            {panelToggle.open ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Turn a path-like document identity into compact viewer-header copy. */
export function viewerTitleFromPath(path: string): string {
  const leaf = path.split('/').at(-1) ?? path;
  const withoutExtension = leaf.replace(/\.(?:md|mdx|pdf)$/i, '');
  const spaced = withoutExtension.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  if (spaced === '') return leaf;
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}
