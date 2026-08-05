import { chatFilePathFromHref } from './chat-file-links';
import type { ChatTimelineEntry } from './cli-chat-types';
import { extractWebPreviewLinks } from './web-preview-links';

export interface ChatSource {
  readonly key: string;
  readonly kind: 'file' | 'web' | 'search';
  readonly label: string;
  readonly location: string;
  readonly href?: string;
}

const MARKDOWN_LINK = /\[([^\]]+)]\(([^\s)]+)\)/g;
const TOOL_PATH = /"(?:path|file_path|documentPath|document_path)"\s*:\s*"([^"]+)"/g;
const MAX_SOURCES = 8;

function addSource(target: Map<string, ChatSource>, source: ChatSource): void {
  if (target.size >= MAX_SOURCES || target.has(source.key)) return;
  target.set(source.key, source);
}

function addMarkdownSources(target: Map<string, ChatSource>, markdown: string): void {
  for (const web of extractWebPreviewLinks(markdown)) {
    addSource(target, {
      key: `web:${web.url}`,
      kind: 'web',
      label: web.title,
      location: web.location,
      href: web.url,
    });
  }
  for (const match of markdown.matchAll(MARKDOWN_LINK)) {
    const href = match[2] ?? '';
    const path = chatFilePathFromHref(href);
    if (path === null) continue;
    addSource(target, {
      key: `file:${path}`,
      kind: 'file',
      label: (match[1] ?? '').replace(/[*_`]/g, '').trim() || path,
      location: href,
      href,
    });
  }
}

/** Collect only sources actually observed in this turn's tool trace or answer. */
export function collectChatSources(
  timeline: readonly ChatTimelineEntry[],
  assistantIndex: number,
): readonly ChatSource[] {
  const answer = timeline[assistantIndex];
  if (answer?.type !== 'message' || answer.role !== 'assistant') return [];
  const sources = new Map<string, ChatSource>();
  addMarkdownSources(sources, answer.text);

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry?.type === 'message' && entry.role === 'user') break;
    if (entry?.type !== 'activity') continue;
    if (entry.category === 'web_search' && entry.detail) {
      const webLinks = extractWebPreviewLinks(entry.detail);
      if (webLinks.length > 0) {
        for (const web of webLinks) {
          addSource(sources, {
            key: `web:${web.url}`,
            kind: 'web',
            label: web.title,
            location: web.location,
            href: web.url,
          });
        }
      } else {
        addSource(sources, {
          key: `search:${entry.detail}`,
          kind: 'search',
          label: 'Web search',
          location: entry.detail,
        });
      }
    }
    if (entry.category !== 'file' || entry.fullDetail === undefined) continue;
    for (const match of entry.fullDetail.matchAll(TOOL_PATH)) {
      const href = match[1] ?? '';
      const path = chatFilePathFromHref(href);
      if (path === null) continue;
      addSource(sources, {
        key: `file:${path}`,
        kind: 'file',
        label: path.split('/').at(-1) ?? path,
        location: href,
        href,
      });
    }
  }

  return [...sources.values()];
}
