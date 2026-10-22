/** App-level events shared by editor insertion surfaces and the database shell. */

export const DATABASE_SLASH_COMMAND_EVENT = 'synapsenote:database-slash-command';

export type DatabaseSlashCommand = 'new' | 'linked';

export function dispatchDatabaseSlashCommand(command: DatabaseSlashCommand): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<DatabaseSlashCommand>(DATABASE_SLASH_COMMAND_EVENT, { detail: command }),
  );
}
