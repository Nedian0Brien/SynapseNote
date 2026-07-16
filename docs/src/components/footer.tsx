import Link from 'next/link';
import { GitHubIcon } from '@/components/icons/github';
import { BRAND_ROUTE } from '@/lib/brand-assets';
import { GITHUB_URL, SITE_URL } from '@/lib/site';
import { DotTexture } from './dot-texture';

const socialLinks = [{ href: GITHUB_URL, label: 'GitHub', Icon: GitHubIcon }];

const legalLinks = [
  { href: BRAND_ROUTE, label: 'Brand', external: false },
  { href: `${GITHUB_URL}/blob/main/LICENSE`, label: 'License', external: true },
];

export function SiteFooter() {
  return (
    <footer className="relative space-y-16 overflow-hidden px-6 py-10">
      <DotTexture variant="left" className="bottom-0 left-0 w-32 sm:w-60 lg:w-96" />
      <div className="container relative z-10 mx-auto mt-8 grid grid-cols-1 items-center gap-6 min-[24rem]:grid-cols-[auto_auto] min-[24rem]:justify-between sm:grid-cols-3 sm:justify-normal">
        <div className="flex items-center justify-center gap-5 min-[24rem]:justify-start">
          {socialLinks.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={label}
              className="rounded-sm text-slide-muted/60 outline-none transition-colors hover:text-slide-text focus-visible:ring-2 focus-visible:ring-slide-accent focus-visible:ring-offset-2"
            >
              <Icon className="size-5" />
            </Link>
          ))}
        </div>
        <Link
          href={SITE_URL}
          aria-label="SynapseNote"
          className="order-first flex items-center gap-1.5 justify-self-center rounded-sm text-sm font-medium text-slide-muted/60 outline-none transition-colors min-[24rem]:col-span-2 sm:order-0 sm:col-span-1 hover:text-slide-text focus-visible:ring-2 focus-visible:ring-slide-accent focus-visible:ring-offset-2"
        >
          <span>SynapseNote</span>
        </Link>
        <div className="flex items-center justify-center gap-6 text-sm text-slide-muted min-[24rem]:justify-end">
          {legalLinks.map(({ href, label, external }) => (
            <Link
              key={href}
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer' : undefined}
              className="rounded-sm outline-none transition-colors hover:text-slide-text focus-visible:ring-2 focus-visible:ring-slide-accent focus-visible:ring-offset-2"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
