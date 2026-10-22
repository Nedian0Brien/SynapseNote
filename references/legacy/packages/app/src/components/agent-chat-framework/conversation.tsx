// Derived from agent-chat-framework/src/registry/ai-elements/conversation.tsx.
// Copyright 2023 Vercel, Inc. Apache-2.0; see licenses/ai-elements-Apache-2.0.txt.
// NOTE(SynapseNote): Retain consumed exports; suspend inactive tabs, preserve
// manual scroll position, and use instant scrolling for reduced-motion safety.
import { ArrowDownIcon } from 'lucide-react';
import { type ComponentProps, useLayoutEffect, useRef } from 'react';
import { StickToBottom, useStickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Conversation({
  isActive,
  className,
  ...props
}: ComponentProps<typeof StickToBottom> & { isActive: boolean }) {
  const activeRef = useRef(isActive);
  useLayoutEffect(() => {
    activeRef.current = isActive;
  }, [isActive]);
  const instance = useStickToBottom({
    initial: isActive ? 'instant' : false,
    resize: 'instant',
    targetScrollTop: (target, { scrollElement }) =>
      activeRef.current ? target : scrollElement.scrollTop,
  });
  const { scrollToBottom, stopScroll, scrollRef, contentRef, state } = instance;
  const positionRef = useRef({ top: 0, follow: true });
  useLayoutEffect(() => {
    if (!isActive) {
      stopScroll();
      state.resizeObserver?.disconnect();
      return;
    }
    const position = positionRef.current;
    if (scrollRef.current) scrollRef.current.scrollTop = position.top;
    if (position.follow) void scrollToBottom('instant');
    else stopScroll();
    if (contentRef.current) state.resizeObserver?.observe(contentRef.current);
  }, [isActive, scrollToBottom, stopScroll, scrollRef, contentRef, state]);
  return (
    <StickToBottom
      instance={instance}
      data-slot="conversation"
      onScrollCapture={(event) => {
        const scroll = scrollRef.current;
        if (
          !activeRef.current ||
          scroll === null ||
          event.target !== scroll ||
          scroll.clientHeight === 0
        )
          return;
        positionRef.current = {
          top: scroll.scrollTop,
          follow: scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 5,
        };
      }}
      className={cn('relative min-h-0 min-w-0 max-w-full flex-1 overflow-hidden', className)}
      {...props}
    />
  );
}

export function ConversationContent({
  className,
  ...props
}: ComponentProps<typeof StickToBottom.Content>) {
  return (
    <StickToBottom.Content
      scrollClassName="min-h-0 overflow-x-hidden"
      className={cn('mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3 px-4 py-5', className)}
      {...props}
    />
  );
}

export function ConversationScrollButton(props: ComponentProps<typeof Button>) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
      onClick={() => void scrollToBottom('instant')}
      {...props}
    >
      <ArrowDownIcon aria-hidden="true" />
    </Button>
  );
}
