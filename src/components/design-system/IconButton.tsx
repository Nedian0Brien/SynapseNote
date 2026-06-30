import * as React from 'react';

import { cn } from '@/lib/utils';

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  shape?: 'square' | 'circle';
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'bordered' | 'primary';
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ shape = 'square', size = 'md', variant = 'ghost', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition duration-sn ease-sn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        shape === 'square' && 'rounded-sn-sm',
        shape === 'circle' && 'rounded-sn-full hover:scale-[1.08]',
        size === 'sm' && 'size-8',
        size === 'md' && 'size-10',
        size === 'lg' && 'size-11',
        variant === 'ghost' && 'text-sn-variant hover:bg-sn-primary-dim hover:text-sn-ink',
        variant === 'bordered' &&
          'border border-sn-outline bg-sn-surface text-sn-variant hover:bg-sn-primary-dim hover:text-sn-ink',
        variant === 'primary' && 'bg-sn-primary text-sn-primary-icon hover:opacity-90',
        className
      )}
      {...props}
    />
  )
);

IconButton.displayName = 'IconButton';
