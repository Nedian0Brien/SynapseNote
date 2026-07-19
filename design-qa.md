# Document viewer design QA

## Visual truth

- Source A: `exec-fd092af6-f9ff-49b3-a736-65b81ed5dd05.png` (option 2) for the Markdown breadcrumb, title row, and formatting toolbar.
- Source B: `exec-c00b1cd5-938b-4ed0-a1c4-5a137c2e93b5.png` (option 3) for the restrained shared chrome, PDF presentation, and overall visual unity.
- Source C: `03-markdown-outline-open.png`, the pre-redesign SynapseNote panel, for the icon-only right-rail tab design that remains outside the redesign scope.
- Accepted hybrid: option 2's Markdown information hierarchy and tools inside option 3's cleaner shared viewer shell.
- Scope correction: PDF controls should use the same fixed second-row treatment as Markdown; Chat/Outline/Links/Graph/Timeline retain their existing icon-only segmented control.

## Compared implementation

- Viewport: 1300 × 768 desktop window.
- Markdown state: long research note, Chat rail open, rendered mode, formatting toolbar visible.
- PDF state: first page rendered, Chat rail open, full-width 40 px PDF tool row visible.
- Full-view comparison: `03-hybrid-markdown-comparison.png` places source A, source B, and the installed Markdown implementation in one input.
- Cross-view comparison: `04-markdown-pdf-unity.png` places the installed Markdown and PDF viewers side by side.
- Focused comparisons: `05-header-comparison.png` checks breadcrumb/title/tool alignment; `06-right-rail-comparison.png` checks Chat-first ordering, rail width, and composer placement.
- Scope-correction comparison: `09-icon-rail-comparison.png` places the original icon-only rail and the revised installed Markdown rail side by side.
- Toolbar-unity comparison: `10-toolbar-unity-comparison.png` places the revised installed Markdown and PDF viewers side by side at the same viewport.
- Empty-row correction: `13-no-empty-row-comparison.png` places the original panel and the revised installed Markdown panel side by side; `14-final-no-empty-row.png` places the final Markdown and PDF states side by side.
- Divider correction: `16-divider-comparison.png` places the installed rail before and after the icon-row divider removal in one focused comparison input.
- PDF five-tab implementation: `18-pdf-five-tabs-links.png` captures the installed PDF viewer with Links selected; `19-pdf-five-tabs-full-comparison.png` places the accepted Markdown icon rail and installed PDF rail together; `20-pdf-five-tabs-focused-comparison.png` compares the two rail regions at the same scale.
- PDF five-tab state: first page rendered at 167%, Links selected, with Chat / Pages / Annotations / Outline / Links available in that order.
- Responsive PDF rail: `20-pdf-pages-one-column.png` captures the installed Pages panel using the available width for a two-column thumbnail grid; `22-pdf-chat-shared-width.png` captures Chat after switching tabs without changing the rail boundary.
- PDF knowledge panels: `23-pdf-links-sections.png` captures External Links, Backlinks, and Memos; `24-pdf-outline-shared-design.png` captures the PDF bookmark hierarchy using the Markdown Outline shell.
- Final comparisons: `25-outline-full-comparison.png` and `26-outline-focused-comparison.png` compare Markdown and PDF outline treatments side by side; `27-width-state-comparison.png` compares Pages and Chat with the panel boundary fixed at x=954.
- Web-preview density comparison: `35-opengraph-thumbnail-size-comparison.png` places the installed hero-thumbnail card and compact horizontal card side by side at the same scale; `34-chat-opengraph-compact.png` captures the final installed Chat panel.

## Findings and iteration history

