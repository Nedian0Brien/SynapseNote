/**
 * Declarative ownership map for main-process request IPC.
 *
 * The main entrypoint composes the registrars, while this Electron-free map
 * makes ownership and the static channel contract testable without loading
 * Electron. Lifecycle registrars (updater, onboarding, MCP wiring and the
 * settings surfaces) intentionally stay out of this map: they are armed by
 * their own startup/lifecycle owners.
 */
import type { RequestChannels } from '../../shared/ipc-channels.ts';
import { assertDesktopIpcRegistrarOwnership } from './registrar-ownership.ts';

export { assertDesktopIpcRegistrarOwnership } from './registrar-ownership.ts';
export type StaticDesktopIpcChannel = Exclude<
  keyof RequestChannels,
  | 'ok:update:relaunch-now'
  | 'ok:update:check-now'
  | 'ok:update:whats-new-dismiss'
  | 'ok:mcp-wiring:confirm'
  | 'ok:mcp-wiring:skip'
  | 'ok:mcp-wiring:renderer-ready'
  | 'ok:onboarding:confirm'
  | 'ok:onboarding:cancel'
  | 'ok:onboarding:renderer-ready'
  | 'ok:onboarding:probe-content'
  | 'ok:integrations:dispatch'
  | 'ok:project-integrations:dispatch'
>;

export const DYNAMIC_LIFECYCLE_CHANNELS = [
  'ok:update:relaunch-now',
  'ok:update:check-now',
  'ok:update:whats-new-dismiss',
  'ok:mcp-wiring:confirm',
  'ok:mcp-wiring:skip',
  'ok:mcp-wiring:renderer-ready',
  'ok:onboarding:confirm',
  'ok:onboarding:cancel',
  'ok:onboarding:renderer-ready',
  'ok:onboarding:probe-content',
  'ok:integrations:dispatch',
  'ok:project-integrations:dispatch',
] as const satisfies readonly (keyof RequestChannels)[];

export const DESKTOP_IPC_REGISTRARS = {
  terminalPty: [
    'ok:pty:create',
    'ok:pty:input',
    'ok:pty:resize',
    'ok:pty:kill',
    'ok:pty:drain',
    'ok:pty:list',
    'ok:terminal:cli-chat-sessions',
    'ok:pty:adopt',
    'ok:pty:set-meta',
    'ok:pty:set-order',
    'ok:terminal:claude-assist',
    'ok:terminal:cli-preflight',
    'ok:terminal:cli-installed-map',
    'ok:terminal:dock-state',
  ],
  nativeShellAssetsMenu: [
    'ok:dialog:open-folder',
    'ok:shell:open-external',
    'ok:shell:detect-protocol',
    'ok:shell:spawn-cursor',
    'ok:shell:record-handoff',
    'ok:shell:open-asset',
    'ok:shell:reveal-asset',
    'ok:shell:show-asset-menu',
    'ok:shell:show-item-in-folder',
    'ok:shell:reveal-external',
    'ok:shell:trash-item',
  ],
  appStateThemeMenu: [
    'ok:editor:active-target-changed',
    'ok:editor:view-menu-state-changed',
    'ok:clipboard:write-text',
    'ok:theme:set-source',
    'ok:theme:applied',
    'ok:startup:renderer-marks',
    'ok:state:reset-incompatible',
    'ok:state:query',
    'ok:debug:keyring-smoke',
  ],
  bugLocalOps: [
    'ok:sharing:dispatch',
    'ok:bug-report:dispatch',
    'ok:skill:detect-claude-desktop',
    'ok:skill:build-and-open',
    'ok:local-op:auth:start',
    'ok:local-op:auth:cancel',
    'ok:local-op:clone:start',
    'ok:local-op:clone:cancel',
    'ok:local-op:auth:status',
    'ok:local-op:auth:repos',
  ],
  projectRecentsWorktreeCreate: [
    'ok:project:get-info',
    'ok:project:list-recent',
    'ok:project:remove-recent',
    'ok:project:get-session-state',
    'ok:project:set-session-state',
    'ok:project:open',
    'ok:worktree:dispatch',
    'ok:share:validate-folder',
    'ok:project:check-target-exists',
    'ok:project:read-head-branch',
    'ok:project:fetch-branch-info',
    'ok:project:run-checkout',
    'ok:project:fetch-target-status',
    'ok:project:await-branch-switched',
    'ok:project:ok-init',
    'ok:project:close',
    'ok:project:restart-server',
    'ok:fs:default-projects-root',
    'ok:fs:folder-state',
    'ok:fs:find-enclosing-project-root',
    'ok:fs:find-enclosing-git-root',
    'ok:fs:remove-git-folder',
    'ok:project:create-new',
    'ok:project:record-create-new-banner-shown',
    'ok:navigator:open',
  ],
  seed: ['ok:seed:plan', 'ok:seed:apply', 'ok:seed:list-packs'],
} as const satisfies Record<string, readonly StaticDesktopIpcChannel[]>;

/** Registers each static channel once and rejects an accidental duplicate. */
export function registerDesktopIpcRegistrars(
  register: (channel: StaticDesktopIpcChannel) => void,
): void {
  assertDesktopIpcRegistrarOwnership(DESKTOP_IPC_REGISTRARS);
  for (const channels of Object.values(DESKTOP_IPC_REGISTRARS)) {
    for (const channel of channels) {
      register(channel);
    }
  }
}
