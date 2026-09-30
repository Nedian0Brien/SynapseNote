export function nextFootnoteIdentifier(existingIdentifiers: readonly string[]): string {
  let maxId = 0;
  for (const id of existingIdentifiers) {
    const n = Number.parseInt(id, 10);
    if (!Number.isNaN(n) && n > maxId) maxId = n;
  }
  return String(maxId + 1);
}
