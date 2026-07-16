import { Trans } from '@lingui/react/macro';
import { formatFileSize } from '@nedian0brien/synapsenote-core';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface LargeFileEditorStateProps {
  docName: string;
  size: number;
  limit: number;
  backNav?: {
    previousDocName: string;
    onNavigateBack: (previousDocName: string) => void;
  };
}

export function LargeFileEditorState({ docName, size, limit, backNav }: LargeFileEditorStateProps) {
  const canGoBack = backNav !== undefined;
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (canGoBack) {
      backButtonRef.current?.focus();
    } else {
      headingRef.current?.focus();
    }
  }, [canGoBack]);

  return (
    <div
      role="status"
      aria-labelledby="large-file-title"
      data-slot="large-file-editor-state"
      className="flex h-full flex-col items-center justify-center gap-8 p-8 text-center"
    >
      <div className="flex size-16 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
        <FileWarning className="size-9" aria-hidden="true" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <h2
          ref={headingRef}
          id="large-file-title"
          tabIndex={canGoBack ? undefined : -1}
          className="text-2xl font-light text-balance outline-none"
        >
          <Trans>File too large to open</Trans>
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          <Trans>
            {docName} is {formatFileSize(size)}. SynapseNote currently opens files up to{' '}
            {formatFileSize(limit)}.
          </Trans>
        </p>
      </div>
      {canGoBack ? (
        <Button
          ref={backButtonRef}
          variant="default"
          onClick={() => backNav.onNavigateBack(backNav.previousDocName)}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <Trans>Go back</Trans>
        </Button>
      ) : null}
    </div>
  );
}
