interface RuntimeConfig {
  AF_BASE_URL?: string;
  AF_GOTRUE_URL?: string;
  AF_WS_V2_URL?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

export function getConfigValue(key: keyof RuntimeConfig, defaultValue: string): string {
  // First check runtime config (injected by Docker entrypoint)
  if (typeof window !== 'undefined' && window.__APP_CONFIG__) {
    const runtimeValue = window.__APP_CONFIG__[key];

    if (runtimeValue && !runtimeValue.startsWith('${')) {
      return runtimeValue;
    }
  }

  // Fall back to build-time environment variables from Vite
  const envValue = import.meta.env[key];

  if (envValue) {
    return envValue;
  }

  return defaultValue;
}