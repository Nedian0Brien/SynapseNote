import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const avatarVariants = cva('relative flex aspect-square shrink-0 overflow-hidden', {
  variants: {
    shape: {
      circle: 'rounded-full',
      square: 'rounded-200',
    },
    variant: {
      default: 'bg-transparent',
      outline: 'border-[1.5px] bg-transparent border-border-primary',
    },
    size: {
      sm: 'h-6 text-xs leading-[16px] text-icon-primary font-normal',
      md: 'h-8 text-sm font-normal',
      xl: 'h-20 text-2xl font-normal',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
    shape: 'circle',
  },
});

function Avatar({
  className,
  size,
  variant,
  shape = 'circle',
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & VariantProps<typeof avatarVariants>) {
  return (
    <AvatarPrimitive.Root
      data-slot='avatar'
      className={cn(
        avatarVariants({
          size,
          variant,
          shape,
        }),
        className
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image data-slot='avatar-image' className={cn('aspect-square size-full', className)} {...props} />
  );
}

// return a number between 0 and 19
function hashUsername(username: string) {
  let hash = 0;

  for (let i = 0; i < username.length; i++) {
    const char = username.charCodeAt(i);

    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash) % 20;
}

function getFallbackColor(username: string) {
  const hash = hashUsername(username) + 1;

  return {
    backgroundColor: `var(--badge-color-${hash}-light-2)`,
    color: `var(--badge-color-${hash}-thick-3)`,
  };
}

function AvatarFallback({ className, children, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  const isString = typeof children === 'string';
  const char = isString ? children.charAt(0).toUpperCase() : '';
  const { backgroundColor, color } = getFallbackColor(isString ? children : '');

  return (
    <AvatarPrimitive.Fallback
      data-slot='avatar-fallback'
      className={cn('flex h-full w-full items-center justify-center text-icon-primary', className)}
      style={{
        backgroundColor,
        color,
      }}
      {...props}
    >
      {!isString ? children : char}
    </AvatarPrimitive.Fallback>
  );
}

export { Avatar, AvatarImage, AvatarFallback };
