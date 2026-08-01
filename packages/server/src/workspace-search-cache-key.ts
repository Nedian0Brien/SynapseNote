/** Creates the unambiguous in-memory cache key for one workspace search corpus. */
export function createWorkspaceSearchCacheKey(contentDir: string, projectDir?: string): string {
  return `${contentDir}\0${projectDir ?? ''}`;
}
