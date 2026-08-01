import { Trans } from '@lingui/react/macro';
import {
  DATABASE_CONDITIONAL_COLOR_NAMES,
  type DatabaseConditionalColorRule,
} from '@nedian0brien/synapsenote-core';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { DatabaseAdvancedFilterDialog } from '@/components/DatabaseAdvancedFilterDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SavedViewSettingsPanelProps } from './database-saved-view-settings-types';
import { conditionalColorSummary, move } from './database-saved-view-settings-utils';

/** Owns ordered conditional-color rule editing and the typed filter handoff. */
export function DatabaseSavedViewSettingsConditionalColorsPanel({
  draft,
  setDraft,
  source,
  view,
}: SavedViewSettingsPanelProps) {
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const nextEditorId = useRef(
    draft.sort.length + draft.groups.length + draft.conditionalColors.length,
  );
  return (
    <>
      <section className="space-y-2" aria-label="Saved view conditional colors">
        <div className="flex items-center justify-between">
          <div>
            <strong>
              <Trans>Conditional colors</Trans>
            </strong>
            <p className="text-muted-foreground text-xs">
              <Trans>Rules are evaluated in order; the first match for each target wins.</Trans>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft.conditionalColors.length >= 100 || source.properties.length === 0}
            onClick={() => {
              const property = source.properties[0];
              if (!property) return;
              const serial = nextEditorId.current++;
              setDraft((current) => ({
                ...current,
                conditionalColors: [
                  ...current.conditionalColors,
                  {
                    editorId: `${view.id}:conditional-color:${serial}`,
                    id: `ccr_${view.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}_${serial}`,
                    key: `color-rule-${serial + 1}`,
                    name: `Color rule ${serial + 1}`,
                    color: 'yellow',
                    where: { propertyId: property.id, operator: 'is_not_empty' },
                    applyTo: { type: 'page' },
                  },
                ],
              }));
            }}
          >
            <Plus /> <Trans>Add color rule</Trans>
          </Button>
        </div>
        {draft.conditionalColors.map((rule, index) => (
          <div key={rule.editorId} className="space-y-2 rounded border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-44 flex-1"
                aria-label={`Conditional color ${index + 1} name`}
                value={rule.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    conditionalColors: current.conditionalColors.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, name: event.currentTarget.value }
                        : candidate,
                    ),
                  }))
                }
              />
              <Select
                value={rule.color}
                onValueChange={(color) =>
                  setDraft((current) => ({
                    ...current,
                    conditionalColors: current.conditionalColors.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, color: color as DatabaseConditionalColorRule['color'] }
                        : candidate,
                    ),
                  }))
                }
              >
                <SelectTrigger
                  size="sm"
                  className="w-28"
                  aria-label={`Conditional color ${index + 1} color`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATABASE_CONDITIONAL_COLOR_NAMES.map((color) => (
                    <SelectItem key={color} value={color}>
                      {color}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={
                  rule.applyTo.type === 'page' ? 'page' : `property:${rule.applyTo.propertyId}`
                }
                onValueChange={(target) =>
                  setDraft((current) => ({
                    ...current,
                    conditionalColors: current.conditionalColors.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? {
                            ...candidate,
                            applyTo:
                              target === 'page'
                                ? { type: 'page' }
                                : {
                                    type: 'property',
                                    propertyId: target.slice('property:'.length),
                                  },
                          }
                        : candidate,
                    ),
                  }))
                }
              >
                <SelectTrigger
                  size="sm"
                  className="min-w-40"
                  aria-label={`Conditional color ${index + 1} target`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Entire page / row</SelectItem>
                  {source.properties.map((property) => (
                    <SelectItem key={property.id} value={`property:${property.id}`}>
                      {property.name} property
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === 0}
                  aria-label={`Move conditional color ${index + 1} up`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      conditionalColors: move(current.conditionalColors, index, -1),
                    }))
                  }
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === draft.conditionalColors.length - 1}
                  aria-label={`Move conditional color ${index + 1} down`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      conditionalColors: move(current.conditionalColors, index, 1),
                    }))
                  }
                >
                  <ChevronDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove conditional color ${index + 1}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      conditionalColors: current.conditionalColors.filter(
                        (_, candidateIndex) => candidateIndex !== index,
                      ),
                    }))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <code className="truncate" title={conditionalColorSummary(rule, source)}>
                {conditionalColorSummary(rule, source)}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Edit conditional color ${index + 1} condition`}
                onClick={() => setEditingRuleId(rule.editorId)}
              >
                <Trans>Edit condition</Trans>
              </Button>
            </div>
          </div>
        ))}
      </section>
      {editingRuleId ? (
        <DatabaseAdvancedFilterDialog
          open
          allowClear={false}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditingRuleId(null);
          }}
          source={source}
          initialWhere={
            draft.conditionalColors.find((rule) => rule.editorId === editingRuleId)?.where
          }
          onSave={(where) => {
            if (!where) return;
            setDraft((current) => ({
              ...current,
              conditionalColors: current.conditionalColors.map((rule) =>
                rule.editorId === editingRuleId ? { ...rule, where } : rule,
              ),
            }));
            setEditingRuleId(null);
          }}
        />
      ) : null}
    </>
  );
}
