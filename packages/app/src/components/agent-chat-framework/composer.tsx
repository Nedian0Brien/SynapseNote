// Derived from agent-chat-framework/src/registry/assistant-ui/elements/composer.tsx.
// Copyright (c) 2025 AgentbaseAI Inc. MIT; see licenses/assistant-ui-MIT.txt.
// NOTE(SynapseNote): Retain consumed exports; use semantic tokens, existing
// shadcn controls and a multiline textarea. Submission remains owned by the form.
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function Composer({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="composer" className={cn('relative w-full', className)} {...props} />;
}

export function ComposerBar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="composer-bar"
      className={cn(
        'flex w-full flex-col gap-2 overflow-hidden rounded-3xl border border-input bg-background p-2.5 shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}

export function ComposerInput({ className, ...props }: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      data-slot="composer-input"
      className={cn(
        'max-h-40 min-h-12 resize-none border-0 bg-transparent px-2 py-1 shadow-none focus-visible:ring-0',
        className,
      )}
      {...props}
    />
  );
}

export function ComposerToolbar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="composer-toolbar"
      className={cn('flex items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export function ComposerActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="composer-actions"
      className={cn('flex min-w-0 items-center gap-1', className)}
      {...props}
    />
  );
}

export function ComposerSend({
  streaming,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & { streaming: boolean }) {
  return (
    <Button
      type="button"
      size="icon"
      data-slot="composer-send"
      className={cn('grid shrink-0 place-items-center rounded-full', className)}
      {...props}
    >
      <ArrowUpIcon
        aria-hidden="true"
        className={cn(
          '[grid-area:1/1] transition-[opacity,scale] duration-200 motion-reduce:transition-none',
          streaming ? 'scale-50 opacity-0' : 'scale-100 opacity-100',
        )}
      />
      <SquareIcon
        aria-hidden="true"
        className={cn(
          '[grid-area:1/1] fill-current transition-[opacity,scale] duration-200 motion-reduce:transition-none',
          streaming ? 'scale-75 opacity-100' : 'scale-50 opacity-0',
        )}
      />
    </Button>
  );
}
