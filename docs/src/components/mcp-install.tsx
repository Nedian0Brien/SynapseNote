import type { ReactNode } from 'react';

/**
 * Shared "Install" body for the MCP integration pages. Covers both ways the
 * editor gets wired up: the macOS desktop app's first-launch consent dialog,
 * and `ok init` for the web app / terminal path. The consent-dialog re-trigger
 * is single-sourced here. Optional editor-specific notes go in `children`.
 */
export function McpInstall({ editor, children }: { editor: string; children?: ReactNode }) {
  return (
    <>
      <p>There are two ways to connect {editor}, depending on how you run SynapseNote:</p>
      <ul>
        <li>
          <strong>macOS desktop app.</strong> The first time you open a project, a consent dialog
          detects {editor} and configures it for you. To re-trigger the dialog, choose{' '}
          {/* biome-ignore lint/plugin/microcopy-ellipsis: quoting the literal macOS menu label (menu.ts) */}
          <strong>File → Set up SynapseNote integrations…</strong>.
        </li>
        <li>
          <strong>Web app / terminal</strong> (Linux, Windows, Intel Mac — see the{' '}
          <a href="/docs/get-started/quickstart#ok-install-web-app-linux-windows-intel-mac">
            web app guide
          </a>
          ). Run <code>ok init</code> in your project: it registers the SynapseNote MCP server with{' '}
          {editor} and the other editors it detects. Every <code>ok start</code> repairs the entry
          if it has drifted (it never adds one you removed).
        </li>
      </ul>
      {children}
    </>
  );
}
