import { useLingui } from '@lingui/react/macro';
import { ChevronDownIcon, FileTextIcon, Globe2Icon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { dispatchChatFileLinkClick } from './chat-file-links';
import type { ChatSource } from './chat-sources';
import { WebPreviewCards } from './WebPreviewCards';
import { extractWebPreviewLinks } from './web-preview-links';

export function ChatSourceExplorer({
  sources,
  bridge,
}: {
  readonly sources: readonly ChatSource[];
  readonly bridge: OkDesktopBridge;
}) {
  const { t } = useLingui();
  if (sources.length === 0) return null;
  const webLinks = extractWebPreviewLinks(
    sources
      .filter((source) => source.kind === 'web' && source.href !== undefined)
      .map((source) => `[${source.label}](${source.href})`)
      .join('\n'),
  );
  const compactSources = sources.filter((source) => source.kind !== 'web');

  return (
    <details
      data-chat-source-explorer="true"
      className="group w-full overflow-hidden rounded-xl border border-border/80 bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Globe2Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <span className="flex-1">{t`Sources ${sources.length}`}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-border/70 px-2 pb-2 pt-1">
        {compactSources.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {compactSources.map((source) => {
              const Icon = source.kind === 'file' ? FileTextIcon : SearchIcon;
              const content = (
                <>
                  <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{source.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {source.location}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={source.key}>
                  {source.kind === 'file' && source.href !== undefined ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start whitespace-normal px-2 py-2 text-left text-xs"
                      onClick={() =>
                        dispatchChatFileLinkClick({ preventDefault() {} }, source.href, bridge)
                      }
                    >
                      {content}
                    </Button>
                  ) : (
                    <div className="flex items-start gap-2 px-2 py-2 text-xs text-muted-foreground">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        <WebPreviewCards links={webLinks} bridge={bridge} showHeading={false} />
      </div>
    </details>
  );
}
