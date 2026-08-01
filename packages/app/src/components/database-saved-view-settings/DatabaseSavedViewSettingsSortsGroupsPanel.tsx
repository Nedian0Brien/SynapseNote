import { Trans } from '@lingui/react/macro';
import { Plus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SavedViewSettingsPanelProps } from './database-saved-view-settings-types';

/** Owns local saved-view sort and group row editing. */
export function DatabaseSavedViewSettingsSortsGroupsPanel({
  draft,
  setDraft,
  source,
  view,
}: SavedViewSettingsPanelProps) {
  const nextEditorId = useRef(
    draft.sort.length + draft.groups.length + draft.conditionalColors.length,
  );
  return (
    <>
      <section className="space-y-2" aria-label="Saved view sorts">
        <div className="flex items-center justify-between">
          <strong>
            <Trans>Sort</Trans>
          </strong>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                sort: [
                  ...current.sort,
                  {
                    editorId: `${view.id}:sort:${nextEditorId.current++}`,
                    propertyId: source.properties[0]?.id ?? '',
                    direction: 'asc',
                  },
                ],
              }))
            }
          >
            <Plus /> <Trans>Add sort</Trans>
          </Button>
        </div>
        {draft.sort.map((item, index) => (
          <div key={item.editorId} className="flex gap-2">
            <Select
              value={item.propertyId}
              onValueChange={(propertyId) =>
                setDraft((current) => ({
                  ...current,
                  sort: current.sort.map((candidate, candidateIndex) =>
                    candidateIndex === index ? { ...candidate, propertyId } : candidate,
                  ),
                }))
              }
            >
              <SelectTrigger size="sm" aria-label={`Sort ${index + 1} property`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {source.properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={item.direction}
              onValueChange={(direction) =>
                setDraft((current) => ({
                  ...current,
                  sort: current.sort.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, direction: direction as 'asc' | 'desc' }
                      : candidate,
                  ),
                }))
              }
            >
              <SelectTrigger size="sm" className="w-28" aria-label={`Sort ${index + 1} direction`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove sort ${index + 1}`}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  sort: current.sort.filter((_, candidateIndex) => candidateIndex !== index),
                }))
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-2" aria-label="Saved view groups">
        <div className="flex items-center justify-between">
          <strong>
            <Trans>Group and subgroup</Trans>
          </strong>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft.groups.length >= 2}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                groups: [
                  ...current.groups,
                  {
                    editorId: `${view.id}:group:${nextEditorId.current++}`,
                    propertyId: source.properties[0]?.id ?? '',
                    direction: 'asc',
                    hideEmpty: false,
                  },
                ],
              }))
            }
          >
            <Plus /> <Trans>Add group</Trans>
          </Button>
        </div>
        {draft.groups.map((item, index) => {
          const groupName = index === 0 ? 'Group' : 'Subgroup';
          return (
            <div key={item.editorId} className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-muted-foreground text-xs">{groupName}</span>
              <Select
                value={item.propertyId}
                onValueChange={(propertyId) =>
                  setDraft((current) => ({
                    ...current,
                    groups: current.groups.map((candidate, candidateIndex) =>
                      candidateIndex === index ? { ...candidate, propertyId } : candidate,
                    ),
                  }))
                }
              >
                <SelectTrigger size="sm" aria-label={`${groupName} property`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {source.properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={item.direction}
                onValueChange={(direction) =>
                  setDraft((current) => ({
                    ...current,
                    groups: current.groups.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, direction: direction as 'asc' | 'desc' }
                        : candidate,
                    ),
                  }))
                }
              >
                <SelectTrigger size="sm" className="w-28" aria-label={`${groupName} direction`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={item.hideEmpty}
                  aria-label={`${groupName} hides empty values`}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      groups: current.groups.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, hideEmpty: checked === true }
                          : candidate,
                      ),
                    }))
                  }
                />
                <Trans>Hide empty</Trans>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${groupName.toLowerCase()}`}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    groups: current.groups.filter((_, candidateIndex) => candidateIndex !== index),
                  }))
                }
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </section>
    </>
  );
}
