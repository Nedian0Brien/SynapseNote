// biome-ignore-all lint/plugin/no-raw-html-interactive-element: textarea forwards RHF Slot props; tracked in the settings form migration backlog.
import { Trans, useLingui } from '@lingui/react/macro';
import { type Config, ConfigSchema, getFieldMeta } from '@nedian0brien/synapsenote-core';
import { Check, RotateCcw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { type ControllerRenderProps, type FieldPath, useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  getEnumOptions,
  getFieldDefault,
  getLeafTypeTag,
  resolveLeafSchema,
} from '../schema-walker';
import type { SettingsFieldDef, SettingsScope } from '../settings-types';
import type { SlotForwardedProps } from '../slot-forwarded-props';

export function SavedIndicator({ visible }: { visible: boolean }) {
  return (
    <span role="status" aria-live="polite" className="text-emerald-600">
      {visible ? (
        <>
          <Check aria-hidden="true" className="size-3.5" />
          <span className="sr-only">
            <Trans>Saved</Trans>
          </span>
        </>
      ) : null}
    </span>
  );
}

export function SettingsField({
  field,
  scope,
  commitField,
  isFlashed,
}: {
  field: SettingsFieldDef;
  scope: SettingsScope;
  commitField: (name: FieldPath<Config>) => boolean;
  isFlashed: boolean;
}) {
  'use no memo';
  const { t } = useLingui();
  const form = useFormContext<Config>();
  const leafSchema = resolveLeafSchema(ConfigSchema, field.path);
  const typeTag = leafSchema ? getLeafTypeTag(leafSchema) : undefined;
  const defaultValue = leafSchema ? getFieldDefault(leafSchema) : undefined;
  const enumOptions = leafSchema ? getEnumOptions(leafSchema) : undefined;
  const meta = leafSchema ? getFieldMeta(leafSchema) : undefined;
  const scopeMismatch =
    (meta?.scope === 'project' && scope !== 'project') ||
    (meta?.scope === 'user' && scope !== 'user');
  const dottedName = field.path.join('.') as FieldPath<Config>;
  const labelText = t(field.label);
  const [savedTick, setSavedTick] = useState(false);
  const savedTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
    },
    [],
  );
  const flashSavedTick = () => {
    setSavedTick(true);
    if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
    savedTickTimerRef.current = setTimeout(() => setSavedTick(false), 1200);
  };
  const runCommit = () => {
    const ok = commitField(dottedName);
    if (ok) flashSavedTick();
    return ok;
  };
  const runCommitIfDirty = () => (form.getFieldState(dottedName).isDirty ? runCommit() : true);
  const reset = () => {
    form.setValue(dottedName, (defaultValue === undefined ? null : defaultValue) as never, {
      shouldDirty: false,
    });
    runCommit();
  };
  return (
    <FormField
      control={form.control}
      name={dottedName}
      render={({ field: ctl }) => {
        const showResetButton =
          !scopeMismatch && (defaultValue !== undefined || ctl.value !== undefined);
        return (
          <FormItem
            className={cn('relative', isFlashed && 'animate-settings-flash')}
            data-field={field.path.join('.')}
            data-scope={scope}
          >
            <div className="flex items-center justify-between gap-2">
              <FormLabel className="text-sm font-medium">{labelText}</FormLabel>
              {showResetButton ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground opacity-60 hover:opacity-100"
                      onClick={reset}
                      aria-label={t`Reset ${labelText} to default`}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <Trans>Reset to default</Trans>
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            {field.description ? (
              <FormDescription className="text-muted-foreground text-1sm">
                {t(field.description)}
              </FormDescription>
            ) : null}
            <div className="flex items-center gap-2">
              <FormControl>
                <FieldControlBody
                  field={field}
                  ctl={ctl}
                  typeTag={typeTag}
                  enumOptions={enumOptions}
                  onCommit={runCommitIfDirty}
                />
              </FormControl>
              <SavedIndicator visible={savedTick} />
            </div>
            <FormMessage data-field-error={field.path.join('.')} />
          </FormItem>
        );
      }}
    />
  );
}

