import { Trans } from '@lingui/react/macro';
import type { DatabaseTableViewConfiguration } from '@nedian0brien/synapsenote-core';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Owns table-only display controls for a saved view. */
export function DatabaseSavedViewSettingsTablePanel({
  configuration,
  onChange,
}: {
  configuration: DatabaseTableViewConfiguration;
  onChange: (configuration: DatabaseTableViewConfiguration) => void;
}) {
  return (
    <section
      className="flex flex-wrap items-center gap-3"
      aria-label="Saved Table display settings"
    >
      <div className="flex items-center gap-2">
        <Checkbox
          checked={configuration.wrap ?? false}
          aria-label="Wrap saved view cells"
          onCheckedChange={(checked) => onChange({ ...configuration, wrap: checked === true })}
        />
        <Trans>Wrap cells</Trans>
      </div>
      <Select
        value={configuration.rowHeight ?? 'standard'}
        onValueChange={(rowHeight) =>
          onChange({ ...configuration, rowHeight: rowHeight as typeof configuration.rowHeight })
        }
      >
        <SelectTrigger size="sm" className="w-36" aria-label="Saved view row height">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="compact">Compact</SelectItem>
          <SelectItem value="standard">Standard</SelectItem>
          <SelectItem value="tall">Tall</SelectItem>
        </SelectContent>
      </Select>
    </section>
  );
}
