// replaces morrow's src/app/platform/desktop.ts, links leave through the native app
import { post } from '../bridge';

export const desktop = null;

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function openExternal(url: string): void {
  if (!/^(https?:|mailto:)/i.test(url)) return;
  post({ type: 'openExternal', url });
}
