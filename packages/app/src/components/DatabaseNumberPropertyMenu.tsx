import { Trans } from '@lingui/react/macro';
import type { DatabaseNumberVisualization, DatabaseProperty } from '@nedian0brien/synapsenote-core';
import {
  DATABASE_CONDITIONAL_COLOR_NAMES,
  databaseNumberVisualization,
} from '@nedian0brien/synapsenote-core';
import { Circle, Hash, Minus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type NumberProperty = Extract<DatabaseProperty, { type: 'number' }>;

const COLOR_CLASSES: Record<DatabaseNumberVisualization['color'], string> = {
  gray: 'bg-gray-500 dark:bg-gray-400',
  brown: 'bg-stone-600 dark:bg-stone-400',
  orange: 'bg-orange-500 dark:bg-orange-400',
  yellow: 'bg-yellow-400 dark:bg-yellow-300',
  green: 'bg-green-500 dark:bg-green-400',
  blue: 'bg-blue-500 dark:bg-blue-400',
  purple: 'bg-purple-500 dark:bg-purple-400',
  pink: 'bg-pink-500 dark:bg-pink-400',
  red: 'bg-red-500 dark:bg-red-400',
};

export interface DatabaseNumberPropertyMenuProps {
  property: NumberProperty;
  disabled: boolean;
  onApply: (property: NumberProperty, visualization: DatabaseNumberVisualization) => void;
}

export function DatabaseNumberPropertyMenu({
  property,
  disabled,
  onApply,
}: DatabaseNumberPropertyMenuProps) {
  const initial = databaseNumberVisualization(property);
  const [style, setStyle] = useState(initial.style);
  const [color, setColor] = useState(initial.color);
  const [denominatorDraft, setDenominatorDraft] = useState(String(initial.denominator));
  const [showValue, setShowValue] = useState(initial.showValue);
  const denominator = Number(denominatorDraft);
  const denominatorValid =
    Number.isFinite(denominator) && denominator > 0 && denominator <= 1_000_000_000_000_000;
  const resolvedDenominator = denominatorValid ? denominator : initial.denominator;

  return (
    <div className="w-80 space-y-3 p-2" data-database-number-property-menu={property.id}>
      <div>
        <p className="font-medium text-sm">
          <Trans>Number display</Trans>
        </p>
        <p className="text-muted-foreground text-xs">
          <Trans>Show values as numbers, bars, or rings in every table view.</Trans>
        </p>
      </div>

      <fieldset className="grid grid-cols-3 gap-1.5">
        <legend className="sr-only">Number display style</legend>
        {(
          [
            { value: 'number', label: 'Number', icon: Hash },
            { value: 'bar', label: 'Bar', icon: Minus },
            { value: 'ring', label: 'Ring', icon: Circle },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            variant="outline"
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border bg-background px-2 py-2 text-xs transition-colors hover:bg-muted/70',
              style === value && 'border-primary ring-1 ring-primary',
            )}
            aria-label={`${label} display`}
            aria-pressed={style === value}
            disabled={disabled}
            onClick={() => setStyle(value)}
          >
            {value === 'number' ? (
              <span className="font-semibold text-base tabular-nums">42</span>
            ) : (
              <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
            )}
            <span>{label}</span>
          </Button>
        ))}
      </fieldset>

      {style !== 'number' ? (
        <div className="space-y-3 rounded-md bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">
              <Trans>Color</Trans>
            </span>
            <fieldset className="flex max-w-48 flex-wrap justify-end gap-1">
              <legend className="sr-only">Progress color</legend>
              {DATABASE_CONDITIONAL_COLOR_NAMES.map((candidate) => (
                <Button
                  key={candidate}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    'flex size-6 items-center justify-center rounded-md hover:bg-muted',
                    color === candidate &&
                      'ring-1 ring-primary ring-offset-1 ring-offset-background',
                  )}
                  aria-label={`${candidate} color`}
                  aria-pressed={color === candidate}
                  disabled={disabled}
                  onClick={() => setColor(candidate)}
                >
                  <span
                    className={cn('size-3.5 rounded-sm', COLOR_CLASSES[candidate])}
                    aria-hidden="true"
                  />
                </Button>
              ))}
            </fieldset>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor={`number-denominator-${property.id}`}>
              <Trans>Divide by</Trans>
            </label>
            <Input
              id={`number-denominator-${property.id}`}
              className="h-8 w-28 text-right tabular-nums"
              type="number"
              min="0.000000000001"
              max="1000000000000000"
              step="any"
              value={denominatorDraft}
              aria-label="Divide by"
              aria-invalid={!denominatorValid}
              disabled={disabled}
              onKeyDown={(event) => event.stopPropagation()}
              onChange={(event) => setDenominatorDraft(event.currentTarget.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor={`number-show-value-${property.id}`}>
              <Trans>Show number</Trans>
            </label>
            <Switch
              id={`number-show-value-${property.id}`}
              checked={showValue}
              disabled={disabled}
              aria-label="Show number"
              onCheckedChange={setShowValue}
            />
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={disabled || (style !== 'number' && !denominatorValid)}
        onClick={() =>
          onApply(property, { style, color, denominator: resolvedDenominator, showValue })
        }
      >
        <Trans>Apply number display</Trans>
      </Button>
    </div>
  );
}
