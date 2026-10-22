import { stripFrontmatter } from '@nedian0brien/synapsenote-core';

export const FOLDER_DOCUMENT_CARD_MIN_HEIGHT = 196;
export const FOLDER_DOCUMENT_CARD_MAX_HEIGHT = 252;
export const FOLDER_DOCUMENT_BODY_VERTICAL_PADDING = 20;
export const FOLDER_DOCUMENT_RENDERED_HEIGHT_SCALE = 0.25;

function normalizeForComparison(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

/**
 * Keeps the document body as Markdown so the card can render the same visual
 * hierarchy as the page. Frontmatter and a duplicate leading H1 are omitted
 * because the card already owns a separate title header.
 */
export function folderDocumentPreviewMarkdown(markdown: string, title: string): string {
  const lines = stripFrontmatter(markdown).body.replace(/\r\n?/g, '\n').split('\n');
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentLine >= 0) {
    const heading = /^#\s+(.+)$/.exec(lines[firstContentLine]?.trim() ?? '');
    if (heading && normalizeForComparison(heading[1] ?? '') === normalizeForComparison(title)) {
      lines.splice(firstContentLine, 1);
    }
  }

  return lines.join('\n').trim();
}

/** Plain, single-line companion used by the compact list view. */
export function folderDocumentPreviewText(markdown: string, title: string): string {
  return folderDocumentPreviewMarkdown(markdown, title)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+] |\d+[.)] )/gm, '')
    .replace(/[|`*_~>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A stable pre-load estimate. Once Markdown is rendered the card reports its
 * measured document height, so file bytes never remain the final visual rule.
 */
export function folderDocumentEstimatedCardHeight(size: number): number {
  const safeSize = Math.max(0, size);
  const progress = Math.min(1, Math.log1p(safeSize / 320) / Math.log1p(8_000 / 320));
  return Math.round(
    FOLDER_DOCUMENT_CARD_MIN_HEIGHT +
      (FOLDER_DOCUMENT_CARD_MAX_HEIGHT - FOLDER_DOCUMENT_CARD_MIN_HEIGHT) * progress,
  );
}

/**
 * Craft-like previews grow with the rendered page, retain a useful minimum,
 * and stop at a compact maximum where the card adds a visual fade.
 */
export function folderDocumentMeasuredCardHeight(
  headerHeight: number,
  renderedBodyHeight: number,
): number {
  const naturalHeight =
    Math.max(0, headerHeight) +
    FOLDER_DOCUMENT_BODY_VERTICAL_PADDING +
    Math.max(0, renderedBodyHeight) * FOLDER_DOCUMENT_RENDERED_HEIGHT_SCALE;
  return Math.min(
    FOLDER_DOCUMENT_CARD_MAX_HEIGHT,
    Math.max(FOLDER_DOCUMENT_CARD_MIN_HEIGHT, Math.ceil(naturalHeight)),
  );
}
