/** Runtime ownership validation for the static desktop IPC map. */

type DesktopIpcRegistrarMap = Readonly<Record<string, readonly string[]>>;

export function assertDesktopIpcRegistrarOwnership(
  registrars: DesktopIpcRegistrarMap,
  expectedChannels?: readonly string[],
): void {
  const seen = new Set<string>();
  for (const channels of Object.values(registrars)) {
    for (const channel of channels) {
      if (seen.has(channel)) throw new Error(`duplicate desktop IPC registrar channel: ${channel}`);
      seen.add(channel);
    }
  }
  for (const channel of expectedChannels ?? []) {
    if (!seen.has(channel)) throw new Error(`missing desktop IPC registrar channel: ${channel}`);
  }
}
