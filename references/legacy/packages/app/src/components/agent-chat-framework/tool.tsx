// Derived from agent-chat-framework/src/registry/ai-elements/tool.tsx.
// Copyright 2023 Vercel, Inc. Apache-2.0; see licenses/ai-elements-Apache-2.0.txt.
// NOTE(SynapseNote): Retain Tool/Header/Content; use existing Radix controls,
// caller-provided status/labels and text output instead of AI SDK types.
import { ChevronDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export function Tool({ className, ...props }: ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="tool"
      className={cn('not-prose w-full min-w-0 rounded-xl border border-border', className)}
      {...props}
    />
  );
}

export function ToolHeader({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="tool-header"
      className={cn(
        'group flex w-full min-w-0 items-start gap-2 rounded-xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon
        aria-hidden="true"
        className="ml-auto mt-0.5 size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
      />
    </CollapsibleTrigger>
  );
}

export function ToolContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-content"
      className={cn('min-w-0 overflow-hidden px-3 pb-3', className)}
      {...props}
    />
  );
}
