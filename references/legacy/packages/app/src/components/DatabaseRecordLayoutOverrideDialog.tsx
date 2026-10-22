import { Trans } from '@lingui/react/macro';
import type {
  DatabaseRecordPageLayoutOverride,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { DatabaseRecordPageLayoutOverrideSchema } from '@nedian0brien/synapsenote-core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PropertyPlacement = 'inherit' | 'pinned' | 'panel' | 'hidden';
type GroupState = 'inherit' | 'collapsed' | 'expanded';
type WidthState = 'inherit' | 'full' | 'standard';

function initialPropertyPlacements(
  source: DatabaseSource,
  override: DatabaseRecordPageLayoutOverride | null,
): Record<string, PropertyPlacement> {
  const result: Record<string, PropertyPlacement> = {};
  for (const property of source.properties) {
    if (property.type !== 'title') result[property.id] = 'inherit';
  }
  for (const propertyId of override?.pinnedPropertyIds ?? []) result[propertyId] = 'pinned';
  for (const propertyId of override?.panelPropertyIds ?? []) result[propertyId] = 'panel';
  for (const propertyId of override?.hiddenPropertyIds ?? []) result[propertyId] = 'hidden';
  return result;
}

export function DatabaseRecordLayoutOverrideDialog({
  open,
  onOpenChange,
  source,
  override,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DatabaseSource;
  override: DatabaseRecordPageLayoutOverride | null;
  onSave: (override: DatabaseRecordPageLayoutOverride | null) => void;
}) {
  const properties = source.properties.filter((property) => property.type !== 'title');
  const groups =
    source.pageLayout?.sections.flatMap((section) =>
      section.groups.map((group) => ({ ...group, sectionName: section.name })),
    ) ?? [];
  const [placements, setPlacements] = useState(() => initialPropertyPlacements(source, override));
  const [groupStates, setGroupStates] = useState<Record<string, GroupState>>(() =>
    Object.fromEntries([
      ...groups.map((group) => [group.id, 'inherit'] as const),
      ...(override?.groupOverrides.map(
        (item) => [item.groupId, item.collapsed ? 'collapsed' : 'expanded'] as const,
      ) ?? []),
    ]),
  );
  const [widthState, setWidthState] = useState<WidthState>(() =>
    override?.fullWidthContent === undefined
      ? 'inherit'
      : override.fullWidthContent
        ? 'full'
        : 'standard',
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    const propertyIds = (placement: PropertyPlacement) =>
      properties
        .filter((property) => placements[property.id] === placement)
        .map((property) => property.id);
    const candidate = {
      pinnedPropertyIds: propertyIds('pinned'),
      panelPropertyIds: propertyIds('panel'),
      hiddenPropertyIds: propertyIds('hidden'),
      groupOverrides: groups.flatMap((group) => {
        const state = groupStates[group.id] ?? 'inherit';
        return state === 'inherit' ? [] : [{ groupId: group.id, collapsed: state === 'collapsed' }];
      }),
      ...(widthState === 'inherit' ? {} : { fullWidthContent: widthState === 'full' }),
    };
    const parsed = DatabaseRecordPageLayoutOverrideSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid record layout override');
      return;
    }
    onSave(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Customize this record</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Override presentation only. Property values, source sections, and the database schema
              remain shared.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5 overflow-y-auto">
          <div className="space-y-2">
            <h3 className="font-medium text-sm">
              <Trans>Property overrides</Trans>
            </h3>
            {properties.map((property) => (
              <div key={property.id} className="grid grid-cols-[1fr_minmax(12rem,1fr)] gap-3">
                <span className="self-center text-sm">{property.name}</span>
                <Select
                  value={placements[property.id] ?? 'inherit'}
                  onValueChange={(value) =>
                    setPlacements((current) => ({
                      ...current,
                      [property.id]: value as PropertyPlacement,
                    }))
                  }
                >
                  <SelectTrigger aria-label={`${property.name} record placement`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Inherit source layout</SelectItem>
                    <SelectItem value="pinned">Pinned</SelectItem>
                    <SelectItem value="panel">Panel</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {groups.length > 0 ? (
            <div className="space-y-2">
              <h3 className="font-medium text-sm">
                <Trans>Group state overrides</Trans>
              </h3>
              {groups.map((group) => (
                <div key={group.id} className="grid grid-cols-[1fr_minmax(12rem,1fr)] gap-3">
                  <span className="self-center text-sm">
                    {group.sectionName} / {group.name}
                  </span>
                  <Select
                    value={groupStates[group.id] ?? 'inherit'}
                    onValueChange={(value) =>
                      setGroupStates((current) => ({
                        ...current,
                        [group.id]: value as GroupState,
                      }))
                    }
                  >
                    <SelectTrigger aria-label={`${group.name} record state`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">Inherit source layout</SelectItem>
                      <SelectItem value="collapsed">Collapsed</SelectItem>
                      <SelectItem value="expanded">Expanded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-[1fr_minmax(12rem,1fr)] gap-3">
            <span className="self-center text-sm">
              <Trans>Content width</Trans>
            </span>
            <Select
              value={widthState}
              onValueChange={(value) => setWidthState(value as WidthState)}
            >
              <SelectTrigger aria-label="Record content width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Inherit source layout</SelectItem>
                <SelectItem value="full">Full width</SelectItem>
                <SelectItem value="standard">Standard width</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onSave(null)}>
            <Trans>Reset to source layout</Trans>
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="button" onClick={save}>
              <Trans>Review record override</Trans>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
