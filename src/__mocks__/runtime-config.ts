/**
 * Jest mock for runtime-config.ts
 * This avoids the import.meta.env issue in Jest tests
 */
export function getConfigValue(key: string, defaultValue: string): string {
  // Return test defaults for common config keys
  const testDefaults: Record<string, string> = {
    SYNAPSENOTE_BASE_URL: 'https://synapse.test',
    SYNAPSENOTE_GOTRUE_BASE_URL: 'https://synapse.test/gotrue',
    SYNAPSENOTE_WS_BASE_URL: 'wss://synapse.test/ws/v2',
  };

  return testDefaults[key] ?? defaultValue;
}
