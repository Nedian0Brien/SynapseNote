/**
 * The visible database controls are an explicit capability surface.
 *
 * Keeping this list next to the command boundary makes it possible to audit
 * the rendered toolbar without relying on visual inspection: every enabled
 * control names the command it owns and the production source that wires it.
 * A control may be hidden/disabled when its capability is unavailable, but an
 * enabled control must never be an empty click target.
 */
export const DATABASE_TOOLBAR_CAPABILITIES = [
  {
    id: 'new-record',
    label: 'New',
    handler: 'focusInlineNewRecord',
    owner: 'InlineDatabaseToolbar.tsx',
  },
  {
    id: 'filters',
    label: 'Filters',
    handler: 'onFilterOpenChange',
    owner: 'InlineDatabaseToolbar.tsx',
  },
  { id: 'sort', label: 'Sort', handler: 'onSortOpenChange', owner: 'InlineDatabaseToolbar.tsx' },
  {
    id: 'properties',
    label: 'Properties',
    handler: 'onPropertiesOpenChange',
    owner: 'InlineDatabaseToolbar.tsx',
  },
  {
    id: 'search',
    label: 'Search',
    handler: 'setInlineSearchOpen',
    owner: 'InlineDatabaseToolbar.tsx',
  },
  {
    id: 'view-management',
    label: 'View management',
    handler: 'onInlineViewManagerOpenChange',
    owner: 'InlineDatabaseToolbar.tsx',
  },
  {
    id: 'row-open',
    label: 'Open',
    handler: 'requestOpenDatabaseRecord',
    owner: 'use-inline-database-commands.ts',
  },
  {
    id: 'row-actions',
    label: 'More actions',
    handler: 'onDelete',
    owner: 'DatabaseTableRowActions.tsx',
  },
  {
    id: 'add-property',
    label: 'Add property',
    handler: 'submitAddProperty',
    owner: 'DatabasePropertyInsertPopover.tsx',
  },
] as const;

export type DatabaseToolbarCapability = (typeof DATABASE_TOOLBAR_CAPABILITIES)[number];

export function databaseCapabilityById(
  id: DatabaseToolbarCapability['id'],
): DatabaseToolbarCapability {
  const capability = DATABASE_TOOLBAR_CAPABILITIES.find((candidate) => candidate.id === id);
  if (!capability) throw new Error(`Unknown database capability: ${id}`);
  return capability;
}
