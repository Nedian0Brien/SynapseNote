import { Trans, useLingui } from '@lingui/react/macro';
import { FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getEditorForDoc } from '@/editor/active-editor';
import { exportRenderedDocumentToPdf } from '@/lib/pdf-export';

export function ExportPdfButton({ docName }: { docName: string | null }) {
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!docName || busy) return;
    const editor = getEditorForDoc(docName);
    if (!editor) {
      toast.error(t`The document is still loading. Try exporting again in a moment.`);
      return;
    }

    setBusy(true);
    try {
      const activeScroller = document.querySelector<HTMLElement>('[data-pdf-export-active="true"]');
      const result = await exportRenderedDocumentToPdf({
        docName,
        editor,
        pageHeader: activeScroller?.querySelector<HTMLElement>('[data-testid="page-header"]'),
      });
      if (result.kind === 'saved') toast.success(t`PDF exported successfully.`);
      else if (result.kind === 'failed') toast.error(t`Couldn't export the PDF.`);
    } catch {
      toast.error(t`Couldn't export the PDF.`);
    }
    setBusy(false);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={docName === null || busy}
          onClick={() => void handleClick()}
          aria-label={t`Export as PDF`}
          data-testid="export-pdf-button"
          data-telemetry-event="ok.editor_header.export_pdf.click"
          className="text-muted-foreground"
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <FileDown aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <Trans>Export as PDF</Trans>
      </TooltipContent>
    </Tooltip>
  );
}
