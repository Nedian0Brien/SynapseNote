import { useLingui } from '@lingui/react/macro';
import { ChevronDownIcon, ZapIcon } from 'lucide-react';
import { type PointerEvent, useRef } from 'react';
import { TargetIcon } from '@/components/handoff/OpenInAgentMenuItem';
import { cliIconTargetId } from '@/components/handoff/terminal-cli-display';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type {
  CliChatEffort,
  CliChatId,
  CliChatModel,
  CliChatModelSettings,
  CliChatSpeed,
} from './cli-chat-types';

interface CliChatModelMenuProps {
  readonly cli: CliChatId;
  readonly value: CliChatModelSettings;
  readonly onValueChange: (value: CliChatModelSettings) => void;
  readonly disabled?: boolean;
  readonly onClose?: () => void;
}

const CODEX_MODELS: readonly CliChatModel[] = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.3-codex-spark',
];
const CLAUDE_MODELS: readonly CliChatModel[] = ['fable', 'opus', 'sonnet'];
const FULL_CODEX_EFFORTS: readonly CliChatEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
];
const CLAUDE_EFFORTS: readonly CliChatEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function codexEfforts(model: CliChatModel): readonly CliChatEffort[] {
  if (model === 'gpt-5.3-codex-spark') return FULL_CODEX_EFFORTS.slice(0, 4);
  if (model === 'gpt-5.6-luna') return FULL_CODEX_EFFORTS.slice(0, 5);
  return FULL_CODEX_EFFORTS;
}

function supportsFast(cli: CliChatId, model: CliChatModel): boolean {
  return cli === 'codex' && model !== 'gpt-5.3-codex-spark';
}

function effortIndex(efforts: readonly CliChatEffort[], effort: CliChatEffort): number {
  const index = efforts.indexOf(effort);
  return index < 0 ? 0 : index;
}

function includesEffort(efforts: readonly CliChatEffort[], effort: CliChatEffort): boolean {
  return efforts.includes(effort);
}

function displayValue(value: CliChatModel | CliChatEffort | CliChatSpeed): string {
  if (value === 'default') return 'Standard';
  if (value === 'xhigh') return 'Extra high';
  if (value === 'ultra') return 'Ultra';
  if (value === 'max') return 'Max';
  if (value === 'fast') return 'Fast';
  if (value === 'low') return 'Low';
  if (value === 'medium') return 'Medium';
  if (value === 'high') return 'High';
  if (value === 'fable') return 'Fable';
  if (value === 'opus') return 'Opus';
  if (value === 'sonnet') return 'Sonnet';
  if (value === 'gpt-5.6-sol') return 'GPT-5.6 Sol';
  if (value === 'gpt-5.6-terra') return 'GPT-5.6 Terra';
  if (value === 'gpt-5.6-luna') return 'GPT-5.6 Luna';
  if (value === 'gpt-5.3-codex-spark') return 'GPT-5.3 Codex Spark';
  return value;
}

