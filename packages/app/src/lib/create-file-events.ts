/**
 * Cross-component "create a new file or folder" trigger — the ONE way any
 * surface outside the sidebar starts a create.
 *
 * Every create in the app lands in the same flow: an inline-rename placeholder
 * in the tree, busy-path tracking, navigation to the new doc. That logic lives
 * behind FileTree's imperative `startCreating` / `createFromTemplate` handles,
 * owned by `FileSidebar`. Rather than thread refs through unrelated component
 * boundaries, callers emit a window-level `CustomEvent` and `FileSidebar`
 * subscribes once. Callers: the ⌘N shortcut host, the command palette's New
 * file / New folder, the empty state's CTAs and template picker, the folder
 * overview's New file, and the folder Templates card.
 *
 * Mirrors the `documents-events.ts` pattern; same event-bus discipline.
 *
 * The event payload optionally carries:
 *   - `kind` — `file` (default) or `folder`.
 *   - `initialDir` — folder to create in. Empty string = project root.
 *     ABSENT means "wherever the sidebar would create right now" (the active
 *     folder / active doc's folder, or the root when the user deselected for
 *     creation) — the same target its own toolbar buttons use. Pass a value
 *     only when the surface owns a folder of its own, like the folder overview.
 *   - `template` — when set, the FileTree's `createFromTemplate(folder, name)`
 *     path is used instead of the empty inline-rename path. `folder` is
 *     the template's `source_folder` (where the new doc lands).
 */

const CREATE_TOP_LEVEL_FILE_EVENT = 'synapsenote:create-top-level-file';

export interface CreateFileRequest {
  /** What to create. Defaults to `file`. */
  kind?: 'file' | 'folder';
  /** Folder to create in. Empty string = project root; absent = the sidebar's
   *  own current create target (see the module docstring). */
  initialDir?: string;
  /**
   * When set, scaffold from a template. `folder` is the template's
   * `source_folder` (the folder owning `.ok/templates/<name>.md`);
   * the new doc lands inside `folder`. `name` is the template's
   * filename without the `.md` extension.
   */
  template?: { folder: string; name: string };
}

export function emitCreateTopLevelFile(detail: CreateFileRequest = {}): void {
  window.dispatchEvent(new CustomEvent<CreateFileRequest>(CREATE_TOP_LEVEL_FILE_EVENT, { detail }));
}

export function subscribeToCreateTopLevelFile(
  onRequest: (request: CreateFileRequest) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<CreateFileRequest | undefined>).detail;
    onRequest(detail ?? {});
  };
  window.addEventListener(CREATE_TOP_LEVEL_FILE_EVENT, listener);
  return () => window.removeEventListener(CREATE_TOP_LEVEL_FILE_EVENT, listener);
}
