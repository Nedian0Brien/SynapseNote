import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import {
  databaseNumberVisualization,
  databaseNumberVisualizationProgress,
} from '@nedian0brien/synapsenote-core';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type NumberProperty = Extract<DatabaseProperty, { type: 'number' }>;

const COLOR_CLASSES = {
  gray: 'bg-gray-500 dark:bg-gray-400',
  brown: 'bg-stone-600 dark:bg-stone-400',
  orange: 'bg-orange-500 dark:bg-orange-400',
  yellow: 'bg-yellow-400 dark:bg-yellow-300',
  green: 'bg-green-500 dark:bg-green-400',
  blue: 'bg-blue-500 dark:bg-blue-400',
  purple: 'bg-purple-500 dark:bg-purple-400',
  pink: 'bg-pink-500 dark:bg-pink-400',
  red: 'bg-red-500 dark:bg-red-400',
} as const;

const TEXT_COLOR_CLASSES = {
  gray: 'text-gray-500 dark:text-gray-400',
  brown: 'text-stone-600 dark:text-stone-400',
  orange: 'text-orange-500 dark:text-orange-400',
  yellow: 'text-yellow-400 dark:text-yellow-300',
  green: 'text-green-500 dark:text-green-400',
  blue: 'text-blue-500 dark:text-blue-400',
  purple: 'text-purple-500 dark:text-purple-400',
  pink: 'text-pink-500 dark:text-pink-400',
  red: 'text-red-500 dark:text-red-400',
} as const;

const CANVAS_COLORS: Record<keyof typeof TEXT_COLOR_CLASSES, string> = {
  gray: '#6b7280',
  brown: '#78716c',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  red: '#ef4444',
};

function NumberProgressRing({
  property,
  value,
  formattedValue,
  denominator,
  progress,
  color,
}: {
  property: NumberProperty;
  value: number;
  formattedValue: string;
  denominator: number;
  progress: number;
  color: keyof typeof TEXT_COLOR_CLASSES;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const center = canvas.width / 2;
    const radius = center - 4;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(127, 127, 127, 0.22)';
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.stroke();
    if (progress <= 0) return;
    context.strokeStyle = CANVAS_COLORS[color];
    context.beginPath();
    context.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    context.stroke();
  }, [color, progress]);
  return (
    <span
      role="progressbar"
      aria-label={`${property.name}: ${formattedValue}`}
      aria-valuemin={0}
      aria-valuemax={denominator}
      aria-valuenow={Math.min(Math.max(value, 0), denominator)}
      className={cn('size-5 shrink-0', TEXT_COLOR_CLASSES[color])}
    >
      <canvas
        ref={canvasRef}
        width="40"
        height="40"
        className="size-5"
        data-database-number-progress-ring
      />
    </span>
  );
}

export function DatabaseNumberVisualization({
  property,
  value,
  formattedValue,
}: {
  property: NumberProperty;
  value: number;
  formattedValue: string;
}) {
  const visualization = databaseNumberVisualization(property);
  if (visualization.style === 'number') return <span className="truncate">{formattedValue}</span>;
  const progress = databaseNumberVisualizationProgress(value, visualization.denominator);
  const percent = progress * 100;

  if (visualization.style === 'bar') {
    return (
      <span
        className="flex w-full min-w-0 items-center gap-2"
        data-database-number-visualization="bar"
        data-database-number-progress={String(progress)}
      >
        {visualization.showValue ? (
          <span className="max-w-[45%] shrink-0 truncate font-medium tabular-nums">
            {formattedValue}
          </span>
        ) : null}
        <span
          className="relative h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-muted-foreground/25"
          role="progressbar"
          aria-label={`${property.name}: ${formattedValue}`}
          aria-valuemin={0}
          aria-valuemax={visualization.denominator}
          aria-valuenow={Math.min(Math.max(value, 0), visualization.denominator)}
        >
          <span
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              COLOR_CLASSES[visualization.color],
            )}
            style={{ width: `${percent}%` }}
            data-database-number-progress-fill
          />
        </span>
      </span>
    );
  }

  return (
    <span
      className="flex w-full min-w-0 items-center gap-2"
      data-database-number-visualization="ring"
      data-database-number-progress={String(progress)}
    >
      <NumberProgressRing
        property={property}
        value={value}
        formattedValue={formattedValue}
        denominator={visualization.denominator}
        progress={progress}
        color={visualization.color}
      />
      {visualization.showValue ? (
        <span className="min-w-0 truncate font-medium tabular-nums">{formattedValue}</span>
      ) : null}
    </span>
  );
}
