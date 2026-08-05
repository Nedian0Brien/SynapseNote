import { useLingui } from '@lingui/react/macro';
import { ExternalLinkIcon, Globe2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { OkDesktopBridge, OkWebPreviewMetadata } from '@/lib/desktop-bridge-types';
import type { WebPreviewLink } from './web-preview-links';

export function WebPreviewCards({
  links,
  bridge,
  showHeading = true,
}: {
  readonly links: readonly WebPreviewLink[];
  readonly bridge: OkDesktopBridge;
  readonly showHeading?: boolean;
}) {
  const { t } = useLingui();
  const linkUrls = links.map((link) => link.url).join('\n');
  const [metadataByUrl, setMetadataByUrl] = useState<
    Readonly<Record<string, OkWebPreviewMetadata | null>>
  >({});

  useEffect(() => {
    let cancelled = false;
    for (const url of linkUrls.split('\n').filter(Boolean)) {
      void bridge.shell
        .fetchWebPreview(url)
        .then((metadata) => {
          if (!cancelled) setMetadataByUrl((current) => ({ ...current, [url]: metadata }));
        })
        .catch(() => {
          if (!cancelled) setMetadataByUrl((current) => ({ ...current, [url]: null }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [bridge, linkUrls]);

  if (links.length === 0) return null;

  return (
    <section aria-label={t`Web sources`} data-chat-web-previews="true" className="w-full px-1 pt-1">
      {showHeading ? (
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t`Sources`}
        </div>
      ) : null}
      <div className="grid gap-2">
        {links.map((link) => {
          const metadata = metadataByUrl[link.url];
          const title = metadata?.title ?? link.title;
          const description = metadata?.description;
          return (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              aria-label={t`Open ${link.title}`}
              data-chat-web-preview="true"
              data-chat-web-preview-layout="compact"
              className="group flex min-h-20 min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {metadata === undefined ? (
                <span
                  data-chat-web-preview-loading="true"
                  className="block w-20 shrink-0 animate-pulse bg-muted motion-reduce:animate-none"
                />
              ) : metadata?.imageDataUrl ? (
                <span className="block w-20 shrink-0 overflow-hidden bg-muted">
                  <img
                    data-chat-web-preview-image="true"
                    src={metadata.imageDataUrl}
                    alt=""
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
                  />
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center overflow-hidden text-muted-foreground">
                  {metadata?.faviconDataUrl ? (
                    <img src={metadata.faviconDataUrl} alt="" className="size-4 object-contain" />
                  ) : (
                    <Globe2Icon aria-hidden="true" className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs font-semibold leading-snug" title={title}>
                    {title}
                  </span>
                  {description ? (
                    <span className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">
                      {description}
                    </span>
                  ) : null}
                  <span className="mt-1 block truncate text-[10px] font-medium text-muted-foreground">
                    {metadata?.siteName ? `${metadata.siteName} · ` : ''}
                    {link.location}
                  </span>
                </span>
                <ExternalLinkIcon
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                />
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
