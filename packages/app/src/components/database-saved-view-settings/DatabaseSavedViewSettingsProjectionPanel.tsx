import { Trans } from '@lingui/react/macro';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SavedViewSettingsPanelProps } from './database-saved-view-settings-types';
import { move, moveVisibleProperty } from './database-saved-view-settings-utils';

/** Owns editable projection visibility, ordering, body mode, and table widths. */
export function DatabaseSavedViewSettingsProjectionPanel({
  draft,
  setDraft,
  source,
}: SavedViewSettingsPanelProps) {
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const visiblePropertyOrder = draft.propertyOrder.filter((propertyId) =>
    draft.visiblePropertyIds.includes(propertyId),
  );
  const propertyWidths =
    draft.layout.type === 'table' ? (draft.layout.configuration.propertyWidths ?? {}) : {};
  return (
    <section className="space-y-2" aria-label="Saved view property projection">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          <Trans>Properties and order</Trans>
        </strong>
        <Select
          value={draft.body}
          onValueChange={(body) =>
            setDraft((current) => ({ ...current, body: body as typeof current.body }))
          }
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Saved view body projection">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hidden">Body hidden</SelectItem>
            <SelectItem value="preview">Body preview</SelectItem>
            <SelectItem value="full">Body full</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {draft.propertyOrder.map((propertyId, index) => {
        const property = source.properties.find((candidate) => candidate.id === propertyId);
        if (!property) return null;
        const title = property.id === titleProperty?.id;
        const visible = draft.visiblePropertyIds.includes(property.id);
        const visibleIndex = visiblePropertyOrder.indexOf(property.id);
        const moveProperty = (direction: -1 | 1) =>
          setDraft((current) => ({
            ...current,
            propertyOrder: visible
              ? moveVisibleProperty(
                  current.propertyOrder,
                  current.visiblePropertyIds,
                  property.id,
                  direction,
                )
              : move(current.propertyOrder, index, direction),
          }));
        return (
          <div
            key={property.id}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border p-2"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={visible}
                disabled={title}
                aria-label={`Show ${property.name} in saved view`}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    visiblePropertyIds:
                      checked === true
                        ? [...new Set([...current.visiblePropertyIds, property.id])]
                        : current.visiblePropertyIds.filter((id) => id !== property.id),
                  }))
                }
              />
              <span>{property.name}</span>
            </div>
            <div className="flex">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={title || (visible ? visibleIndex <= 1 : index === 0)}
                aria-label={`Move ${property.name} up in saved view`}
                onClick={() => moveProperty(-1)}
              >
                <ChevronUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={
                  title ||
                  (visible
                    ? visibleIndex < 0 || visibleIndex >= visiblePropertyOrder.length - 1
                    : index === draft.propertyOrder.length - 1 ||
                      titleProperty?.id === draft.propertyOrder[index + 1])
                }
                aria-label={`Move ${property.name} down in saved view`}
                onClick={() => moveProperty(1)}
              >
                <ChevronDown />
              </Button>
            </div>
            {draft.layout.type === 'table' ? (
              <Input
                type="number"
                min={120}
                max={480}
                step={20}
                value={propertyWidths[property.id] ?? (title ? 280 : 180)}
                aria-label={`Saved width for ${property.name}`}
                onChange={(event) =>
                  setDraft((current) => {
                    if (current.layout.type !== 'table') return current;
                    return {
                      ...current,
                      layout: {
                        ...current.layout,
                        configuration: {
                          ...current.layout.configuration,
                          propertyWidths: {
                            ...current.layout.configuration.propertyWidths,
                            [property.id]: Number(event.currentTarget.value),
                          },
                        },
                      },
                    };
                  })
                }
              />
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </section>
  );
}
