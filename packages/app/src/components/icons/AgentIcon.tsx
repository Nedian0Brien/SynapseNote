import { AGENT_ICON_COLORS, AGENT_ICON_COLORS_DARK } from '@nedian0brien/synapsenote-core';
import { type LucideProps, Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { CSSProperties, SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { ClaudeIcon } from './claude';
import { ClineIcon } from './cline';
import { CodexIcon } from './codex';
import { CopilotIcon } from './copilot';
import { CursorIcon } from './cursor';
import { WindsurfIcon } from './windsurf';

/** Icon identifier for a native CLI, in the same space as `iconFromClientName`
 *  — Codex is OpenAI's mark, so the CLI id and the brand id differ. */
export function agentIconForCli(cli: 'codex' | 'claude'): string {
  return cli === 'claude' ? 'claude' : 'openai';
}

interface AgentIconProps extends SVGProps<SVGSVGElement> {
  readonly icon?: string;
  /**
   * Paint the mark in the agent's brand color instead of inheriting the
   * surrounding text color. The color rides on a custom property applied with
   * `!important` because menu and sidebar rows cascade their own `color` to
   * every descendant on hover/active — an inline `color` on the `<svg>` loses
   * to that cascade once it reaches the inner `<path fill="currentColor">`.
   */
  readonly brand?: boolean;
}

/** Map `icon` identifier (from `iconFromClientName`) to its SVG component. Unknown agents fall back to Sparkles. */
export function AgentIcon({ icon, brand = false, className, style, ...rest }: AgentIconProps) {
  const { resolvedTheme } = useTheme();
  const brandColor =
    brand && icon !== undefined
      ? ((resolvedTheme === 'dark' ? AGENT_ICON_COLORS_DARK[icon] : undefined) ??
        AGENT_ICON_COLORS[icon])
      : undefined;
  const props: SVGProps<SVGSVGElement> = {
    className: cn(brandColor && '[&_*]:![color:var(--ok-brand-color)]', className),
    style:
      brandColor === undefined
        ? style
        : ({ ...style, color: brandColor, '--ok-brand-color': brandColor } as CSSProperties),
    ...rest,
  };
  if (icon === 'claude') return <ClaudeIcon {...props} />;
  if (icon === 'cursor') return <CursorIcon {...props} />;
  if (icon === 'windsurf') return <WindsurfIcon {...props} />;
  if (icon === 'openai') return <CodexIcon {...props} />;
  if (icon === 'cline') return <ClineIcon {...props} />;
  if (icon === 'github') return <CopilotIcon {...props} />;
  return <Sparkles strokeWidth={1.5} {...(props as LucideProps)} />;
}
