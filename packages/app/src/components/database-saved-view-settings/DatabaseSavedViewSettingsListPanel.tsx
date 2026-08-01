import { Trans } from '@lingui/react/macro';
import type { DatabaseListViewConfiguration, DatabaseSource } from '@nedian0brien/synapsenote-core';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Owns list hierarchy, density, section, and load-limit controls. */
export function DatabaseSavedViewSettingsListPanel({
  configuration,
  onChange,
  source,
}: {
  configuration: DatabaseListViewConfiguration;
  onChange: (configuration: DatabaseListViewConfiguration) => void;
  source: DatabaseSource;
}) {
  const parentPropertyId =
    configuration.hierarchy.type === 'parent_relation'
      ? configuration.hierarchy.propertyId
      : 'none';
  return (
    <section className="space-y-3" aria-label="Saved List display settings">
      <strong>
        <Trans>List hierarchy and display</Trans>
      </strong>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={parentPropertyId}
          onValueChange={(propertyId) =>
            onChange({
              ...configuration,
              hierarchy:
                propertyId === 'none' ? { type: 'flat' } : { type: 'parent_relation', propertyId },
            })
          }
        >
          <SelectTrigger size="sm" aria-label="List parent Relation property">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Flat list</SelectItem>
            {source.properties
              .filter(
                (property) => property.type === 'relation' && property.targetSourceId === source.id,
              )
              .map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name} hierarchy
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={configuration.density}
          onValueChange={(density) =>
            onChange({ ...configuration, density: density as typeof configuration.density })
          }
        >
          <SelectTrigger size="sm" aria-label="List density">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="comfortable">Comfortable</SelectItem>
          </SelectContent>
        </Select>
        <label htmlFor="list-load-limit" className="space-y-1 text-xs">
          <span>Load limit</span>
          <Input
            id="list-load-limit"
            type="number"
            min={1}
            max={500}
            value={configuration.loadLimit}
            aria-label="List load limit"
            onChange={(event) =>
              onChange({ ...configuration, loadLimit: Number(event.currentTarget.value) })
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <ListBooleanControl
          checked={configuration.showSections}
          label="Group sections"
          onChange={(showSections) => onChange({ ...configuration, showSections })}
        />
        <ListBooleanControl
          checked={configuration.collapsibleSections}
          label="Collapsible sections"
          onChange={(collapsibleSections) => onChange({ ...configuration, collapsibleSections })}
        />
        <ListBooleanControl
          checked={configuration.showDividers}
          label="Row dividers"
          onChange={(showDividers) => onChange({ ...configuration, showDividers })}
        />
      </div>
    </section>
  );
}

function ListBooleanControl({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        aria-label={label}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </div>
  );
}
