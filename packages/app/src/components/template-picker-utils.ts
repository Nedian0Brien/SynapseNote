import type { TemplateMenuEntry } from '@/hooks/use-folder-config';

/**
 * Pure ordering helper for the "New from template" menus.
 * Lives in a leaf module (no component imports) so every menu surface and
 * `TemplateMenuRows` can share it without forming an import cycle through a
 * component file.
 */

const SCOPE_ORDER: Record<TemplateMenuEntry['scope'], number> = {
  local: 0,
  inherited: 1,
};

/**
 * Default ordering for the picker: scope-grouped (local → inherited) then
 * alphabetical within each group. Stable across renders.
 */
export function sortTemplatesForPicker(
  templates: readonly TemplateMenuEntry[],
): TemplateMenuEntry[] {
  return [...templates].sort((a, b) => {
    const scopeDelta = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    if (scopeDelta !== 0) return scopeDelta;
    const aLabel = (a.title ?? a.name).toLowerCase();
    const bLabel = (b.title ?? b.name).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}
