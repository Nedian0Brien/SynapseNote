import { DownloadIcon } from 'lucide-react';
import type { DownloadCta } from '@/lib/site';
import { downloadRouteForCta } from '@/lib/site';

type DownloadButtonProps = {
  /** Defaults to the tracked stable-download route (fires `dmg_downloaded`). */
  href?: string;
  label?: string;
  /** CTA slug reported as `utm_content` on `dmg_downloaded`. */
  cta?: DownloadCta;
};

export function DownloadButton({
  href,
  label = 'DOWNLOAD FOR MAC',
  cta = 'docs-content',
}: DownloadButtonProps) {
  // Raw <a>, not next/link: the download route is a 302 redirect handler, so
  // next/link would prefetch it (firing the redirect) and double-fetch on click.
  // rel intentionally omits `noreferrer`: the Referer carries the originating
  // page, which is how the download event attributes to a docs page instead
  // of counting as direct traffic.
  return (
    <a
      href={href ?? downloadRouteForCta(cta)}
      target="_blank"
      rel="noopener"
      className="not-prose my-4 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900"
    >
      {label}
      <DownloadIcon className="size-4" aria-hidden="true" />
    </a>
  );
}
