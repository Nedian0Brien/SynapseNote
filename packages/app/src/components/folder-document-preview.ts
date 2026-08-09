import { stripFrontmatter } from '@nedian0brien/synapsenote-core';

export type FolderDocumentPreviewBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; text: string }
  | { kind: 'code'; text: string };

const DEFAULT_MAX_BLOCKS = 22;
const DEFAULT_MAX_CHARACTERS = 1_800;

function normalizeForComparison(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function readableInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/<https?:\/\/([^>]+)>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~]/g, '')
    .replace(/\\([#\-[\]()])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a small, safe, source-faithful paper preview without mounting a full
 * editor for every folder card. The output contains text only; Markdown links,
 * images, MDX tags, and formatting markers are reduced to their readable label.
 */
export function buildFolderDocumentPreview(
  markdown: string,
  title: string,
  options?: { maxBlocks?: number; maxCharacters?: number },
): FolderDocumentPreviewBlock[] {
  const maxBlocks = options?.maxBlocks ?? DEFAULT_MAX_BLOCKS;
  const maxCharacters = options?.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const lines = stripFrontmatter(markdown).body.replace(/\r\n?/g, '\n').split('\n');
  const blocks: FolderDocumentPreviewBlock[] = [];
  let characters = 0;
  let paragraph: string[] = [];
  let codeLines: string[] | null = null;
  let skippedDuplicateTitle = false;

  function push(block: FolderDocumentPreviewBlock) {
    if (blocks.length >= maxBlocks || characters >= maxCharacters) return;
    const remaining = maxCharacters - characters;
    const text = block.text.slice(0, remaining).trim();
    if (!text) return;
    blocks.push({ ...block, text });
    characters += text.length;
  }

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const text = readableInlineMarkdown(paragraph.join(' '));
    paragraph = [];
    if (text) push({ kind: 'paragraph', text });
  }

  function flushCode() {
    if (codeLines === null) return;
    const text = codeLines.slice(0, 4).join('\n').trim();
    codeLines = null;
    if (text) push({ kind: 'code', text });
  }

  for (const rawLine of lines) {
    if (blocks.length >= maxBlocks || characters >= maxCharacters) break;
    const trimmed = rawLine.trim();

    if (/^(```|~~~)/.test(trimmed)) {
      flushParagraph();
      if (codeLines === null) codeLines = [];
      else flushCode();
      continue;
    }
    if (codeLines !== null) {
      if (codeLines.length < 4) codeLines.push(rawLine.trimEnd());
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (/^(import|export)\s/.test(trimmed) || /^<\/?[A-Z][^>]*>$/.test(trimmed)) {
      flushParagraph();
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      const text = readableInlineMarkdown(heading[2] ?? '');
      if (
        !skippedDuplicateTitle &&
        heading[1]?.length === 1 &&
        normalizeForComparison(text) === normalizeForComparison(title)
      ) {
        skippedDuplicateTitle = true;
        continue;
      }
      push({ kind: 'heading', level: heading[1]?.length ?? 2, text });
      continue;
    }

    const list = /^\s*(?:(\d+)[.)]|[-+*])\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(rawLine);
    if (list) {
      flushParagraph();
      push({ kind: 'list', ordered: list[1] !== undefined, text: readableInlineMarkdown(list[2]) });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    paragraph.push(quote?.[1] ?? trimmed);
  }

  flushParagraph();
  flushCode();
  return blocks;
}

/**
 * Craft-like paper cards use more vertical space for longer notes while small
 * notes remain compact. The path adds only a small deterministic variation so
 * equal-sized notes do not form an artificial horizontal grid in masonry view.
 */
export function folderDocumentCardHeight(size: number, path: string): number {
  const safeSize = Math.max(0, size);
  const contentBand = safeSize < 350 ? 0 : safeSize < 1_200 ? 1 : safeSize < 4_000 ? 2 : 3;
  const variation = [...path].reduce((sum, character) => sum + (character.codePointAt(0) ?? 0), 0);
  return Math.min(388, 216 + contentBand * 48 + (variation % 3) * 16);
}
