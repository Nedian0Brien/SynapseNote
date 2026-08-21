/**
 * Bookmark — DIY renderer for the `Bookmark` canonical.
 *
 * A link-preview card: title + summary on the left, site icon and
 * hostname on the footer row, optional thumbnail on the right. The
 * paste-format menu mints one of these when the author picks
 * "Bookmark" for a pasted URL, and the slash menu offers it directly.
 *
 * ── Card, not a row ──────────────────────────────────────────────────────
 *
 * `File` deliberately renders as a light inline row because a stack of
 * attachments should read as a list. A bookmark is the opposite: the
 * point of choosing it over a plain link is to spend vertical space on
 * the destination's own title, summary, and image. So this one IS a
 * bordered card — the same weight Notion / Obsidian / Linear give a
 * bookmarked link.
 *
 * ── Metadata comes from props, not from a fetch ──────────────────────────
 *
 * `title` / `description` / `image` / `favicon` are captured once, at
 * the moment the bookmark is created, and persisted into the document
 * (see `bookmarkProps` in `packages/core/src/registry/built-ins.ts`).
 * The card therefore paints its text with zero network requests and
 * stays readable offline or in an export. The two image props are the
 * only remote loads, and both degrade to their icon/no-image fallback
 * when the host is unreachable.
 *
 * Privacy note: rendering a remote `image` / `favicon` discloses the
 * reader's IP to that host on every document open — the standard
 * tradeoff for a thumbnail that isn't inlined as base64. `referrerPolicy
 * ="no-referrer"` at least withholds the referring URL.
 *
 * ── Fallbacks ────────────────────────────────────────────────────────────
 *
 * Every optional prop has a graceful absence:
 *   - no `title`       → the location carries the card, footer drops to
 *                        the bare hostname so nothing is printed twice
 *   - no `description` → the summary line is omitted, card shrinks
 *   - no/broken `image`→ thumbnail area is dropped, text spans the card
 *   - no/broken `favicon` → a `Globe` glyph stands in
 *
 * ── Click ────────────────────────────────────────────────────────────────
 *
 * Mirrors `File`: the anchor is the substrate (right-click → Copy Link
 * Address, screen-reader "link" announcement), but the click is driven
 * imperatively through `openExternalUrl` so the URL lands in the OS
 * browser under Electron rather than in an in-app BrowserWindow.
 * `stopPropagation` keeps the same click from also landing a
 * NodeSelection on the wrapper.
 */

import { Globe } from 'lucide-react';
import { useState } from 'react';
import { openExternalUrl } from '@/lib/external-link';
import { isSafeNavigationUrl } from '../safe-navigation-url.ts';

interface BookmarkProps {
  src?: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

/**
 * Display host + path for the footer line: `example.com/docs/intro`.
 * Strips `www.`, the scheme, the query, and a lone trailing slash so the
 * line reads as a location rather than a URL. Falls back to the raw
 * string when the value doesn't parse (an author can type anything into
 * the prop panel).
 *
 * Pure — exported for unit tests.
 */
export function bookmarkLocation(src: string | undefined): string {
  if (!src) return '';
  try {
    const url = new URL(src);
    const host = url.hostname.replace(/^www\./i, '');
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${host}${path}`;
  } catch {
    return src;
  }
}

/**
 * Bare hostname for the footer line. Used when the headline already IS the
 * location — repeating the full path under it reads as a rendering bug.
 *
 * Pure — exported for unit tests.
 */
export function bookmarkHost(src: string | undefined): string {
  if (!src) return '';
  try {
    return new URL(src).hostname.replace(/^www\./i, '');
  } catch {
    return src;
  }
}

/** Only `http(s)` bookmarks render as an openable link. */
function isBookmarkableUrl(src: string | undefined): src is string {
  if (!src) return false;
  try {
    const { protocol } = new URL(src);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * DIY Bookmark. Descriptor-dispatched via `componentMap['Bookmark']`.
 */
export function Bookmark(props: BookmarkProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const [faviconBroken, setFaviconBroken] = useState(false);

  const location = bookmarkLocation(props.src);
  // Narrowed once into a local so the click handler and the `href` share
  // one proof that the URL is openable.
  const openHref = isBookmarkableUrl(props.src) ? props.src : null;
  // Title falls back to the location so the card never renders a blank
  // headline — a bookmark whose metadata fetch failed still reads as
  // "a link to example.com/docs".
  const title = props.title?.trim() || location || 'Untitled bookmark';
  const description = props.description?.trim();
  // When no title was captured the headline falls back to the location, so
  // the footer drops to the bare hostname rather than printing the same
  // string twice.
  const footerText = title === location ? bookmarkHost(props.src) : location;
  // `image` / `favicon` are sanitized upstream by `sanitizeComponentProps`
  // (both names are in URL_PROP_NAMES), but a `blob:`/`data:` value would
  // survive that filter — restrict the two remote loads to http(s) so a
  // bookmark can never inline an arbitrary payload.
  const image = !imageBroken && isBookmarkableUrl(props.image) ? props.image : null;
  const favicon = !faviconBroken && isBookmarkableUrl(props.favicon) ? props.favicon : null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (openHref && isSafeNavigationUrl(openHref)) openExternalUrl(openHref);
  };

  return (
    <a
      href={openHref ?? undefined}
      className="ok-bookmark"
      target="_blank"
      rel="noopener noreferrer"
      data-bookmark-openable={openHref ? 'true' : 'false'}
      data-bookmark-has-thumb={image ? 'true' : 'false'}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={handleClick}
    >
      <span className="ok-bookmark-text">
        <span className="ok-bookmark-title">{title}</span>
        {description ? <span className="ok-bookmark-description">{description}</span> : null}
        <span className="ok-bookmark-footer">
          {favicon ? (
            <img
              className="ok-bookmark-favicon"
              src={favicon}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setFaviconBroken(true)}
            />
          ) : (
            <Globe className="ok-bookmark-favicon-fallback" aria-hidden="true" />
          )}
          <span className="ok-bookmark-location">{footerText}</span>
        </span>
      </span>
      {image ? (
        <span className="ok-bookmark-thumb">
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImageBroken(true)}
          />
        </span>
      ) : null}
    </a>
  );
}
