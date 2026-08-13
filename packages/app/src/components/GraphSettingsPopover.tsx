import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronDown, Plus, RotateCcw, Settings2, X } from 'lucide-react';
import { useId, useState } from 'react';
import { GRAPH_GROUP_SWATCHES, nextGraphGroupColor } from '@/components/graph-groups';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  GRAPH_SETTINGS_BOUNDS,
  type GraphGroup,
  type GraphSettings,
  type GraphSettingsScope,
  getDefaultGraphSettings,
  MAX_GRAPH_GROUPS,
} from '@/lib/graph-settings-store';
import { cn } from '@/lib/utils';

// The graph's fullscreen surface is a z-50 overlay pinned to the window, so the
// popover has to outrank it — the same escape hatch the header tooltips use.
const OVERLAY_SAFE_Z = 'z-[9999]';

function SettingsSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b border-border/60 last:border-b-0"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {title}
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function SettingSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SettingSlider({
  label,
  value,
  bounds,
  step,
  format,
  onValueChange,
}: {
  label: string;
  value: number;
  bounds: { min: number; max: number };
  step: number;
  format: (value: number) => string;
  onValueChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{format(value)}</span>
      </div>
      <Slider
        min={bounds.min}
        max={bounds.max}
        step={step}
        value={[value]}
        thumbLabel={label}
        thumbValueText={format(value)}
        onValueChange={([next]) => {
          if (typeof next === 'number') onValueChange(next);
        }}
      />
    </div>
  );
}

