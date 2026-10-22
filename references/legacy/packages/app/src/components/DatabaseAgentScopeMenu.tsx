import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import { OpenInAgentMenu } from '@/components/handoff/OpenInAgentMenu';
import { buildProjectScopedHandoffInput } from '@/components/handoff/useHandoffDispatch';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/lib/use-workspace';

export function DatabaseAgentScopeMenu({
  scope,
  label = 'Ask agent',
  ariaLabel,
  open,
  onOpenChange,
  hiddenTrigger = false,
}: {
  scope: DatabaseAgentScope | null;
  label?: ReactNode;
  ariaLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Keep the controlled popover mounted without adding a visible toolbar trigger. */
  hiddenTrigger?: boolean;
}): React.JSX.Element | null {
  const [requested, setRequested] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const workspace = useWorkspace({ enabled: requested });
  const menuOpen = open ?? internalOpen;
  useEffect(() => {
    if (open) setRequested(true);
  }, [open]);
  if (!scope) return null;
  const baseInput = buildProjectScopedHandoffInput({ workspace });
  if (!baseInput) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={ariaLabel}
        aria-hidden={hiddenTrigger}
        tabIndex={hiddenTrigger ? -1 : undefined}
        className={hiddenTrigger ? 'sr-only' : undefined}
        data-testid="open-in-agent-trigger"
        data-database-agent-scope-trigger
        onClick={() => {
          setRequested(true);
          setInternalOpen(true);
          onOpenChange?.(true);
        }}
      >
        <Sparkles aria-hidden="true" />
        {label}
      </Button>
    );
  }
  const input = { ...baseInput, databaseScope: scope };
  return (
    <OpenInAgentMenu
      input={input}
      triggerLabel={label}
      triggerAriaLabel={ariaLabel}
      open={menuOpen}
      onOpenChange={(nextOpen) => {
        setInternalOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
      triggerClassName={hiddenTrigger ? 'sr-only' : undefined}
      triggerAriaHidden={hiddenTrigger}
    />
  );
}
