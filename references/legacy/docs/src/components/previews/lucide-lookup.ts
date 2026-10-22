import type { LucideIcon } from 'lucide-react';
import * as lucide from 'lucide-react';

/**
 * Resolve a namespaced lucide identifier (`lucide:Lightbulb`) to the actual
 * component — same interface the app uses for `<Callout icon="...">` /
 * `<Accordion icon="...">`. Undefined for anything not in the lucide export
 * map so callers can fall back to a type-derived default.
 */
export function resolveLucideIcon(identifier: string | undefined): LucideIcon | undefined {
  if (!identifier) return undefined;
  const parts = identifier.split(':');
  const name = (parts[1] ?? parts[0]).trim();
  if (!name) return undefined;
  const table = lucide as unknown as Record<string, unknown>;
  const candidate = table[name];
  if (typeof candidate === 'function' || (candidate && typeof candidate === 'object')) {
    return candidate as LucideIcon;
  }
  return undefined;
}
