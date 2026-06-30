import * as React from 'react';

import { cn } from '@/lib/utils';

type SurfaceProps<T extends React.ElementType = 'div'> = {
  as?: T;
  variant?: 'flat' | 'raised' | 'floating';
  interactive?: boolean;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as'>;

export function Surface<T extends React.ElementType = 'div'>({
  as,
  variant = 'flat',
  interactive = false,
  className,
  ...props
}: SurfaceProps<T>) {
  const Comp = as || 'div';

  return (
    <Comp
      className={cn(
        'border border-sn-outline bg-sn-surface text-sn-ink',
        variant === 'flat' && 'shadow-none',
        variant === 'raised' && 'shadow-sn-sm',
        variant === 'floating' && 'bg-sn-surface/90 shadow-sn-lg backdrop-blur-xl',
        interactive &&
          'transition duration-sn ease-sn-spring hover:-translate-y-0.5 hover:border-sn-outline hover:shadow-sn-md',
        className
      )}
      {...props}
    />
  );
}
