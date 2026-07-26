import { Trans, useLingui } from '@lingui/react/macro';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNavigationHistory } from '@/hooks/use-navigation-history';
import { cn } from '@/lib/utils';

interface EditorNavigationButtonsProps {
  isElectronHost: boolean;
}

export function EditorNavigationButtons({ isElectronHost }: EditorNavigationButtonsProps) {
  const { t } = useLingui();
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory();

  return (
    <fieldset
      aria-label={t`Navigation history`}
      data-testid="editor-navigation-buttons"
      className={cn(
        'm-0 flex min-w-0 shrink-0 items-center gap-0.5 border-0 p-0',
        isElectronHost && '[-webkit-app-region:no-drag]',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canGoBack}
              onClick={goBack}
              aria-label={t`Back`}
              data-telemetry-event="ok.editor_header.navigation_back.click"
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <Trans>Back</Trans>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canGoForward}
              onClick={goForward}
              aria-label={t`Forward`}
              data-telemetry-event="ok.editor_header.navigation_forward.click"
            >
              <ArrowRight aria-hidden="true" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <Trans>Forward</Trans>
        </TooltipContent>
      </Tooltip>
    </fieldset>
  );
}