function GroupRow({
  group,
  onChange,
  onRemove,
}: {
  group: GraphGroup;
  onChange: (group: GraphGroup) => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className="flex items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t`Group color`}
            // The swatch IS the color, so an inline background overrides the
            // variant's own fill (and, unavoidably, its hover fill — the ring
            // below carries the hover affordance instead).
            className="size-6 shrink-0 rounded-full border border-border/70 hover:ring-2 hover:ring-ring/50"
            style={{ backgroundColor: group.color }}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className={cn('w-auto p-2', OVERLAY_SAFE_Z)}>
          <div className="grid grid-cols-5 gap-1.5">
            {GRAPH_GROUP_SWATCHES.map((color) => (
              <Button
                key={color}
                variant="ghost"
                size="icon-sm"
                aria-label={color}
                aria-pressed={color.toLowerCase() === group.color.toLowerCase()}
                className={cn(
                  'size-6 rounded-full border hover:ring-2 hover:ring-ring/50',
                  color.toLowerCase() === group.color.toLowerCase()
                    ? 'border-foreground'
                    : 'border-border/70',
                )}
                style={{ backgroundColor: color }}
                onClick={() => onChange({ ...group, color })}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={group.query}
        aria-label={t`Group query`}
        placeholder={t`Search terms`}
        className="h-8 text-sm"
        onChange={(event) => onChange({ ...group, query: event.target.value })}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t`Remove group`}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

export function GraphSettingsPopover({
  scope,
  settings,
  isExpanded,
  onSettingsChange,
}: {
  scope: GraphSettingsScope;
  settings: GraphSettings;
  isExpanded: boolean;
  onSettingsChange: (settings: GraphSettings) => void;
}) {
  const { t } = useLingui();

  const patch = (next: Partial<GraphSettings>) => onSettingsChange({ ...settings, ...next });
  const patchFilters = (next: Partial<GraphSettings['filters']>) =>
    patch({ filters: { ...settings.filters, ...next } });
  const patchDisplay = (next: Partial<GraphSettings['display']>) =>
    patch({ display: { ...settings.display, ...next } });
  const patchForces = (next: Partial<GraphSettings['forces']>) =>
    patch({ forces: { ...settings.forces, ...next } });

  const multiplier = (value: number) => `${value.toFixed(2)}×`;
  const plain = (value: number) => String(Math.round(value));

  return (
    <Popover>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t`Graph settings`}
            >
              <Settings2 className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={8}
          className={isExpanded ? OVERLAY_SAFE_Z : undefined}
        >
          <Trans>Graph settings</Trans>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={8}
        // Tall enough to show one open section without the popover itself
        // scrolling; every section open exceeds the docked rail's height.
        className={cn('max-h-[70vh] w-80 overflow-y-auto p-3', OVERLAY_SAFE_Z)}
      >
        <SettingsSection title={t`Filters`} defaultOpen>
          <Input
            value={settings.filters.query}
            aria-label={t`Filter graph`}
            placeholder={t`Search terms, -exclude, tag:name`}
            className="h-8 text-sm"
            onChange={(event) => patchFilters({ query: event.target.value })}
          />
          <SettingSwitch
            label={t`External links`}
            checked={settings.filters.showExternalNodes}
            onCheckedChange={(checked) => patchFilters({ showExternalNodes: checked })}
          />
          <SettingSwitch
            label={t`Uncreated pages`}
            checked={settings.filters.showMissingNodes}
            onCheckedChange={(checked) => patchFilters({ showMissingNodes: checked })}
          />
          <SettingSwitch
            label={t`Orphans`}
            checked={settings.filters.showOrphans}
            onCheckedChange={(checked) => patchFilters({ showOrphans: checked })}
          />
          <SettingSwitch
            label={t`Tags`}
            checked={settings.filters.showTagNodes}
            onCheckedChange={(checked) => patchFilters({ showTagNodes: checked })}
          />
          <SettingSwitch
            label={t`Folders`}
            checked={settings.filters.showFolderNodes}
            onCheckedChange={(checked) => patchFilters({ showFolderNodes: checked })}
          />
        </SettingsSection>

        <SettingsSection title={t`Groups`}>
          {settings.groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              <Trans>
                Color pages that match a search. The first matching group in the list wins.
              </Trans>
            </p>
          ) : (
            settings.groups.map((group, index) => (
              <GroupRow
                key={group.id}
                group={group}
                onChange={(next) =>
                  patch({
                    groups: settings.groups.map((current, position) =>
                      position === index ? next : current,
                    ),
                  })
                }
                onRemove={() =>
                  patch({ groups: settings.groups.filter((_, position) => position !== index) })
                }
              />
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={settings.groups.length >= MAX_GRAPH_GROUPS}
            onClick={() =>
              patch({
                groups: [
                  ...settings.groups,
                  {
                    // Unique per addition without a random source: the store
                    // caps the list, so a monotonic counter cannot collide with
                    // a live row even after removals in the middle.
                    id: `group-${Date.now()}-${settings.groups.length}`,
                    query: '',
                    color: nextGraphGroupColor(settings.groups),
                  },
                ],
              })
            }
          >
            <Plus className="size-3.5" />
            <Trans>Add group</Trans>
          </Button>
        </SettingsSection>

        <SettingsSection title={t`Display`}>
          <SettingSlider
            label={t`Node size`}
            value={settings.display.nodeSize}
            bounds={GRAPH_SETTINGS_BOUNDS.nodeSize}
            step={0.05}
            format={multiplier}
            onValueChange={(nodeSize) => patchDisplay({ nodeSize })}
          />
          <SettingSlider
            label={t`Link thickness`}
            value={settings.display.linkThickness}
            bounds={GRAPH_SETTINGS_BOUNDS.linkThickness}
            step={0.05}
            format={multiplier}
            onValueChange={(linkThickness) => patchDisplay({ linkThickness })}
          />
          <SettingSlider
            label={t`Text fade threshold`}
            value={settings.display.textFadeThreshold}
            bounds={GRAPH_SETTINGS_BOUNDS.textFadeThreshold}
            step={0.1}
            format={(value) => (value === 0 ? t`Always` : value.toFixed(1))}
            onValueChange={(textFadeThreshold) => patchDisplay({ textFadeThreshold })}
          />
          <SettingSlider
            label={t`Label count`}
            value={settings.display.maxLabels}
            bounds={GRAPH_SETTINGS_BOUNDS.maxLabels}
            step={1}
            format={plain}
            onValueChange={(maxLabels) => patchDisplay({ maxLabels })}
          />
          <SettingSwitch
            label={t`Arrows`}
            checked={settings.display.showArrows}
            onCheckedChange={(showArrows) => patchDisplay({ showArrows })}
          />
        </SettingsSection>

        <SettingsSection title={t`Forces`}>
          <SettingSlider
            label={t`Center force`}
            value={settings.forces.centerStrength}
            bounds={GRAPH_SETTINGS_BOUNDS.centerStrength}
            step={0.05}
            format={(value) => value.toFixed(2)}
            onValueChange={(centerStrength) => patchForces({ centerStrength })}
          />
          <SettingSlider
            label={t`Repel force`}
            value={settings.forces.repelStrength}
            bounds={GRAPH_SETTINGS_BOUNDS.repelStrength}
            step={5}
            format={plain}
            onValueChange={(repelStrength) => patchForces({ repelStrength })}
          />
          <SettingSlider
            label={t`Link force`}
            value={settings.forces.linkStrength}
            bounds={GRAPH_SETTINGS_BOUNDS.linkStrength}
            step={0.05}
            format={multiplier}
            onValueChange={(linkStrength) => patchForces({ linkStrength })}
          />
          <SettingSlider
            label={t`Link distance`}
            value={settings.forces.linkDistance}
            bounds={GRAPH_SETTINGS_BOUNDS.linkDistance}
            step={5}
            format={plain}
            onValueChange={(linkDistance) => patchForces({ linkDistance })}
          />
        </SettingsSection>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full text-muted-foreground hover:text-foreground"
          onClick={() => onSettingsChange(getDefaultGraphSettings(scope))}
        >
          <RotateCcw className="size-3.5" />
          <Trans>Restore defaults</Trans>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
