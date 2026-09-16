// Derived from agent-chat-framework/src/registry/assistant-ui/elements/message-actions.tsx.
// Copyright (c) 2025 AgentbaseAI Inc. MIT; see licenses/assistant-ui-MIT.txt.
// NOTE(SynapseNote): Retain copy/regenerate actions, localize labels through
// props and use existing shadcn buttons and focus-accessible tooltips.
import { CheckIcon, CopyIcon, RefreshCwIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MessageActionsProps extends ComponentProps<'div'> {
  copied: boolean;
  copyLabel: string;
  regenerateLabel: string;
  onCopy: () => void;
  onRegenerate?: () => void;
  disabled: boolean;
}

export function MessageActions({
  copied,
  copyLabel,
  regenerateLabel,
  onCopy,
  onRegenerate,
  disabled,
  className,
  ...props
}: MessageActionsProps) {
  return (
    <TooltipProvider>
      <div
        data-slot="message-actions"
        className={cn('flex items-center gap-1 text-muted-foreground', className)}
        {...props}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copyLabel}
              onClick={onCopy}
            >
              {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copyLabel}</TooltipContent>
        </Tooltip>
        {onRegenerate === undefined ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={regenerateLabel}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
                aria-disabled={disabled}
                onClick={() => {
                  if (!disabled) onRegenerate();
                }}
              >
                <RefreshCwIcon aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{regenerateLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
