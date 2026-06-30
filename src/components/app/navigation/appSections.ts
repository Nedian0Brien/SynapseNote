export const APP_SECTIONS = ['home', 'library', 'graph', 'agent'] as const;

export type AppSection = (typeof APP_SECTIONS)[number];

export function isAppSection(value: string | undefined): value is AppSection {
  return APP_SECTIONS.includes(value as AppSection);
}

export function getAppSectionPath(workspaceId: string | undefined, section: AppSection) {
  return workspaceId ? `/app/${workspaceId}/${section}` : '/app';
}
