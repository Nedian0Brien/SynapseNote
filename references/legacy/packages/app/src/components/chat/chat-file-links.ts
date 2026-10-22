import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { filePathToDocName, hashFromDocName } from '@/lib/doc-hash';
import { resolveTerminalPath } from '../terminal-links';

interface PreventableClick {
  preventDefault(): void;
}

interface ChatFileLinkDeps {
  readonly navigateToHash?: (hash: string) => void;
  readonly warn?: (...args: unknown[]) => void;
}

const LOCATION_SUFFIX_RE = /:\d+(?::\d+)?$/;
const LINE_FRAGMENT_RE = /#L\d+(?:C\d+)?$/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const BARE_FILE_RE = /\.[A-Za-z0-9]+$/;

/**
 * Turn an agent-authored markdown href into the path syntax shared with the
 * terminal file-link router. Codex commonly emits absolute links with a
 * `:line[:column]` suffix; Claude also emits project-relative paths.
 */
export function chatFilePathFromHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('?')) return null;

  if (/^file:/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'file:' || (parsed.hostname && parsed.hostname !== 'localhost')) {
        return null;
      }
      return decodeURIComponent(parsed.pathname).replace(LOCATION_SUFFIX_RE, '');
    } catch {
      return null;
    }
  }

  // Strip source-location notation before the scheme check: `src/a.ts:12`
  // is a file reference, while `https:` / `mailto:` must stay ordinary links.
  const withoutLocation = trimmed.replace(LINE_FRAGMENT_RE, '').replace(LOCATION_SUFFIX_RE, '');
  if (SCHEME_RE.test(withoutLocation) || withoutLocation.startsWith('//')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutLocation);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') && !decoded.includes('/') && !BARE_FILE_RE.test(decoded)) {
    return null;
  }
  return decoded;
}

/**
 * Claim and route a local file href from chat. Returns true synchronously when
 * the click was claimed, allowing the React anchor handler to suppress native
 * Electron navigation before any IPC awaits begin.
 */
export function dispatchChatFileLinkClick(
  event: PreventableClick,
  href: string | undefined,
  bridge: OkDesktopBridge,
  deps: ChatFileLinkDeps = {},
): boolean {
  if (!href) return false;
  const path = chatFilePathFromHref(href);
  if (path === null) return false;
  const target = resolveTerminalPath(path, bridge.config.projectPath);
  if (target === null) return false;

  event.preventDefault();
  const warn = deps.warn ?? console.warn;
  if (target.kind === 'external') {
    void bridge.shell
      .revealExternal(target.absPath)
      .catch((err) => warn('[chat] revealExternal failed:', err));
    return true;
  }

  if (/\.mdx?$/i.test(target.relPath)) {
    const hash = hashFromDocName(filePathToDocName(target.relPath));
    (deps.navigateToHash ?? ((next) => (window.location.hash = next)))(hash);
    return true;
  }

  void bridge.shell
    .openAsset(target.relPath)
    .then((result) => {
      if (result.ok) return;
      if (result.reason === 'extension-blocked') {
        void bridge.shell
          .revealAsset(target.relPath)
          .catch((err) => warn('[chat] revealAsset failed:', err));
        return;
      }
      warn('[chat] openAsset refused:', result.reason, { relPath: target.relPath });
    })
    .catch((err) => warn('[chat] openAsset failed:', err));
  return true;
}
