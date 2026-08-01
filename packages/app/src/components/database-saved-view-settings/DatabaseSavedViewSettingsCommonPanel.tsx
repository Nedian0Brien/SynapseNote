import { Trans } from '@lingui/react/macro';
import type { DatabaseViewOpenBehavior } from '@nedian0brien/synapsenote-core';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Owns the scope explanation and the saved-view page-opening control. */
export function DatabaseSavedViewSettingsCommonPanel({
  openBehavior,
  onOpenBehaviorChange,
}: {
  onOpenBehaviorChange: (value: DatabaseViewOpenBehavior) => void;
  openBehavior: DatabaseViewOpenBehavior;
}) {
  return (
    <>
      <section
        className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"
        aria-label="Saved view settings scope"
        data-testid="saved-view-settings-scope"
      >
        <strong>
          <Trans>One reviewed view configuration</Trans>
        </strong>
        <p className="mt-1 text-muted-foreground text-xs">
          <Trans>
            Opening behavior, properties, order, sorts, groups, colors, and layout display options
            save together. Filters stay on the active view&apos;s Filters action and use the same
            canonical view boundary.
          </Trans>
        </p>
      </section>
      <section className="space-y-2" aria-label="Saved view page opening">
        <strong>
          <Trans>Open records in</Trans>
        </strong>
        <Select
          value={openBehavior}
          onValueChange={(value) => onOpenBehaviorChange(value as DatabaseViewOpenBehavior)}
        >
          <SelectTrigger size="sm" aria-label="Open records in">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="side_peek">Side peek</SelectItem>
            <SelectItem value="center_peek">Center peek</SelectItem>
            <SelectItem value="full_page">Full page</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          This choice is stored on this stable saved view and applies to everyone using it.
        </p>
      </section>
    </>
  );
}
