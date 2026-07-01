# SynapseNote Web Design Tokens

This file records the active visual contract for the AppFlowy-derived SynapseNote web shell.
It does not replace the prototype-derived CSS. Use the existing CSS variables and component classes first.

## Atmosphere

- Quiet workspace UI for repeated reading, editing, and retrieval.
- Dense enough for scanning document lists, restrained enough for long sessions.
- No marketing sections, decorative gradients, or fake product imagery inside the app shell.

## Color

- Backgrounds: `var(--bg)`, `var(--surface)`, `var(--surface-low)`, `var(--surface-high)`.
- Text: `var(--on-surface)`, `var(--on-variant)`, `var(--sn-muted)`.
- Accent: `var(--sn-primary)`, with `var(--primary-dim)` for selected and hover states.
- Borders: `var(--outline)`, `var(--outline-var)`.
- Do not add raw hex values for new UI. Reuse existing variables or add tokens here first.

## Typography

- App shell font: `var(--font-bd)`.
- Emphasis headings: `var(--font-hl)`.
- Code and Markdown editing: `ui-monospace`, `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, `Liberation Mono`, `monospace`.
- Keep compact panel labels at existing sizes from `synapse-app.css`.

## Spacing

- App page padding follows `.page`.
- Library grid/editor spacing follows `.vault-library-shell`, `.vault-editor-head`, `.lib-toolbar`.
- Button and chip spacing follows `.btn`, `.chip`, `.seg`, `.field`.
- Do not introduce new spacing scales for small feature additions.

## Shape

- Use existing radius tokens: `var(--r-xs)`, `var(--r-sm)`, `var(--r-md)`, `var(--r-lg)`, `var(--r-full)`.
- Cards and panels keep the current SynapseNote radius scale.

## Components

- Primary actions: `.btn.btn-primary`.
- Secondary actions: `.btn.btn-secondary`.
- Lightweight toggles/filters: `.chip`, `.seg`.
- Library document rows: `.lrow`, `.trow`, `.hcard`.
- Editor shell: `.vault-editor`, `.vault-editor-head`, `.vault-markdown-editor`.

## Motion And Depth

- Existing hover motion uses `transform`, `filter`, `background`, `color`, and tokenized transitions.
- Reuse `var(--dur)`, `var(--ease)`, and `var(--ease-spring)`.
- Elevation uses `var(--shadow-md)` where already established.
