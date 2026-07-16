import { Slider as SliderPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  readonly thumbLabel?: string;
  readonly thumbValueText?: string;
  readonly trackClassName?: string;
  readonly rangeClassName?: string;
  readonly thumbClassName?: string;
}

function Slider({
  className,
  thumbLabel,
  thumbValueText,
  trackClassName,
  rangeClassName,
  thumbClassName,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full touch-none select-none items-center data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          'relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted',
          trackClassName,
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn('absolute h-full bg-primary', rangeClassName)}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={thumbLabel}
        aria-valuetext={thumbValueText}
        className={cn(
          'block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm outline-none transition-shadow hover:ring-4 hover:ring-ring/20 focus-visible:ring-4 focus-visible:ring-ring/40 disabled:pointer-events-none',
          thumbClassName,
        )}
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