export function CliChatModelMenu({
  cli,
  value,
  onValueChange,
  disabled = false,
  onClose,
}: CliChatModelMenuProps) {
  const { t } = useLingui();
  const models = cli === 'codex' ? CODEX_MODELS : CLAUDE_MODELS;
  const efforts = cli === 'codex' ? codexEfforts(value.model) : CLAUDE_EFFORTS;
  const currentEffortIndex = effortIndex(efforts, value.effort);
  const fastAvailable = supportsFast(cli, value.model);
  const modelLabel = displayValue(value.model);
  const effortLabel = displayValue(value.effort);
  const speedLabel = displayValue(value.speed);
  const settingsLabel = fastAvailable
    ? t`Model settings: ${modelLabel}, effort ${effortLabel}, speed ${speedLabel}`
    : t`Model settings: ${modelLabel}, effort ${effortLabel}`;
  const effortInteractionRef = useRef<HTMLDivElement>(null);

  function selectEffortAtPointer(event: PointerEvent<HTMLElement>, fallback: CliChatEffort) {
    const bounds = effortInteractionRef.current?.getBoundingClientRect();
    if (bounds === undefined || bounds.width <= 0) {
      if (fallback !== value.effort) onValueChange({ ...value, effort: fallback });
      return;
    }
    const { left, width } = bounds;
    const position = Math.min(1, Math.max(0, (event.clientX - left) / width));
    const index = Math.round(position * (efforts.length - 1));
    const effort = efforts[index];
    if (effort !== undefined && effort !== value.effort) onValueChange({ ...value, effort });
  }

  function selectModel(model: CliChatModel) {
    const nextEfforts = cli === 'codex' ? codexEfforts(model) : CLAUDE_EFFORTS;
    onValueChange({
      model,
      effort: includesEffort(nextEfforts, value.effort) ? value.effort : 'medium',
      speed: supportsFast(cli, model) ? value.speed : 'default',
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 min-w-0 max-w-60 gap-1 px-2 text-muted-foreground"
          disabled={disabled}
          aria-label={settingsLabel}
        >
          <TargetIcon id={cliIconTargetId(cli)} aria-hidden="true" data-chat-provider-icon={cli} />
          <span className="truncate">{modelLabel}</span>
          <span aria-hidden="true" className="shrink-0 text-border">
            ·
          </span>
          <span className="shrink-0 text-xs">{effortLabel}</span>
          {fastAvailable ? (
            <ZapIcon
              aria-hidden="true"
              className={cn(
                'ml-0.5 size-3.5 shrink-0 transition-colors',
                value.speed === 'fast'
                  ? 'fill-primary/25 text-primary'
                  : 'text-muted-foreground/35',
              )}
            />
          ) : null}
          <ChevronDownIcon aria-hidden="true" className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClose?.();
        }}
      >
        <DropdownMenuLabel>{t`Model settings`}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value.model}
          onValueChange={(model) => selectModel(model as CliChatModel)}
        >
          {models.map((model) => (
            <DropdownMenuRadioItem
              key={model}
              value={model}
              onSelect={(event) => event.preventDefault()}
            >
              {displayValue(model)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <div className="my-1 h-px bg-border" />
        <fieldset className="px-2 py-2" onKeyDown={(event) => event.stopPropagation()}>
          <legend className="sr-only">{t`Effort setting`}</legend>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-medium">{t`Effort`}</span>
            <span className="text-xs text-muted-foreground">{displayValue(value.effort)}</span>
          </div>
          <TooltipProvider delayDuration={150}>
            <div className="relative h-11">
              <Slider
                className="pointer-events-none absolute inset-x-0 top-0 py-1.5 [&>span:last-child]:transition-[left,right] [&>span:last-child]:duration-200 [&>span:last-child]:ease-out motion-reduce:[&>span:last-child]:transition-none"
                trackClassName="h-3"
                rangeClassName="transition-[left,right] duration-200 ease-out motion-reduce:transition-none"
                thumbClassName="size-5"
                thumbLabel={t`Effort`}
                thumbValueText={displayValue(value.effort)}
                min={0}
                max={efforts.length - 1}
                step={1}
                value={[currentEffortIndex]}
                onValueChange={([index]) => {
                  const effort = efforts[index];
                  if (effort !== undefined) onValueChange({ ...value, effort });
                }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-2 top-3 flex -translate-y-1/2 justify-between"
              >
                {efforts.map((effort, index) => (
                  <span
                    key={effort}
                    className={cn(
                      'size-1 rounded-full ring-1 ring-background',
                      index <= currentEffortIndex ? 'bg-primary-foreground' : 'bg-muted-foreground',
                    )}
                  />
                ))}
              </div>
              <div
                ref={effortInteractionRef}
                className="absolute inset-x-2 top-0 h-11 overflow-hidden"
              >
                {efforts.map((effort, index) => {
                  const label = displayValue(effort);
                  const stepWidth = 100 / (efforts.length - 1);
                  return (
                    <Tooltip key={effort}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="link-muted"
                          size="sm"
                          className="group absolute top-0 z-10 h-11 min-w-0 rounded-none border-transparent bg-transparent px-0 text-inherit shadow-none hover:bg-transparent hover:text-inherit focus-visible:border-transparent focus-visible:ring-0 focus-visible:[&>span]:h-2.5 focus-visible:[&>span]:w-0.5 focus-visible:[&>span]:bg-foreground active:translate-y-0"
                          style={{
                            left: `${(index - 0.5) * stepWidth}%`,
                            width: `${stepWidth}%`,
                          }}
                          aria-label={t`Effort: ${label}`}
                          aria-pressed={index === currentEffortIndex}
                          onClick={() => onValueChange({ ...value, effort })}
                          onPointerDown={(event) => selectEffortAtPointer(event, effort)}
                          onPointerMove={(event) => {
                            if (event.buttons !== 0) selectEffortAtPointer(event, effort);
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute bottom-1 h-1.5 w-px rounded-full bg-muted-foreground/45 transition-all group-hover:h-2.5 group-hover:bg-foreground',
                              index === currentEffortIndex && 'h-2.5 w-0.5 bg-primary',
                            )}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={4}>
                        {label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </TooltipProvider>
        </fieldset>
        {fastAvailable ? (
          <>
            <div className="my-1 h-px bg-border" />
            <div className="flex items-center justify-between gap-3 px-2 py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{t`Speed`}</span>
                <span className="text-xs text-muted-foreground">{t`1.5× faster`}</span>
              </span>
              <Toggle
                variant="outline"
                size="sm"
                className="min-w-20 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
                pressed={value.speed === 'fast'}
                onPressedChange={(pressed) =>
                  onValueChange({ ...value, speed: pressed ? 'fast' : 'default' })
                }
                aria-label={value.speed === 'fast' ? t`Fast speed: On` : t`Fast speed: Off`}
              >
                <ZapIcon
                  aria-hidden="true"
                  className={value.speed === 'fast' ? 'fill-current' : undefined}
                />
                {value.speed === 'fast' ? t`Fast on` : t`Fast`}
              </Toggle>
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