| Iteration | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | P1 | The first installed build kept the view/source switch centered in the identity row, leaving only half the available width for the breadcrumb and title. With Chat open, `note / summary` truncated into unreadable fragments. | Moved the view/source switch to the Markdown formatting row and changed the shared header to a two-column identity/actions layout when no centered control exists. The full breadcrumb and substantially more title copy now remain visible. |
| 1 | P1 | PDF had no viewer-level entry point matching Markdown's right-panel control. | Added the shared document header and panel toggle to the route-level PDF viewer. Closing and reopening the Chat rail was verified in the installed app. |
| 1 | P2 | Markdown and PDF used unrelated title/tool chrome and different right-rail entry patterns. | Introduced one document identity row, aligned rail header heights, and retained renderer-specific contextual tools below it. |
| 1 | P2 | Desktop Markdown could show a bottom composer in addition to the Chat rail. | Kept the bottom composer for the web host only; the desktop app now uses the shared right rail as the single chat surface. |
| 2 | P2 | The original Markdown editor exclusion offset was too short for the new two-row chrome. | Updated editor, source-mode, and frozen-table-header offsets from 56 px to 84 px and verified content starts below both rows. |
| 3 | P1 | The right-rail redesign introduced visible Chat/Outline/Links/Graph/Timeline text labels, although the existing icon-only control was outside the approved change scope. | Removed every visible tab label and restored the prior outlined, icon-only ToggleGroup while preserving accessible names and Chat-first ordering. Verified both the five-tab Markdown rail and the one-tab PDF rail in the installed app. |
| 3 | P2 | PDF controls were presented as a floating pill over the document, unlike Markdown's fixed second tool row. | Replaced the floating pill with a full-width 40 px toolbar directly beneath the shared identity header, including the loading state, and removed the compensating page-top inset. |
| 4 | P2 | A blank 44 px continuation row sat above the right-rail tabs and consumed space without identity, content, or an action. | Removed the spacer entirely. The icon tabs now occupy the panel's top row, and the terminal/session row beneath aligns with each viewer's contextual toolbar. Verified in installed Markdown and PDF states. |
| 5 | P2 | The icon tab row still drew a full-width bottom divider even though the outlined icon group already defined the control boundary. | Removed only the row's bottom border. Chat-first ordering, selected states, tooltips, accessible names, and the session/content structure remain unchanged. Verified in the installed Markdown viewer and the focused before/after comparison. |
| 6 | P2 | PDF only exposed Chat in the shared rail, so page previews, document annotations, bookmarks, and links remained in separate or unavailable surfaces. | Added the approved Chat / Pages / Annotations / Outline / Links icon-only tab set. Connected each content view to the live PDF engine and verified the installed app at the same 1300 x 768 viewport. |
| 7 | P2 | Annotation excerpts initially expanded beyond the intended compact row height, and raw PDF link annotations produced repeated entries for the same source-page/target pair. | Corrected the excerpt clamp and deduplicated links by source page plus target. The installed Links rail now keeps distinct document links while removing redundant annotations. |
| 8 | P2 | The Pages panel used a single vertical list even when its width could comfortably present more previews. | Changed Pages to a container-responsive grid with one column at compact widths and two columns when space permits. Added lazy thumbnail rendering so the denser view does not eagerly render every PDF page. |
| 9 | P2 | Chat and document panels restored width from separate stores, causing the right rail to jump when switching tabs. | Made both surfaces read and persist one canonical right-rail width. Installed-app comparison confirms the divider remains at x=954 between Pages and Chat. |
| 10 | P2 | The PDF Links panel exposed the raw annotation link model but did not reflect the document relationships users need. | Reframed Links into External Links, Backlinks, and Memos. External targets retain source-page metadata, backlinks resolve through the document backlink index, and PDF text memos navigate to their source annotation. |
| 11 | P2 | PDF bookmarks used a bespoke list whose heading, active state, indentation, count, and density differed from Markdown Outline. | Extracted the Markdown outline presentation into a shared component and rendered the flattened PDF bookmark hierarchy through it. The focused side-by-side QA shows matching header, count badge, active dot, row rhythm, indentation, truncation, and typography. |
| 12 | P2 | The standalone OpenGraph preview used a full-width hero image that dominated the narrow Chat rail and pushed subsequent conversation content down. | Reworked the preview into a compact horizontal card with an 80 px thumbnail, one-line description, and adjacent metadata. The source remains outside the assistant bubble, while the favicon is now a plain icon rather than a nested tile. |

## Required fidelity surfaces

- Fonts and typography: existing SynapseNote font families, weights, line heights, title wrapping, compact metadata, and three-line annotation excerpts remain unchanged or use the same rail typography hierarchy.
- Spacing and layout rhythm: the redundant 44 px rail gap and full-width tab-row divider are gone; the 40 px icon row now starts at the panel top, while Markdown and PDF retain their 44 px identity row plus 40 px contextual tool row. PDF list rows use the existing compact panel padding and scroll rhythm, Pages expands to two columns when space permits, and all panel types share the same persisted width. OpenGraph sources use an 80 px horizontal thumbnail so a preview occupies roughly one compact conversation row instead of a large hero block.
- Colors and visual tokens: the restored icon ToggleGroup continues to use existing border, background, muted, foreground, hover, and selected-state tokens.
- Image and asset fidelity: no raster assets, logos, illustrations, or PDF content were replaced or transformed; Pages uses the PDF renderer's real thumbnails, and standard panel controls use the project's existing Lucide icons.
- Copy and content: no visible tab labels were added. Markdown accessible names remain Chat, Outline, Links, Graph, and Timeline; PDF accessible names are Chat, Pages, Annotations, Outline, and Links. PDF Links is organized as External Links, Backlinks, and Memos; link, bookmark, annotation, and page content comes from the open PDF and project backlink index.

## Final assessment

- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.
- P3 notes: minor typography and icon-spacing differences from the generated concepts intentionally follow the existing SynapseNote tokens, Lucide controls, and restored panel affordance.
- Functional checks: Chat is first in both rails; PDF exposes Pages, Annotations, Outline, and Links after Chat; page thumbnails navigate and form a responsive two-column grid, annotations and memos select their source, bookmarks navigate, external links retain page metadata, backlinks resolve from the open PDF path, and the shared panel toggle works. Switching between Chat and document panels keeps the same rail width. Markdown formatting actions and PDF page/zoom/save controls remain interactive.
- Visual comparison result: the PDF rail preserves the accepted icon-only segmented control, borderless row, panel width, muted token palette, and compact density. PDF Outline now uses the same presentation component as Markdown Outline, and the side-by-side comparison shows no actionable hierarchy or spacing drift. The OpenGraph before/after comparison confirms the source card no longer dominates the Chat rail and still exposes the real thumbnail, title, description, site, and domain outside the answer bubble. The different body content is intentional and PDF-specific. No actionable P0/P1/P2 mismatch remains.

