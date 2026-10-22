export interface WebPreviewLink {
  readonly url: string;
  readonly title: string;
  readonly hostname: string;
  readonly location: string;
}

const MARKDOWN_LINK = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/gi;
const BARE_URL = /https?:\/\/[^\s<>(){}]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?\]]+$/;
const MAX_WEB_PREVIEWS = 4;

function normalizedPreview(url: string, title?: string): WebPreviewLink | null {
  const cleaned = url.replace(TRAILING_PUNCTUATION, '');
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const hostname = parsed.hostname.replace(/^www\./i, '');
    const candidateTitle = title?.replace(/[*_`]/g, '').trim();
    const displayTitle =
      candidateTitle && !/^https?:\/\//i.test(candidateTitle) ? candidateTitle : hostname;
    const location = `${hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    return { url: parsed.toString(), title: displayTitle, hostname, location };
  } catch {
    return null;
  }
}

/** Extract a small, stable set of public web references from assistant Markdown. */
export function extractWebPreviewLinks(markdown: string): readonly WebPreviewLink[] {
  const previews: WebPreviewLink[] = [];
  const seen = new Set<string>();

  function add(url: string, title?: string) {
    if (previews.length >= MAX_WEB_PREVIEWS) return;
    const preview = normalizedPreview(url, title);
    if (preview === null || seen.has(preview.url)) return;
    seen.add(preview.url);
    previews.push(preview);
  }

  for (const match of markdown.matchAll(MARKDOWN_LINK)) add(match[2] ?? '', match[1]);
  for (const match of markdown.matchAll(BARE_URL)) add(match[0]);

  return previews;
}
