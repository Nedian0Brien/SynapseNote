// Derived from agent-chat-framework/src/registry/ai-elements/message.tsx.
// Copyright 2023 Vercel, Inc. Apache-2.0; see licenses/ai-elements-Apache-2.0.txt.
// NOTE(SynapseNote): Retain Message/MessageContent, type roles locally, preserve
// the full-width assistant surface and existing Markdown renderer.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Message({
  from,
  className,
  ...props
}: ComponentProps<'div'> & { from: 'user' | 'assistant' }) {
  return (
    <div
      data-slot="message"
      data-role={from}
      className={cn(
        'group flex w-full min-w-0 max-w-full flex-col gap-2',
        from === 'user' ? 'is-user ml-auto items-end' : 'is-assistant',
        className,
      )}
      {...props}
    />
  );
}

export function MessageContent({
  from,
  className,
  ...props
}: ComponentProps<'article'> & { from: 'user' | 'assistant' }) {
  return (
    <article
      data-slot="message-content"
      className={cn(
        'min-w-0 text-sm leading-relaxed',
        from === 'user'
          ? 'ml-auto w-fit max-w-[88%] overflow-hidden rounded-2xl bg-primary px-3.5 py-2.5 text-primary-foreground'
          : 'w-full max-w-full py-1 text-foreground',
        className,
      )}
      {...props}
    />
  );
}