final result: passed

---

# Memo composer and original-text disclosure design QA

## Visual truth and compared implementation

- Source visual truth: `memo-selection/06-installed-long-selection-composer.png`, the previously installed Memo composer that the user identified as under-designed.
- Installed implementation: `memo-flat/01-flat-composer-collapsed.png` and `memo-flat/02-flat-composer-expanded.png` for the writing flow; `memo-flat/03-flat-saved-memo.png` for the saved-memo flow.
- Viewport: 1135 × 768 desktop window, dark theme, visual editor, 83-word / 595-character source selection.
- Full-view comparison evidence: `memo-flat/04-nested-vs-flat-full.png` places the previous nested-card implementation and the flattened installed app state side by side.
- Focused comparison evidence: `memo-flat/05-nested-vs-flat-focused.png` compares the right-rail composer regions at the same scale.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and evidence |
| --- | --- | --- | --- |
| 1 | P2 | The first disclosure threshold showed `Expand` at 240 characters, but a 246-character passage happened to fit the four-line collapsed area, making the control appear to do nothing. | Raised the deterministic threshold to more than 320 characters or six source lines. The final 413-character capture visibly truncates in `01-memo-composer-collapsed.png` and reveals the remaining passage in `02-memo-composer-expanded.png`. |
| 2 | P2 | The original-text passage was rendered as a rounded, tinted card inside the already rounded memo composer, creating unnecessary nested containment. | Removed the inner border, radius, background, icon tile, and divider. The passage is now a flat section on the composer surface, identified only by a thin primary-tinted left rail and compact metadata. The same treatment is visible on saved memos. |

## Required fidelity surfaces

- Fonts and typography: the revised composer uses the existing Inter/JetBrains Mono stack, panel title, text sizes, weights, and line heights. `New memo`, the private-device subtitle, the original-text eyebrow, and body copy form a clear hierarchy without introducing a new type style.
- Spacing and layout rhythm: the composer has one 12 px rounded writing surface, a compact 32 px identity row, a flat source-context section with a thin left rail, an unboxed writing field, and a separated action footer. The focused comparison shows consistent gutters and no clipping or horizontal overflow.
- Colors and tokens: card, muted surface, primary tint, border, focus ring, foreground, and destructive states all use existing SynapseNote semantic tokens in dark mode.
- Image and asset fidelity: no raster or decorative asset was added. The implementation uses the project's existing Lucide `StickyNote`, `Quote`, `Check`, `ChevronDown`, and action icons.
- Copy and content: the composer identifies itself as `New memo`, explains `Private to this device`, labels the attached passage `Original text`, and exposes `Expand / Collapse` only when the source exceeds the threshold.

## Interaction and final assessment

- Verified selection-toolbar Memo → focused composer → collapsed original text → expanded original text.
- Verified the same disclosure behavior after saving a memo, including `Expand original text` and `Collapse original text` accessible names.
- Verified composer and saved-memo passages share the same flat, non-nested source treatment.
- Verified short original text does not receive a redundant disclosure control.
- Temporary QA memo and attached passage were removed after verification; the document was left with zero saved memos and an empty draft.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

final result: passed

---

# Selection memo shortcut design QA

## Visual truth and compared implementation

- Source: the user-provided `SynapseNote Appshot 2026-07-18T11-02-21.811Z.png`, with a multi-line text selection and the existing compact selection toolbar.
- Installed result: `05-installed-memo-button-long-selection.png` verifies the toolbar state; `06-installed-long-selection-composer.png` verifies the resulting Memo panel state.
- Viewport: 1136 × 768 desktop window, dark theme, visual editor, seven-word text selection.
- Full-view comparison: the source attachment and both installed-app screenshots were reviewed in the same implementation turn. The toolbar was legible at full scale, so a separate enlarged crop was not required.

## Fidelity and interaction findings

- Typography: Memo uses the selection toolbar's existing font size, weight, and label treatment and visually matches Ask AI.
- Spacing: the button reuses the existing toolbar button size and `gap-0.5` rhythm; the toolbar remained within the viewport without clipping or overlap.
- Colors: background, border, foreground, muted, hover, and focus styling all come from the existing design tokens.
- Assets: no raster asset was introduced; Memo uses the project's existing Lucide `StickyNote` icon.
- Copy: the visible and accessible action label is `Memo`.
- Interaction: selecting text reveals Memo; activating it opens and selects the Memo tab, attaches the exact selection as a quote, and focuses the memo textarea. The temporary QA quote was removed afterward and no test memo was saved.
- Iteration history: the first installed implementation matched the requested selection-toolbar pattern; no P0, P1, or P2 correction was required.

## Final assessment

- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.
- Functional result: passed in the installed `/Applications/SynapseNote.app`.

final result: passed
