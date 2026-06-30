import * as React from 'react';

import { Button as BaseButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SynapseButtonProps = React.ComponentProps<typeof BaseButton> & {
  tone?: 'primary' | 'secondary' | 'ghost';
  icon?: React.ReactNode;
};

export const Button = React.forwardRef<HTMLButtonElement, SynapseButtonProps>(
  ({ tone = 'primary', icon, className, children, ...props }, ref) => (
    <BaseButton
      ref={ref}
      className={cn(
        'rounded-sn-full px-4 font-medium transition duration-sn ease-sn',
        tone === 'primary' && 'bg-sn-primary text-sn-primary-icon hover:opacity-90',
        tone === 'secondary' &&
          'border border-sn-outline bg-sn-surface text-sn-ink hover:bg-sn-surface-low hover:text-sn-ink',
        tone === 'ghost' && 'bg-transparent text-sn-variant hover:bg-sn-primary-dim hover:text-sn-ink',
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </BaseButton>
  )
);

Button.displayName = 'Button';
