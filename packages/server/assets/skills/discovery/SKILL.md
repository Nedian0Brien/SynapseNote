---
name: synapsenote-discovery
description: "Read when the user asks what SynapseNote is, wants to install it on a repository, wants to share an SynapseNote project with collaborators, or asks how `ok init` / `ok cowork` / OK Desktop set up a project. Do NOT load to perform SynapseNote reads/writes — the app supplies runtime guidance directly to its own agent sessions. Do not activate for ordinary Markdown work. App-managed sessions receive their document contract directly; never install a runtime skill to repair a session."
compatibility: "Any agent host — no MCP server required. Pure discovery + install guidance."
metadata:
  version: "0.30.1"
  author: "SynapseNote"
  repository: "https://github.com/Nedian0Brien/SynapseNote"
---
# SynapseNote — what it is and how to install it

SynapseNote (OK) is a markdown-CRDT collaboration platform. It turns a
directory of `.md` / `.mdx` files into a live, multi-writer knowledge base:
agents and humans edit the same documents in real time, every change is
attributed, and a browser preview renders edits as they land.

This skill covers discovery, setup, and opening files. SynapseNote supplies the document contract directly to its app-managed agent sessions.

## Install SynapseNote on a repository

Run `ok init` from the repository root:

```bash
npx @nedian0brien/synapsenote init
# or, after a global install:
npm install -g @nedian0brien/synapsenote
ok init
```

`ok init` is the one setup verb. It:

- scaffolds a `.ok/` directory (project config — `content.dir` defaults to `.`);
- wires the SynapseNote MCP server into detected editors (Claude Code,
  Cursor, Codex) — skip with `--no-mcp`;
- ensures the project has a `.git/`.

Re-run `ok init` to refresh explicitly selected editor connections. Runtime skills are no longer installed.

## Share an SynapseNote project with collaborators

An OK project travels with its repository. To share one:

1. Commit the `.ok/` project configuration and Markdown content.
2. Collaborators clone the repo and open it in SynapseNote, or run `ok init` to configure explicitly requested external editor connections.
3. Start the editor with `ok start`, or open the project in SynapseNote Desktop.

Collaboration is real-time once two writers have the project open against the
same content directory.

## OK Desktop

OK Desktop is the standalone macOS app (`@nedian0brien/synapsenote-desktop`). It
bundles its own CLI, opens a project as an editor + preview window, and keeps
app-managed agent guidance current with the installed app version. Download DMGs
from the releases page.

## Opening a file outside a project

SynapseNote can open a single markdown file that is **not** part of an OK
project — a loose `.md` / `.mdx`, **or a file that lives inside a regular
repo/folder which was never `ok init`'d**. It opens in a throwaway session (a
temp project in the OS temp dir — your repo is never touched, no `.ok/` is
written into it) with the same live preview you get inside a project.

**Never run `ok init` just to view or open a file.** `ok init` turns a repo
into a shared SynapseNote project; it is not a prerequisite for opening one
file. Opening a file needs no project, no `.ok/`, and no server already
running — each path below boots the session itself.

When asked to open or preview such a file, **decide by the viewing surface you
actually have** — check the tool, not the host name. Only open a browser when
you genuinely have one; never pop a browser tab on a host that has none.

- **You have an in-app / built-in browser** (Claude Code Desktop's Browser pane, Cursor, Codex, and similar) — this
  is the default: call the **`preview_url` MCP tool** with `file` set to the
  absolute path (it finds, or boots on demand, the session and returns a full
  `url`), then **immediately open that `url` in your in-app browser**. "Open it"
  means navigate your browser — don't just print the URL and stop. This is also
  the only way to view it in a browser when the OK Desktop app is installed
  (`ok open` prefers the Desktop app). Get the URL from `preview_url` only —
  never hunt for it via `ok ps` / `ok status` / `ok ui` / `ok start` or a guessed
  port.
- **No in-app browser** (a pure-stdio CLI) — run
  `ok open /abs/path/to/file.md`: it opens the Desktop app when installed, else a
  browser, and boots the session itself. Don't force a browser tab the user
  didn't ask for; `ok open` is the right default here. If `ok` isn't on PATH,
  `npx @nedian0brien/synapsenote open /abs/path/to/file.md` does the same.

If the OK MCP server isn't wired into this host there is no `preview_url` to
call — use the `ok open` path above. Don't reconstruct what `preview_url` does
by hand (spawning `ok mcp` yourself, scraping ports from `ok ps`).

The path must be absolute (a file outside a project has no cwd to anchor a
relative path). Re-opening the same file lands on the same session. Never
construct or guess the URL — use the one `preview_url` returns.

## Working inside the app

SynapseNote injects its document contract into app-managed agent launches, including new and resumed chat sessions. No project-local runtime skill is required. Detailed document reference material is available from `workflow({ kind: "guide", topic: "writing" })`.

When using an external editor, connect MCP only when the user requests SynapseNote document operations. Do not install or load a `synapsenote` runtime skill, and do not impose its rules on ordinary Markdown tasks. If an app session has no tools, repair its MCP connection.
