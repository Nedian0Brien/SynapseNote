import { Trans, useLingui } from '@lingui/react/macro';
import { TERMINAL_CLIS, type TerminalCli } from '@nedian0brien/synapsenote-core';
import { CheckIcon, PlusIcon, SquareTerminalIcon } from 'lucide-react';
import { TargetIcon } from '@/components/handoff/OpenInAgentMenuItem';
import { cliIconTargetId, VISIBLE_CLIS } from '@/components/handoff/terminal-cli-display';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** The New-tab menu's current pick: a CLI, or a bare shell ("terminal"). */
export type TerminalNewTabChoice = TerminalCli | 'terminal';

interface TerminalNewChatButtonProps {
  /** The current pick — a CLI (resolved from the sticky pick + installed set, the
   *  same default logic the Ask-AI surfaces use) or `'terminal'` (a bare shell).
   *  Drives the dropdown checkmark. */
  readonly selected: TerminalNewTabChoice;
  /** Dropdown CLI row — make `cli` the new default (persist, like the Ask-AI
   *  picker) AND open a new tab running it. */
  readonly onPickCli: (cli: TerminalCli) => void;
  /** Dropdown "Terminal" row — make a bare shell the new default (persist,
   *  terminal-only) AND open a new bare-shell tab. */
  readonly onPickTerminal: () => void;
  /** The CLIs to list — already gated by the host via {@link visibleTerminalClis}
   *  (Claude plus CLIs the probe hasn't ruled out, and always the current pick),
   *  so a CLI that's been probed absent doesn't appear. This is a presentational
   *  component: it renders the list as given. Falls back to the full
   *  {@link VISIBLE_CLIS} only for callers/tests that don't pass a gated list. */
  readonly visibleClis?: readonly TerminalCli[];
  readonly className?: string;
}

/**
 * The docked terminal's single "new tab" control. The plus button opens a menu
 * listing every available CLI plus a bare Terminal option. Picking one makes it
 * the new default and opens a tab in it. The pick sticks: CLI picks via the shared
 * Ask-AI store, the bare-terminal pick via a terminal-only flag.
 */
export function TerminalNewChatButton({
  selected,
  onPickCli,
  onPickTerminal,
  visibleClis = VISIBLE_CLIS,
  className,
}: TerminalNewChatButtonProps) {
  const { t } = useLingui();
  const isTerminal = selected === 'terminal';
  return (
    <div className={cn('flex shrink-0 items-center', className)}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t`New chat`}
                data-testid="terminal-new-chat"
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <PlusIcon aria-hidden="true" className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            <Trans>New chat</Trans>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          <DropdownMenuLabel>
            <Trans>New chat</Trans>
          </DropdownMenuLabel>
          {visibleClis.map((cli) => {
            const { displayName: name } = TERMINAL_CLIS[cli];
            return (
              <DropdownMenuItem
                key={cli}
                onSelect={() => onPickCli(cli)}
                data-testid={`terminal-new-chat-cli-${cli}`}
                // The accessible name carries "<name> CLI" so it is distinct and
                // unambiguous (matches the Ask-AI Terminal rows, WCAG 2.5.3).
                aria-label={t`${name} CLI`}
                // Surface the current pick to assistive tech (the CheckIcon is
                // aria-hidden). `aria-current` over menuitemradio: each row both
                // selects a default AND launches, so radio semantics overstate the
                // selection aspect (WCAG 1.3.1).
                aria-current={selected === cli ? 'true' : undefined}
              >
                <TargetIcon id={cliIconTargetId(cli)} className="size-4" aria-hidden="true" />
                <span className="flex-1">{name}</span>
                {selected === cli ? (
                  <CheckIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onPickTerminal}
            data-testid="terminal-new-chat-terminal"
            aria-current={isTerminal ? 'true' : undefined}
          >
            <SquareTerminalIcon aria-hidden="true" className="size-4" />
            <span className="flex-1">
              <Trans>Terminal</Trans>
            </span>
            {isTerminal ? (
              <CheckIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            ) : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
