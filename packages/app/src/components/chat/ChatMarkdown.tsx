import { isValidElement, lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { dispatchChatFileLinkClick } from './chat-file-links';
import { normalizeChatMath } from './chat-math';

interface ChatMarkdownProps {
  readonly text: string;
  readonly bridge: OkDesktopBridge;
}

const ChatKatex = lazy(async () => {
  const { default: katex } = await import('katex');

  function ChatKatexInner(props: { formula: string; display: boolean }) {
    const html = katex.renderToString(props.formula, {
      displayMode: props.display,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
    return (
      <span
        data-chat-math={props.display ? 'display' : 'inline'}
        className={props.display ? 'my-2 block max-w-full overflow-x-auto py-1' : 'inline'}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX emits allowlisted markup with trust disabled; renderToString is its documented React integration.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return { default: ChatKatexInner };
});

function ChatMath(props: { formula: string; display: boolean }) {
  return (
    <Suspense
      fallback={
        <code data-chat-math-loading={props.display ? 'display' : 'inline'}>{props.formula}</code>
      }
    >
      <ChatKatex {...props} />
    </Suspense>
  );
}

function isDisplayMathElement(value: unknown): boolean {
  if (!isValidElement<{ className?: string }>(value)) return false;
  return value.props.className?.split(' ').includes('math-display') ?? false;
}

export function ChatMarkdown({ text, bridge }: ChatMarkdownProps) {
  const markdown = normalizeChatMath(text);
  return (
    <div
      data-chat-markdown="true"
      className="min-w-0 max-w-full [overflow-wrap:anywhere] [&_a]:break-all [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-2 [&_blockquote]:border-border [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:break-all [&_code]:rounded [&_code]:bg-foreground/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:font-semibold [&_h1]:text-base [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:font-semibold [&_h2]:text-sm [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold [&_hr]:my-3 [&_hr]:border-border [&_img]:max-w-full [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-2 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-foreground/5 [&_pre]:p-3 [&_pre_code]:break-normal [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:whitespace-pre [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-foreground/5 [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0 [&>:last-child]:mb-0"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        skipHtml
        components={{
          a: ({ href, onClick, ...props }) => (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                if (dispatchChatFileLinkClick(event, href, bridge)) return;
                onClick?.(event);
              }}
            />
          ),
          code: ({ className, children, ...props }) => {
            const formula = String(children).replace(/\n$/, '');
            if (className?.split(' ').includes('math-inline')) {
              return <ChatMath formula={formula} display={false} />;
            }
            if (className?.split(' ').includes('math-display')) {
              return <ChatMath formula={formula} display />;
            }
            return (
              <code {...props} className={className}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) =>
            isDisplayMathElement(children) ? children : <pre {...props}>{children}</pre>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
