export function legacyMemoQuoteText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]+?)`+/g, '$1')
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '$1')
    .replace(/___(?=\S)([\s\S]*?\S)___/g, '$1')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '$1')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '$1')
    .replace(/_(?=\S)([\s\S]*?\S)_/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\\([\\`*{}[\]()#+\-.!_>])/g, '$1')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
