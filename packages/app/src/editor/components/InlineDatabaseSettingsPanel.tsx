import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import {
  ChevronRight,
  Columns3,
  Database,
  ExternalLink,
  Eye,
  Filter,
  Layers3,
  Link2,
  ListFilter,
  LockKeyhole,
  Palette,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Table2,
  X,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type PanelAction = () => void;

function SettingsRow({
  icon: Icon,
  label,
  value,
  onSelect,
  disabled = false,
}: {
  icon: typeof Table2;
  label: string;
  value?: string;
  onSelect?: PanelAction;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="group flex min-h-10 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm transition-colors hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-45"
      disabled={disabled || !onSelect}
      onClick={onSelect}
      title={disabled ? `${label} is not available in the document view` : undefined}
      data-database-settings-row={label}
    >
      <Icon
        className="size-[18px] shrink-0 text-muted-foreground group-hover:text-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value ? (
        <span className="max-w-28 truncate text-muted-foreground text-xs">{value}</span>
      ) : null}
      {onSelect ? (
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export interface InlineDatabaseSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeView?: DatabaseView;
  linkedSource?: DatabaseSource | null;
  visiblePropertyCount: number;
  totalPropertyCount: number;
  onOpenFilters: () => void;
  onOpenSort: () => void;
  onOpenProperties: () => void;
  onOpenAdvancedSettings: () => void;
  onOpenSavedViews: () => void;
}

/**
 * Document-native view settings. The table remains mounted while this
 * anchored panel or any of its child popovers is open.
 */
export function InlineDatabaseSettingsPanel({
  open,
  onOpenChange,
  activeView,
  linkedSource,
  visiblePropertyCount,
  totalPropertyCount,
  onOpenFilters,
  onOpenSort,
  onOpenProperties,
  onOpenAdvancedSettings,
  onOpenSavedViews,
}: InlineDatabaseSettingsPanelProps) {
  const [copied, setCopied] = useState(false);
  const runChildAction = (action: PanelAction) => {
    onOpenChange(false);
    window.setTimeout(action, 0);
  };
  const copyViewLink = async () => {
    const href = window.location.href;
    try {
      await navigator.clipboard?.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="View settings"
          data-database-inline-settings-trigger
        >
          <SlidersHorizontal aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        role="dialog"
        aria-label="View settings"
        className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(42rem,calc(100vh-2rem))] overflow-y-auto rounded-xl p-2 shadow-xl"
        data-database-inline-settings-panel
      >
        <div className="flex items-center gap-2 px-2.5 pt-1 pb-2">
          <div className="flex size-8 items-center justify-center rounded-md border bg-muted/50">
            <Table2 className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{activeView?.name ?? 'Table'}</p>
            <p className="truncate text-muted-foreground text-xs">
              {linkedSource?.name ?? 'Database view'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Close view settings"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="border-t pt-1">
          <SettingsRow
            icon={Table2}
            label="Layout"
            value={activeView?.layout.type ?? 'Table'}
            onSelect={() => runChildAction(onOpenAdvancedSettings)}
          />
          <SettingsRow
            icon={Eye}
            label="Property visibility"
            value={`${visiblePropertyCount}/${totalPropertyCount}`}
            onSelect={() => runChildAction(onOpenProperties)}
          />
          <SettingsRow
            icon={ListFilter}
            label="Filter"
            onSelect={() => runChildAction(onOpenFilters)}
          />
          <SettingsRow icon={Filter} label="Sort" onSelect={() => runChildAction(onOpenSort)} />
          <SettingsRow icon={Layers3} label="Group" disabled />
          <SettingsRow icon={Palette} label="Conditional color" disabled />
          <button
            type="button"
            className="group flex min-h-10 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm transition-colors hover:bg-muted/70"
            onClick={() => void copyViewLink()}
            data-database-settings-row="Copy view link"
          >
            <Link2
              className="size-[18px] shrink-0 text-muted-foreground group-hover:text-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">{copied ? 'Copied view link' : 'Copy view link'}</span>
          </button>
        </div>

        <div className="mt-1 border-t pt-1">
          <p className="px-2.5 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            View management
          </p>
          <SettingsRow
            icon={Settings2}
            label="Manage saved views"
            onSelect={() => runChildAction(onOpenSavedViews)}
          />
          <SettingsRow
            icon={Columns3}
            label="Edit properties"
            onSelect={() => runChildAction(onOpenProperties)}
          />
          <SettingsRow icon={Sparkles} label="AI autofill" disabled />
          <SettingsRow
            icon={ExternalLink}
            label="Advanced view settings"
            onSelect={() => runChildAction(onOpenAdvancedSettings)}
          />
        </div>

        <div className="mt-1 border-t pt-1">
          <p className="px-2.5 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Data source settings
          </p>
          <SettingsRow
            icon={Database}
            label="Manage data source"
            value={linkedSource?.name ?? 'Current database'}
            disabled
          />
          <SettingsRow icon={Zap} label="Automations" disabled />
          <SettingsRow icon={LockKeyhole} label="Lock database" disabled />
        </div>
      </PopoverContent>
    </Popover>
  );
}
