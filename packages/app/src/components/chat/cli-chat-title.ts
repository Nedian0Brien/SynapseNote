const MAX_CHAT_TITLE_LENGTH = 36;

/** Turn the first user instruction into a compact, single-line session label. */
export function shortCliChatTitle(prompt: string, fallback: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized === '') return fallback;
  const characters = Array.from(normalized);
  if (characters.length <= MAX_CHAT_TITLE_LENGTH) return normalized;
  return `${characters.slice(0, MAX_CHAT_TITLE_LENGTH - 1).join('')}…`;
}