function FieldControlBody({
  field,
  ctl,
  typeTag,
  enumOptions,
  onCommit,
  ...slotForwarded
}: {
  field: SettingsFieldDef;
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  typeTag: string | undefined;
  enumOptions: readonly string[] | undefined;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  const { t } = useLingui();
  const { setTheme } = useTheme();
  if (typeTag === 'boolean')
    return (
      <Switch
        {...slotForwarded}
        checked={Boolean(ctl.value)}
        ref={ctl.ref}
        onCheckedChange={(next) => {
          ctl.onChange(next);
          onCommit();
        }}
        onBlur={ctl.onBlur}
      />
    );
  if (typeTag === 'enum' && enumOptions?.length) {
    if (
      field.control === 'enum-toggle' ||
      (field.control !== 'enum-select' && enumOptions.length <= 4)
    ) {
      const { id: forwardedId, ...wrapperSlotProps } = slotForwarded;
      const isThemeField = field.path[0] === 'appearance' && field.path[1] === 'theme';
      return (
        <ToggleGroup
          {...wrapperSlotProps}
          type="single"
          value={typeof ctl.value === 'string' ? ctl.value : ''}
          ref={ctl.ref}
          onValueChange={(next) => {
            if (!next) return;
            if (isThemeField) setTheme(next);
            ctl.onChange(next);
            onCommit();
          }}
          onBlur={ctl.onBlur}
          variant="segmented"
          size="sm"
          spacing={1}
          className="bg-muted dark:bg-background p-0.5 rounded-lg"
          aria-label={t(field.label)}
        >
          {enumOptions.map((opt, idx) => (
            <ToggleGroupItem
              key={opt}
              value={opt}
              id={idx === 0 ? forwardedId : undefined}
              aria-label={field.formatOption?.(opt, t) ?? opt}
              className="text-1sm capitalize"
            >
              {field.formatOption?.(opt, t) ?? opt}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      );
    }
    return (
      <Select
        value={typeof ctl.value === 'string' ? ctl.value : undefined}
        onValueChange={(next) => {
          ctl.onChange(next);
          onCommit();
        }}
      >
        <SelectTrigger {...slotForwarded} ref={ctl.ref} onBlur={ctl.onBlur} className="max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {enumOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {field.formatOption?.(opt, t) ?? opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (typeTag === 'number' || typeTag === 'int')
    return <NumberControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
  if (typeTag === 'array')
    return <StringArrayControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
  return <StringControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
}

function StringControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  return (
    <Input
      {...slotForwarded}
      value={typeof ctl.value === 'string' ? ctl.value : ''}
      ref={ctl.ref}
      onChange={(event) => ctl.onChange(event.target.value)}
      onBlur={() => {
        ctl.onBlur();
        onCommit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onCommit();
        }
      }}
      className="h-8 text-sm"
    />
  );
}

function NumberControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  const [pendingText, setPendingText] = useState(ctl.value === undefined ? '' : String(ctl.value));
  const lastSyncedValueRef = useRef(ctl.value);
  useEffect(() => {
    if (lastSyncedValueRef.current === ctl.value) return;
    setPendingText(ctl.value === undefined ? '' : String(ctl.value));
    lastSyncedValueRef.current = ctl.value;
  }, [ctl.value]);
  const commitText = () => {
    const parsed = Number(pendingText);
    if (!Number.isFinite(parsed)) {
      ctl.onChange(pendingText as unknown as number);
      onCommit();
      return;
    }
    ctl.onChange(parsed);
    onCommit();
    lastSyncedValueRef.current = parsed as unknown as Config[keyof Config];
  };
  return (
    <Input
      {...slotForwarded}
      type="number"
      value={pendingText}
      ref={ctl.ref}
      onChange={(event) => setPendingText(event.target.value)}
      onBlur={() => {
        ctl.onBlur();
        commitText();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitText();
        }
      }}
      className="h-8 w-28 text-sm tabular-nums"
    />
  );
}

function StringArrayControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  const initial = Array.isArray(ctl.value) ? (ctl.value as string[]).join('\n') : '';
  const [pendingText, setPendingText] = useState(initial);
  const lastSyncedRef = useRef(initial);
  useEffect(() => {
    const incoming = Array.isArray(ctl.value) ? (ctl.value as string[]).join('\n') : '';
    if (incoming === lastSyncedRef.current) return;
    setPendingText(incoming);
    lastSyncedRef.current = incoming;
  }, [ctl.value]);
  const commitText = () => {
    const parsed = pendingText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    ctl.onChange(parsed);
    onCommit();
    lastSyncedRef.current = parsed.join('\n');
  };
  return (
    <textarea
      {...slotForwarded}
      value={pendingText}
      ref={ctl.ref}
      onChange={(event) => setPendingText(event.target.value)}
      onBlur={() => {
        ctl.onBlur();
        commitText();
      }}
      rows={Math.max(2, Math.min(6, pendingText.split('\n').length))}
      className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
    />
  );
}
