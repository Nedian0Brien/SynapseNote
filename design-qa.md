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

# Craft folder preview, grid, and list design QA — 2026-08-10

## Visual truth and compared implementation

- Preview source: `01-craft-reference.png`; installed result: `20-synapsenote-preview-two-notes-final.png`; combined comparison: `21-preview-reference-final.png`.
- Grid source: `07-craft-grid-reference.png`; installed result: `14-synapsenote-grid-final.png`; combined comparison: `16-grid-reference-final.png`.
- List source: `06-craft-list-reference.png`; installed result: `15-synapsenote-list-final.png`; combined comparison: `17-list-reference-final.png`.
- Viewport: all final implementation captures are 1294 × 768 at device scale 1. The original 2654 × 1596 preview source was normalized to 1294 × 768 with a top-aligned cover crop; grid and list sources were native 1294 × 768.
- State: Craft `Idea` light-theme reference compared with the installed SynapseNote Electron app in light theme. Preview used `brain/wiki/` with four folders and two direct notes; grid and list used `brain/wiki/concepts/` with five documents sorted by modified date descending.

## Findings and iteration history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P2 | Folder cards flattened Markdown into text and used a small title with an edge-to-edge divider. | Rendered GitHub-flavored Markdown in the compact page preview, raised the title to 13 px, and inset the divider within the card padding. |
| 2 | P1 | Masonry placement could fill the shortest column first, so two notes appeared vertically instead of occupying the first row. | Assigned cards to columns cyclically from left to right and stacked only within each column. The final `brain/wiki/` capture shows two direct notes adjacent in the first row. |
| 3 | P2 | The first grid implementation was materially smaller and denser than the Craft reference. | Increased fixed card width to 15 rem and height to 192 px while preserving rendered Markdown content and date sections. |
| 4 | P2 | The first list implementation compressed rows, thumbnails, text, and date columns. | Increased row height, thumbnail size, title and summary type, and date-column width to match the reference hierarchy. |
| 5 | P2 | Grid and list lacked the reference's temporal structure. | Added modified-date groups for the past 7 days, past 30 days, calendar months, and undated items while preserving the active sort order. |

## Required fidelity surfaces

- Typography and hierarchy: preview and grid cards use a 13 px semibold title above a compact rendered Markdown page. List rows use a 13 px title, 10 px one-line summary, and subdued metadata headers.
- Spacing and layout: preview cards use content-derived heights within bounded minimum and maximum sizes, a 240 px track, 12 px gaps, and left-to-right row filling. Grid cards use fixed 15 rem tracks. List rows align their thumbnail, name block, last-viewed, modified, and created columns.
- Colors and chrome: all surfaces reuse existing background, foreground, muted, border, shadow, and focus tokens; no reference-only raster chrome was embedded.
- Assets: list thumbnails and cards are real Markdown renderings from each document, not static screenshots, skeletons, or placeholder drawings.
- Copy and metadata: date-section labels and column names are localized. Existing files have no reliable created-at metadata, so Created displays `—`; Last viewed records subsequent local document opens and otherwise displays `—`.

## Interaction and final assessment

- Verified preview, grid, and list controls switch between their distinct layouts.
- Verified search and sort continue to feed the grouped views and document links remain navigable.
- Verified opening a document records a local last-viewed timestamp used by the list view.
- Focused layout, Markdown normalization, date grouping, card DOM, and folder-overview DOM tests passed; the app TypeScript check passed.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.
- Expected P3 differences: SynapseNote retains its own application shell, repository content, and folder description behavior rather than copying Craft-specific product chrome or data.

final result: passed

---

# Folder gallery row-first layout design QA — 2026-08-10

## Visual truth and compared implementation

- Source visual truth: `01-current.png`, the installed `Research/brain` folder before this correction at 1288 × 768 pixels.
- Installed implementation: `02-row-first.png`, the same folder, viewport, light theme, preview mode, five child folders, and two direct documents after this correction.
- Full-view comparison: `04-before-after.png` places both 1288 × 768 captures side by side at native scale without density resampling.
- A focused crop was unnecessary because the complete affected gallery and both document cards are legible in the full-view comparison; no typography, icon, or asset detail changed.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P1 | CSS multi-column flow placed the second direct document below the first despite enough horizontal space for both cards. | Replaced column-major flow with explicit responsive grid placement. `02-row-first.png` and `04-before-after.png` show the first two documents occupying adjacent horizontal tracks. Later cards retain masonry packing by choosing the shortest column, while source and keyboard order remain left-to-right. |

## Required fidelity surfaces

- Fonts and typography: unchanged; titles, document preview text, wrapping, weights, line heights, and truncation retain the existing SynapseNote treatment.
- Spacing and layout rhythm: the two 176 px paper cards now fill the first row with the existing 12 px gap. Folder tiles, page padding, radii, shadows, and vertical rhythm remain unchanged.
- Colors and visual tokens: unchanged; cards continue to use the existing card, border, foreground, muted, focus, and shadow tokens.
- Image and asset fidelity: this change introduces no raster, decorative, or custom-drawn assets. Existing icons and live document previews are unchanged.
- Copy and content: unchanged. `Work Log` and `간단한 메모` preserve their canonical titles and preview text.
- Responsiveness: the layout contract resolves 364 px to two 176 px cards plus a 12 px gap, and 176 px to one column. The installed wide-screen capture verifies the two-column state.

## Interaction and final assessment

- Verified two direct documents render left-to-right in the installed app.
- Verified all documents retain source DOM order and later documents choose the shortest available column.
- Verified Preview, Grid, and List switching remains covered by the focused folder-overview DOM test.
- Automated evidence: two layout tests and four folder-overview DOM tests passed.
- Installed bundle revision `35be5e9d` passed revision, code-signature, and ASAR integrity verification.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

final result: passed

---

# Craft-style folder gallery design QA — 2026-08-09/10

## Visual truth and compared implementation

- Source visual truth: `craft-idea-height-reference-2026-08-10.png`, captured read-only from the user's open Craft `Idea` window at 1288 × 768 pixels.
- Browser-rendered implementation: `synapsenote-compact-card-height-controlled-2026-08-10.png`, captured from the live SynapseNote app at a 1290 × 768 CSS-pixel viewport and 1× browser density.
- Full-view comparison input: `craft-compact-height-comparison-2026-08-10.png` places the source and implementation side by side without scaling, separated by a 24 px neutral gutter.
- Focused comparison input: `craft-compact-height-focused-comparison-2026-08-10.png` places the source content canvas and SynapseNote folder canvas together at native scale.
- State: light theme, `docs/rfcs/` folder, preview mode, Name A–Z sort, search closed, details closed, and the standard SynapseNote Files shell visible.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P2 | The first rendered gallery produced four broad document columns, while Craft's reference used five narrower paper columns at the same desktop height. | Reduced the preview column measure to 11 rem. The final 1290 × 768 capture presents five columns with comparable density and a matching staggered paper rhythm. |
| 1 | P2 | The first toolbar placed search ahead of the view and sort controls, reversing the reference's scan order. | Reordered the controls to view modes, sort, details, then search. The focused comparison shows the same right-aligned control progression as Craft. |
| 1 | P3 | The title row initially added a separate folder glyph beside the folder name, while the reference used only its circular create action and title. | Removed the redundant title glyph and retained the existing SynapseNote tab breadcrumb as product shell context. |
| 2 | P2 | List mode rendered the correct rows but did not expose the same named Documents region as preview and grid modes. | Wrapped the list in a labelled semantic section. Live browser QA finds one `Documents` region in all three view modes. |
| 3 | P2 | Real RFC documents pushed the first implementation's preview cards to 312–388 px, substantially taller than the 200–260 px paper range visible in the user's updated Craft reference. | Rebalanced content-size and deterministic path variation into a compact 188–260 px contract. The live RFC folder now measures 212–260 px in Preview and a fixed 232 px in Grid; the post-fix comparison restores the reference's above-the-fold density. |

## Required fidelity surfaces

- Typography and hierarchy: the implementation uses SynapseNote's existing sans-serif tokens while matching the reference's compact folder title, bold paper titles, muted document copy, and dense preview hierarchy. Real Markdown headings, lists, code, and paragraphs are reduced to safe, readable preview blocks rather than fabricated document images.
- Spacing and layout: the light canvas, compact header, 11 rem five-column masonry, 12 px card gaps, 13 px paper radii, subtle borders, and low elevation match the Craft reference's density and surface rhythm. Preview cards are bounded to 188–260 px and the current RFC set renders at 212–260 px, replacing the earlier 312–388 px range. Child folders remain compact tiles above documents so canonical folder navigation is preserved.
- Colors and surfaces: background, cards, borders, foreground, muted text, hover, focus, and dark-mode counterparts all use existing SynapseNote semantic tokens. The source's nearly white canvas and restrained gray shadows are preserved in light mode.
- Image and asset fidelity: the reference contains document surfaces rather than standalone raster artwork. The implementation renders live SynapseNote document content and uses the project's existing Lucide icons; no placeholder imagery, custom SVG, emoji, CSS illustration, or fake thumbnail was introduced.
- Copy and content: folder and document names come from the open SynapseNote project. Craft's sample note titles were not copied because they are another application's user data; content density and hierarchy are matched with the current folder's real documents.
- Icons and controls: preview, grid, list, sort, details, search, create, file, and folder controls use one Lucide stroke family, consistent 32 px targets, visible selected states, accessible names, tooltips, and focus rings.
- Responsiveness: live checks at 1290, 900, and 720 CSS pixels retained all 24 document cards with no horizontal document overflow. The gallery adapts from five to three columns while the existing application shell applies its compact sidebar behavior.

## Interaction and final assessment

- Verified Preview, Grid, and List modes; each exposes a selected radio state and the same named Documents region.
- Verified all 24 live Preview cards remain between 212 and 260 px and all Grid cards render at 232 px.
- Verified title/path search, clear-search restoration, Name A–Z, Name Z–A, recently modified, and oldest modified sorting.
- Verified Folder details opens the existing properties, templates, and timeline sheet without crowding the main canvas.
- Verified New document opens the existing creation dialog with `docs/rfcs` as its initial directory; no QA document was created.
- Verified the live browser emitted zero error-level console entries. One unrelated Claude Desktop integration timeout warning fell back to its existing local-storage guard.
- Accepted product-shell differences: SynapseNote retains its Files sidebar, document tab bar, Share/Settings/Resources actions, child-folder navigation, and bottom Ask Claude composer. Those surfaces were explicitly preserved while only the folder content view adopted the Craft gallery language.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

final result: passed

---

# Full-page database record breadcrumb design QA

## Visual truth and compared implementation

- Source visual truth: user attachment `Screenshot 2026-07-27 at 4.10.34 AM.png`, cropped to the full-page record header at 447 × 57 pixels.
- Browser-rendered implementation screenshot: temporary artifact `synapsenote-breadcrumb-full.png`, captured from the live app at a 973 × 946 pixel browser viewport.
- Focused implementation evidence: temporary 447 × 44 crop `synapsenote-breadcrumb-focused.png`.
- Combined comparison input: `synapsenote-breadcrumb-final-comparison.png`, with the 447 × 57 source and 447 × 44 implementation crop at native pixel size. No density normalization was applied.
- State: dark theme, full-page database record named `asdf`, database and source both named `Untitled database`.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P2 | The header rendered the equal database and source names as two adjacent `Untitled database` segments, creating a false hierarchy, and both ancestors were display-only. | Adjacent database/source labels are now compared case-insensitively after trimming and collapsed to one segment when equal. Explicit database breadcrumb segments render as canonical links. The combined comparison shows one ancestor, followed by the unchanged `asdf` current-page title and `MD` badge. |

## Required fidelity surfaces

- Fonts and typography: the existing 12 px muted breadcrumb, 13 px medium page title, and compact `MD` badge remain unchanged.
- Spacing and layout rhythm: removing the duplicate segment shortens the hierarchy without changing the 44 px header row, separators, gaps, or title alignment.
- Colors and visual tokens: link, hover, title, badge, border, and background use the existing foreground and muted semantic tokens.
- Image and asset fidelity: no image asset was added or replaced; the existing Lucide breadcrumb separator remains unchanged.
- Copy and content: the duplicate `Untitled database` label is removed. The remaining label, `asdf` title, and `MD` badge reflect the live record identity.

## Interaction and final assessment

- The live DOM exposes exactly one `Untitled database` link.
- Clicking the link navigated to the remembered database, source, and view hash.
- The current record title remains non-interactive, following the breadcrumb current-page convention.
- The final record-page reload produced zero new error-level console entries.
- Automated evidence: 27 focused breadcrumb, toolbar, and full-page record DOM tests passed.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

final result: passed

---

# Select and Multi-select cell picker design QA

## Visual truth and compared implementation

- Source visual truth: the user-provided dark database picker screenshot with selected tags, a direct text caret, creation guidance, and draggable option rows.
- Implemented state: a local QA capture from the live SynapseNote database fixture with three selected options and the picker open.
- Full-view comparison input: the source and implementation placed on matching 1280 × 720 canvases.
- Focused comparison input: native-scale crops of the two open picker panels placed together for component-level judgment.
- State: dark theme, Multi-select cell editor open, three selected colored tags, empty but focused creation input, guidance copy, and three reorderable option rows.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P1 | The first implementation only searched existing values, so it could not reproduce the reference's input-to-create flow. | Added a canonical atomic mutation that creates the schema option and assigns it to the current Select or Multi-select record in one reviewed desired-state plan. Live QA created `Blocked`, `Waiting`, and `In Progress`; each appeared immediately in the cell and persisted after refresh. |
| 2 | P2 | The initial editor used a search icon, rounded pills, and selection checks that did not match the direct-input reference. | Removed the search chrome and checks, switched to compact squared tags with inline remove actions, and matched the reference's 19 rem panel, divider, guidance row, six-dot drag handles, and dense option list. The focused comparison shows the resulting component at native scale. |
| 3 | P1 | The first runtime pass did not expose the schema reorder callback through the final workspace render context, leaving drag handles disabled. | Wired creation and reordering through canonical workspace and inline database controllers. Live keyboard QA moved `Waiting` above `Blocked`, closed the editor, reopened it, and verified the order remained persisted. |

## Required fidelity surfaces

- Typography: selected tags, guidance copy, create row, and option labels use the existing SynapseNote text sizes, weights, and line heights. The hierarchy matches the source without introducing a new type style.
- Spacing and layout: the picker is 19 rem wide with a wrapping selected-tag/input region, one separator, compact guidance, and 32 px option rows. The live panel overlays the edited cell and remains inside the viewport.
- Colors and tokens: new options rotate through the existing database option palette. Panel, border, foreground, muted, hover, focus, and tag colors all use existing semantic tokens.
- Assets: remove, create, and drag controls use the existing Lucide `X`, `Plus`, and `GripVertical` icons. No raster placeholder, handcrafted SVG, emoji, or CSS-drawn asset was introduced.
- Copy: the empty input exposes `Type to select or create`; the menu guidance is `Select or create an option`; a non-matching query exposes a `Create “…”` action.

## Interaction and final assessment

- Verified Select click opens the picker; creating `In Progress` replaces the existing single value and closes the editor after the atomic save.
- Verified Multi-select click opens the picker with all current tags; creating `Blocked` and `Waiting` preserves existing values and assigns each new option immediately.
- Verified tag remove plus Tab commits the deselection, and selecting the option again restores it.
- Verified Arrow-key navigation, Enter selection/creation, Backspace removal, Escape cancellation, Tab commit, mouse selection, and keyboard option reordering in focused DOM tests.
- Verified option reordering persists after closing and reopening the live picker.
- Verified the clean post-restart browser session emitted zero error-level console entries.
- Verified the app TypeScript check and nine focused picker/table DOM tests pass.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

final result: passed

---

# Notion-style database side peek design QA — 2026-07-26

## Visual truth and compared implementation

- Source visual truth: a local native Notion dark-mode side-peek reference captured at 1179 × 768 pixels.
- Implementation: the local SynapseNote database side peek captured at a 1280 × 720 CSS-pixel viewport and 1× browser density.
- Full-view comparison: each source is centered on its own 1280 × 768 dark canvas without stretching; the Notion capture receives 50/51 px horizontal padding and the SynapseNote capture receives 24 px vertical padding.
- Focused comparison: the native right panels are cropped at 591 × 768 and 636 × 720, then aligned on separate 640 × 768 canvases without scaling.
- State: dark theme, database row selected, side peek open, empty editable body, empty properties visible, comments composer visible, and the panel restored near its half-window default width.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P2 | The first implementation exposed a visible custom grip on the panel boundary and kept a bottom row of utility actions that do not appear in the Notion side peek. | Removed the grip and all boundary ornamentation, retained only the invisible boundary hit area, and hid the non-Notion utility row on this surface. |
| 2 | Passed | The revised panel matches the reference hierarchy: compact top toolbar, large title, property rows, add-property action, comments section, divider, and directly editable page body. | Full and focused comparison inputs show no remaining P0, P1, or P2 mismatch. The boundary is visually plain while remaining draggable. |

## Required fidelity surfaces

- Typography: title scale and weight, compact toolbar labels, muted property values, comments heading, and empty-body prompt follow the existing SynapseNote font stack while matching the Notion hierarchy.
- Spacing: the side peek uses a half-window document surface, compact header, generous document gutters, aligned property label/value columns, and a single comments divider. No visible resize control consumes layout space.
- Colors: background, foreground, muted text, borders, focus, and action surfaces use existing dark-theme semantic tokens. The focused comparison shows equivalent contrast and visual depth to the reference.
- Assets: the surface contains no raster product imagery. Existing Lucide icons are used for navigation, properties, comments, history, and agent actions; no custom SVG, emoji, CSS drawing, or placeholder asset was introduced.
- Copy: database and record names remain canonical data. Empty property, comments, and editable-body prompts are concise equivalents of the reference behavior.

## Interaction and functional verification

- Typed into the side-peek editor, waited for persistence, closed the peek, reopened it, and confirmed the content remained editable in place without navigating to the full-page editor. The QA text was then removed and the empty Markdown body was verified on disk.
- Dragged the unadorned left boundary from a 640 px panel to 706 px. The panel stayed open, the editor stayed mounted, and the database URL/hash did not change.
- Closed and reopened the side peek and confirmed the 706 px width persisted. The panel was then restored near its half-window default for the final comparison.
- Confirmed the resize separator has no visible child/grip while retaining an accessible separator role and keyboard resizing support.
- A clean full reload emitted no browser console warning or error while opening the inline editor.

## Final assessment

- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.
- P3 findings: none required for this scope.

final result: passed

# Database row-handle action menu design QA

## Visual truth and rendered implementation

- Source visual truth: the user-provided selected-row hover-handle screenshot.
- Rendered implementation capture: the local database row-handle QA capture.
- Source pixels: 908 × 368. Implementation pixels and CSS viewport: 551 × 758 at device scale factor 1. No density normalization was applied because the captures do not show the same viewport or interaction state.
- State: the source shows the selected-row hover handle and tooltip; the implementation capture shows the same database table before the handle/menu interaction state could be captured.

## Findings

- [P2] A matching rendered interaction-state comparison is unavailable.
  Location: database table row interaction rail.
  Evidence: the source visibly shows the row handle, while the saved implementation capture only shows the resting table state. During the final capture attempt, concurrent repository changes introduced a missing `DATABASE_CONDITIONAL_COLOR_CLASSES` export and the local app stopped rendering.
  Impact: typography, spacing, colors, icon treatment, tooltip copy, and menu placement cannot be signed off visually from equivalent evidence.
  Fix: restore the unrelated table-grid export/build, then capture the implementation with the row handle hovered and its click menu open at a viewport matching the source.

## Required fidelity surfaces

- Fonts and typography: blocked for the handle tooltip and action menu because the implementation interaction state is absent.
- Spacing and layout rhythm: blocked for handle-to-row alignment and menu placement; the resting table layout rendered without visible clipping before the unrelated build failure.
- Colors and visual tokens: blocked for hover, selected, and open states; implementation uses the existing semantic component tokens in code.
- Image and asset fidelity: no raster asset was introduced; the implementation reuses the existing interaction-handle element and Lucide action icons.
- Copy and content: DOM tests verify `Open page actions for …`, the menu label, and Open, Inspect context, Ask agent, Duplicate, Archive/Restore, Move, and Delete items, but visual copy fidelity remains blocked.

## Comparison history and interaction evidence

- Iteration 1: source and implementation were opened in the same comparison input. The captures were not state- or viewport-matched, so no visual pass was claimed.
- Functional DOM coverage passed for handle click, menu opening, selection checkbox separation, drag reordering, and all expected action items.
- App typecheck and targeted formatter/linter checks passed before concurrent unrelated changes. The later desktop check was blocked by `DatabaseTableDialog.tsx` importing a missing `DATABASE_CONDITIONAL_COLOR_CLASSES` export from `DatabaseTableGrid.tsx`.
- Browser console verification is blocked by that same unrelated live-app build failure.

## Implementation checklist

- Restore the unrelated table-grid export/build.
- Re-run the live app and capture the hovered handle plus open menu at the source viewport and state.
- Compare the source and revised implementation together and resolve any P0/P1/P2 visual differences.

final result: blocked

---

# PDF highlight note and annotations panel design QA

## Visual truth and compared implementation

- Source visual truth: the accepted option-1 direction revised to include the PDF Annotations panel.
- Implementation screenshot: the local PDF highlight and annotations implementation capture.
- Viewport: 1280 × 720, dark theme, PDF page 2, blue highlight selected, Annotations tab open.
- State: the selected highlight contains the source text `discrepancy` and the attached memo `불일치, 차이, 어긋남`; the editor is open above the exact PDF location.
- Comparison evidence: the complete reference mock and implementation screenshot were placed together in one comparison input at original resolution. The popup, selected annotation row, source quote, attached memo, panel header, count, and color accents were all visible simultaneously.
- Focused evidence: a separate crop was unnecessary because both images keep the complete popup and the entire right rail legible at the same time.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and evidence |
| --- | --- | --- | --- |
| 1 | P1 | Highlight annotations with an attached memo collapsed to a single contents string, so the source sentence disappeared from the right rail. | Split highlight presentation into source and memo semantics. New SynapseNote highlights read source text from `subject` (or the stored selection), render it as a quote, and render `contents` as a separate note line. Legacy highlights without separate source metadata continue to show their existing text as the quote. The implementation screenshot shows both `“discrepancy”` and `불일치, 차이, 어긋남` in the selected row. |
| 1 | P2 | The annotation editor was an unlabeled compact box with color dots, textarea, and icon-only actions but no clear hierarchy. | Added a highlighter/memo identity header, close action, visible Color label, selected-color ring, larger writing area, keyboard hint, destructive action, and visible Save button on one restrained popover surface. |
| 1 | P2 | Annotation rows had little hierarchy and no stable list-level title/count or selected state. | Added the shared panel header and count, thin annotation-color rail, row separators, compact type/page metadata, source quotation, distinct attached-note line, and a token-based selected-row background. |

## Required fidelity surfaces

- Fonts and typography: the implementation keeps SynapseNote's Inter and JetBrains Mono stacks, existing panel title/count treatment, compact annotation metadata, 12 px body excerpts, and 14 px editor title. Source text is visually primary; attached memo text is muted and separated without introducing a new type family.
- Spacing and layout rhythm: the editor uses a 320 px single surface with 12 px padding, a 20 px identity row, labeled color row, 80 px minimum textarea, and compact action footer. The panel uses full-width rows, consistent 12 px gutters, 12 px vertical padding, and a single separator between items.
- Colors and visual tokens: popup surface, textarea, borders, foreground, muted copy, focus treatment, hover state, selected-row tint, and count badge use existing semantic tokens. The five existing PDF highlight colors drive the picker, highlight icon, and annotation accent rail.
- Image quality and asset fidelity: no raster or handcrafted icon was introduced. The PDF remains the real rendered document, and highlighter, note, close, delete, and annotation symbols use the existing Lucide icon library.
- Copy and content: the editor is titled `Highlight note`, labels the color control, keeps `Add a memo`, exposes `Save`, and preserves existing accessible names. Highlight entries show the exact captured source text and attached memo together; independent memos continue to show memo content without a fabricated quote.

## Interaction and final assessment

- Verified clicking an annotation scrolls to the exact annotation rectangle, selects the row, and opens the matching editor.
- Verified the editor exposes five colors, indicates the current color, supports Command/Ctrl+Enter, saves changed memo text, deletes the annotation, and closes through the explicit close control.
- Verified the Annotations header count is 7 for the copied SPIKE test document.
- Verified the selected page-2 highlight shows both source and attached memo, while independent page-1 memos remain content-only.
- Browser console errors relevant to this UI: none.
# Notion database visual-parity and undo-feedback design QA

## Visual truth and compared implementation

- Source visual truth: the user-provided Notion dark-mode database screenshot with an unboxed title/property grid, sparse row separators, `Aa` title typing, a flat `+ 새 페이지` row, and a primary split create action.
- Installed-layout candidate: captured from the local desktop web runtime in dark mode after the final interaction pass.
- Direct comparison: the Notion reference and SynapseNote implementation placed at the same output width.
- Viewport: 1280 × 720 desktop editor. The database is an inline document block, so surrounding editor chrome and the available content width intentionally differ from Notion's full-page reference.

## Findings and resolutions

| Severity | Finding | Resolution and evidence |
| --- | --- | --- |
| P1 | `One database change can be undone` occupied a full-width persistent banner and shifted the table whenever mutation history changed. | Removed visible mutation-history chrome. Save/history announcements remain screen-reader-only; undo/redo remain available through Command-Z / Command-Shift-Z and the split action menu. Browser inspection confirmed no visible matching text. |
| P1 | The previous inline action dropdown could remain closed inside the editor NodeView even though its trigger received clicks, making many toolbar actions appear inert. | Replaced the action surface with one controlled Popover, native menu-item buttons, explicit open state, and deferred hand-off into filter/sort/property dialogs. The final browser pass opened the menu, selected `Filters`, rendered the filter controls, and kept the database surface ready. |
| P1 | Global ProseMirror Markdown-table selectors leaked borders, backgrounds, padding, and collapsed-border geometry into the database grid. | Added a database-surface-scoped table reset and made database primitives the only owner of property separators, row separators, sticky Title geometry, and backgrounds. |
| P2 | Default ProseMirror heading margins moved the database title below the toolbar. | Scoped the inline title margin and line-height reset. Final measured top coordinates are identical: title `344.078125 px`, toolbar `344.078125 px`. |
| P2 | The table read as a boxed spreadsheet rather than Notion's document-native database. | Removed the outer box/radius, reduced dense cell chrome, used sparse horizontal separators, added `Aa`/property-type labels, flattened the new-page row, and moved property insertion into a labeled `+ Add property` header. |

## Required fidelity surfaces

- Typography: title, property headers, row labels, and new-page copy use the existing SynapseNote sans stack at Notion-like compact sizes and weights; the Title type indicator is rendered as `Aa`.
- Spacing and geometry: the title and toolbar share one baseline; the first structural column starts at the table edge; header and record rows are compact; no selector column consumes grid width.
- Overflow: browser measurements report `overflow-x: auto`, `clientWidth: 511`, and `scrollWidth: 604`, confirming that wide properties remain reachable without shrinking or clipping Title.
- Colors and borders: backgrounds, foregrounds, primary blue, muted text, hover states, and focus states use semantic tokens. Property dividers and row separators are intentionally quiet and the enclosing box is absent.
- Icons and controls: the toolbar uses the existing Lucide expand/settings icons and a primary New split button. The menu exposes Filters, Sort, Properties, Search, view management, history, and destructive removal without adding permanent chrome.
- Copy: the persistent undo sentence and `Undo change` banner action are absent from the document. `New`, `New page`, and `Add property` remain concise and context-appropriate.

## Interaction and final assessment

- Verified the database reports `data-database-view-state="ready"` before and after opening the action menu and filter popover.
- Verified Filters opens from the split menu and the table remains visible instead of collapsing into a loading placeholder.
- Verified the action menu has a bounded scroll area so all secondary actions remain reachable in a short viewport.
- Verified the visible undo banner is absent while keyboard/menu undo semantics remain covered by DOM tests.
- Verified 33 focused database DOM tests pass, including view continuity, horizontal scroll ownership, property reconciliation, offline refresh, HTTP 409 refresh, and inline history behavior.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

final result: passed

---

# Notion-style inline database row selection QA

## Visual truth and compared implementation

- Source visual truth: the user-provided Notion table screenshot with two selected rows.
- Pre-fix layout evidence: a local capture showing the first compact toolbar implementation consuming its own row and pushing the table downward.
- Full implementation capture: the local database row-selection implementation capture.
- Normalized source: the source normalized for same-scale comparison.
- Focused implementation crop: the focused local implementation crop.
- Same-input comparison: the normalized Notion reference and focused SynapseNote result placed side by side.
- Dimensions and density: the source is 1188 × 540 device pixels at 2× density and was normalized to 594 × 270 CSS pixels. The implementation is a 1280 × 720 browser capture at 1×; its 594 × 270 focused crop therefore compares at the same effective scale.
- State: dark theme, inline database table, two loaded rows selected, compact selection toolbar visible, pointer hover absent, and the Ask AI composer collapsed.
- Full-view evidence checks the selection treatment within the surrounding editor chrome. The focused comparison is also required here because checkbox offsets, toolbar segmentation, row tint continuity, and table-cell borders are the deciding details.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P1 | SynapseNote exposed only a hovered row selector and replaced the database toolbar with a full-width selection banner, while Notion keeps a persistent checkbox rail, compact segmented actions, and selected-row tint in place. | Added an external persistent selection layer aligned to the header and rows, retained the database table geometry, introduced the compact segmented action bar, and painted every selected cell. The focused comparison shows the toolbar and checkbox rail at the same relative offsets as the reference. |
| 2 | P2 | The first comparison showed the sticky Title cell retaining the page background while the remaining selected cells were blue, breaking the continuous Notion row treatment. | Added a sticky-cell-specific selected-state rule at the required cascade specificity. Browser-computed styles now report the same selected background for all five cells in both selected rows, and the final comparison shows an uninterrupted tint. |
| 3 | P1 | The compact toolbar was still rendered as a new block between the database header and table, so beginning a selection pushed the complete table downward. | Moved the toolbar into the header's fixed 36 px primary slot, replacing the database title only while selection is active. Live geometry is identical before and after selection: the header remains 60 px high and table content starts at a 60 px surface offset in both states. |
| 4 | P1 | Entering the empty checkbox position directly did not reveal the control because the hidden interaction layer had no pointer target and row detection only listened inside the table host. | Added bounded pointer hit-testing for the 20 px selection rail, with a 4 px usability allowance, before querying row geometry. A direct browser pointer move from outside the database now resolves the intended row, reveals the checkbox to opacity 1, and selects it successfully. |

## Required fidelity surfaces

- Fonts and typography: the existing SynapseNote type stack remains unchanged. The selected count, property names, page titles, and new-page label use the existing sizes and weights while matching Notion's compact hierarchy.
- Spacing and layout rhythm: the comparison aligns the toolbar, header checkbox, row checkboxes, table edge, row borders, and new-page baseline. The action bar reuses the fixed title slot instead of adding document flow height, while row selectors remain outside the table tracks, so neither vertical table position nor column widths shift.
- Colors and tokens: selected rows use a primary/background mix in both light and dark themes; checkboxes use the existing primary token; the toolbar uses existing popover, border, foreground, and muted tokens.
- Image and asset fidelity: no raster asset was introduced. Existing Lucide icons provide the selection actions and page/property visuals.
- Copy and content: the reference's property-specific selection actions are not valid SynapseNote commands. The implementation therefore preserves the existing `Open bulk actions`, `Inspect selected context`, and `Clear selection` semantics inside the Notion-matched segmented shell.

## Interaction and final assessment

- Verified selecting one page creates the persistent row/header controls and a mixed select-all state, then selecting the header expands selection to both loaded rows.
- Verified the toolbar count updates from one to two and the selected rows expose checked, accessible `Deselect page …` controls.
- Verified the selected background is continuous across sticky and non-sticky cells for both rows.
- Verified clearing and restoring selection keeps the header at 60 px and the table content at the same 60 px offset from the database surface; the toolbar is a descendant of the header's primary slot.
- Verified entering the empty checkbox rail directly reveals the correct row checkbox without first hovering the row; activating it selects one row and displays the header action bar.
- Verified no new console error was emitted by the selection interactions. The development page retains unrelated pre-existing bootstrap diagnostics for frozen headers and lifecycle `flushSync` calls.
- A concurrent HMR update briefly exposed an unrelated `DocumentProvider` ordering crash; a clean reload recovered the app shell and database, and the error did not recur during the final selection pass.
- Targeted DOM tests, style-contract tests, app typecheck, and `bun run check:desktop` pass.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

final result: passed

---

# Chat tool activity icon design QA

## Visual truth and compared implementation

- Source visual truth: a local capture of the installed SynapseNote chat panel before this change.
- Implementation screenshot: the local chat-tool QA capture.
- Combined comparison: the source and implementation chat rails placed together.
- Viewport: 1280 × 720 for the rendered implementation; the chat rail itself is 390 × 660. The installed source capture is 487 × 289 and was enlarged to the same 390 px rail width for comparison.
- State: light theme with completed web-search, workflow, shell-command, and file tools plus a failed shell command.
- Full-view evidence: the combined comparison places the existing installed rail and the updated rendered rail in the same input.
- Focused evidence: no separate crop was needed because both sides of the comparison isolate the complete chat rail at the same width and make the leading and trailing icons legible.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and evidence |
| --- | --- | --- | --- |
| 1 | P2 | Completed activities used the leading icon slot for a status check, so users could not distinguish a web search, workflow, command, or file operation at a glance. | The leading slot now always identifies the tool type. The completion check or failure alert sits immediately after the result text. The implementation screenshot and DOM inspection confirm `web_search`, `workflow`, `command`, and `file` icons with adjacent `completed` or `failed` status icons. |

## Required fidelity surfaces

- Fonts and typography: the existing Inter stack, 12 px activity label, 11 px summary, weights, line heights, truncation, and title behavior are unchanged.
- Spacing and layout rhythm: the existing left rail, row gaps, summary indentation, disclosure chevron, and maximum width remain unchanged. The status icon uses a compact 4 px gap after the result text and remains visible when long text truncates.
- Colors and visual tokens: completed checks continue to use the existing primary color and completion animation; failed rows and alerts continue to use destructive tokens; tool-type icons inherit the row color.
- Image quality and asset fidelity: no raster or handcrafted icon asset was introduced. Web, workflow, command, file, generic tool, completion, and failure symbols use the existing Lucide icon library.
- Copy and content: activity labels, separators, result text, summaries, and details are unchanged. Only icon semantics and placement changed.

## Interaction and final assessment

- Verified all five tool rows render the expected tool-type and status attributes.
- Verified completed status icons follow the result text, including `workflow · completed` and shell command completion.
- Verified failed shell commands keep a terminal icon on the left and place the alert after `failed`.
- Verified the workflow disclosure opens and exposes its complete detail.
- Browser console warnings/errors: none on the isolated implementation route.
# Notion inline database continuity and table-parity QA

## Visual truth and compared implementation

- Source visual truth: the user-provided Notion database reference captured at 1178 × 768 pixels.
- Installed implementation: captured from the rebuilt local macOS application at 992 × 768 pixels after installation and relaunch.
- Component implementation evidence: `packages/app/tests/visual/database-table-underfilled-geometry.e2e.ts-snapshots/database-table-two-property-underfilled-darwin.png` at 695 × 236 pixels and `packages/app/tests/visual/database-table-underfilled-geometry.e2e.ts-snapshots/database-table-two-property-row-hover-darwin.png` at 723 × 236 pixels.
- Full-view comparison input: the unscaled 1× Notion reference and installed SynapseNote capture in one vertical comparison. The windows differ in width and theme, so this input was used only for overall document/database placement and density, not color or one-pixel measurements.
- Focused comparison input: a 760 × 215 source database crop, the light-theme implementation baseline, and the light-theme row-hover state in one input. Implementation captures were proportionally resized to 760 pixels wide solely to normalize comparison scale; no crop, stretch, or density conversion was applied within each component capture.
- CSS viewport and density: the visual fixture ran at 1440 × 900 CSS pixels with device scale factor 1. The source and installed desktop captures are 1× macOS captures. The focused comparison records the exact source/implementation pixel dimensions above.
- State: table layout, two visible properties, populated rows, new-page row, and row-hover selector/action state. The source represents a Notion page database while the implementation represents an inline SynapseNote linked view; database names and record copy intentionally differ.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P1 | Switching a saved view changed the read-surface identity, rendered a full `Loading linked view` branch, and keyed the renderer by the active view ID. A normal view change could therefore replace the entire database subtree and collapse the block until the request completed. | Split stable surface identity from exact result identity, retained the last compatible ready state while the requested view resolves, tracked the `resolvedViewId` that produced visible rows, removed view-derived renderer keys, eagerly loaded inline renderers, and removed visible Suspense/loading fallbacks. The saved-view transition DOM test proves the same ready surface remains visible and updates in place. |
| 2 | P1 | The original inline selector track either consumed horizontal space and shifted Title right or, when collapsed to zero width, depended on table overflow that clipped the hover selector. | Added a real 24 px interaction track and moved that track into the document-side gutter with a negative owner margin. Title begins at the same property-grid edge, while the selector is painted inside a nonzero track outside that edge. The hover capture shows the grip to the left of the table grid, and geometry assertions verify the track, gap, icon bounds, opacity, and vertical centering. |
| 3 | P2 | The table used an enclosing rounded border, uppercase/letter-spaced headers, taller rows, and a far-right actions column, producing a denser spreadsheet-like surface than the Notion reference. | Removed the enclosing table chrome, standardized Notion-surface rows and headers at 34 px, changed headers to 12 px/500 weight with normal casing and tracking, moved hover actions into the title cell, and kept faint single-pixel grid separators. The focused baseline and hover comparison show the revised hierarchy and density. |
| 4 | P2 | The first hover implementation used a nearly invisible checkbox and its zero-width overflow was absent from the actual cropped visual evidence. | Replaced the unselected checkbox glyph with the existing Lucide grip handle, kept checked state and checkbox semantics for multi-selection, and expanded the hover screenshot clip to include the document-side gutter. The final hover snapshot visibly contains both the block handle and row-selection grip without moving the Title column. |

## Required fidelity surfaces

- Fonts and typography: the implementation uses the existing Inter-based SynapseNote UI stack. Database title, 12 px/500 property headers, 14 px page values, 34 px row line height, normal letter spacing, truncation, and muted secondary values were compared in the focused input. No actionable weight, wrapping, or hierarchy mismatch remains within the table region.
- Spacing and layout rhythm: the table has a 24 px external interaction gutter, a stable property-grid edge, 34 px header/data/new-page rows, no enclosing rounded table card, and single-pixel separators. Toolbar and view controls remain part of SynapseNote's inline linked-view mode; the source is a Notion page database, so the additional saved-view tab is an intentional product-mode difference rather than a table-geometry defect.
- Colors and visual tokens: the focused light-theme comparison uses existing background, foreground, muted, border, primary, hover, and focus tokens. The dark installed capture confirms the same geometry through semantic tokens; it was not used to claim light-theme color equivalence.
- Image quality and asset fidelity: the database surface contains no raster product imagery. Existing Lucide database, property, page, filter, sort, search, open, more, and grip icons are rendered as the project's standard vector icon components; no handcrafted SVG, CSS drawing, emoji, or placeholder asset was introduced.
- Copy and content: user records, database names, property names, and view names remain canonical data. Visible loading copy (`Loading linked view`, `Loading table renderer`, and the full-workspace loading overlay) was removed; error and permission copy remains because those are actionable terminal states rather than transient view changes.

## Interaction and functional verification

- Saved-view changes retain the same compatible ready surface while the next description/query resolves; the visible renderer follows `resolvedViewId` until the new result is ready.
- Same-layout view changes no longer receive a React key derived from the saved view ID, so table focus, selection, scroll state, and mounted identity can survive the transition.
- The row grip is outside the property grid, appears on hover/focus, retains `role="checkbox"` and `aria-checked`, and exposes a visible checked state.
- Open and more-actions controls appear inside the title cell on row hover; filters, sort, properties, search, new-page, open-full-database, and view controls retain their existing handlers.
- Visual geometry was verified at normal size, 150% zoom, and a narrow overflowing viewport with one horizontal scroll owner.
- Browser console check: the visual run emitted no application error. The fixture emitted the existing non-blocking frozen-table-header warning because the isolated fixture has no editor scroll container.
- Automated evidence: 41 targeted DOM tests, 7 pure identity/geometry tests, the focused visual regression, app typecheck, production build, size limits, `check:desktop:local`, and the 2,495-test desktop suite passed. The local installer validated ASAR integrity and code signing before launching the installed app.

## Final assessment

- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.
- P3 follow-up: Notion's page-database header can hide or rearrange saved-view chrome differently from SynapseNote's inline linked-view mode. That mode-level difference remains intentional; the table geometry, density, hover selection, and non-blocking transitions covered by this task have no remaining actionable mismatch.

final result: passed

---

# Inline database title-column alignment QA

## Visual truth and compared implementation

- Source visual truth: the installed 1299 × 768 SynapseNote screen showing the unexplained blank selector gutter before Title.
- Installed implementation: captured from the rebuilt local macOS application through its local web surface.
- Viewport and density: both captures are 1299 × 768 pixels at a 1299 × 768 CSS viewport and 1× browser capture density; no density normalization was required.
- State: light theme, README visual editor, Repository layout section, second inline Untitled database table, two populated rows and the new-page row.
- Full-view comparison evidence: both source and installed captures were opened together in one comparison input. The installed table removes the blank leading gutter while preserving column widths, row density, toolbar hierarchy, and surrounding document layout.
- Focused comparison evidence: a separate crop was not required because the full-view table header and rows are legible. Browser geometry measured the selector track at 0 px, the Title edge 0.5 px from the table edge, and the Title content inside its cell in both inline tables.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P1 | Inline tables reserved a permanent 28 px selector column while rendering its checkbox transparent, so Title appeared shifted right behind an unexplained gutter. | Collapsed the inline selector track to 0 px, pinned Title at `left-0`, and positioned the checkbox as a hover/focus overlay on the title icon. Installed-app geometry reports a 0 px selector and a 0.5 px table-to-Title edge difference. |

## Required fidelity surfaces

- Fonts and typography: Title, property labels, page titles, and the new-page placeholder keep the existing SynapseNote font family, weight, size, line height, truncation, and icon treatment.
- Spacing and layout rhythm: the only structural spacing change is removal of the 28 px invisible selector gutter. Header, populated rows, and the new-page row now share the same visual left edge; property widths, row heights, borders, and toolbar spacing remain unchanged.
- Colors and visual tokens: the selector overlay uses existing background, input-border, primary, foreground, hover, and focus tokens. No new color value was introduced.
- Image and asset fidelity: no raster asset, logo, illustration, or custom icon was added. Existing Lucide property and page icons remain in use and are replaced by the selector only during selection interaction.
- Copy and content: no label or page content changed. Accessible selection names remain `Select all loaded pages` and `Select page …`.

## Interaction and final assessment

- Verified both inline selector tracks render at 0 px and both Title header edges align with their table edges within 0.5 px.
- Verified the overlaid row selector checks and unchecks the target page, remains visible while focused or selected, and restores the original unselected state after QA.
- Verified the existing inline-table DOM tests still keep the table mounted across view and schema changes.
- Verified no browser console errors were emitted during geometry and selection checks.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

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

---

# Notion-style database side peek editing design QA

## Visual truth and compared implementation

- Source visual truth: the user's Notion side-peek reference.
- Implemented state: captured from the live SynapseNote database fixture after the changes.
- Combined comparison input: the 1280 × 720 normalized source placed above the 1280 × 720 implementation.
- State: dark theme, half-width right side peek, page title, empty properties, inline comments, empty editable page body, and no visible resize grip.

## Findings and comparison history

| Iteration | Severity | Finding | Resolution and post-fix evidence |
| --- | --- | --- | --- |
| 1 | P1 | The side-peek ProseMirror inherited the global `-2.5rem` drag-handle margin while the peek override removed the matching padding, placing page text left of the title and property gutter. | Reset the peek editor margin and retained a page-height editing surface. Browser geometry measured the title and editor text origins at the same x-coordinate with a 0 px delta. |
| 2 | P1 | `Add comment` opened the legacy comments dialog, interrupting the document flow. | Replaced it with a persistent Notion-style inline composer with avatar, borderless expanding input, attachment/mention affordances, Enter-to-submit, circular send action, conflict refresh, inline error state, and immediate thread rendering. Two comments were posted through the live API and remained visible without closing the peek. |
| 3 | P1 | `Add a property` navigated to the full database instead of editing in context, and the first direct-mutation attempt used a principal identifier that the human direct-safe policy did not recognize. | Added a side-peek anchored property popout, routed creation through the canonical draft/plan/commit mutation gateway using the existing local-human policy identity, refreshed the described schema in place, and verified a Date property appeared in the still-open peek and canonical describe response. |
| 4 | P2 | `Back to database view`, the duplicate bottom `Open full page`, and `Advanced machine IDs` consumed the page-content area and had no equivalent in the Notion reference. | Removed the entire legacy footer and expanded the editable body to occupy the remaining page flow. The toolbar retains the compact full-page icon and breadcrumb navigation. |

## Required fidelity surfaces

- Typography and hierarchy: title, property labels and values, `Comments`, comment author/body, placeholder, and page-body text use the existing SynapseNote typography tokens with the same document-first hierarchy as the source.
- Spacing and layout: the title, properties, comment section, divider, and editor share one 44 rem content column. The editor text has a measured 0 px gutter delta from the title. The footer is absent and the editor owns at least 18 rem of vertical page space.
- Colors and chrome: the implementation uses existing background, foreground, muted, border, primary, popover, focus, and error tokens. Comments are flat in the page flow; the only separator is the subtle horizontal rule used by the source.
- Assets: the flow uses the existing Lucide user, paperclip, mention, send, property-type, and toolbar icons. No raster placeholder, handcrafted SVG, CSS drawing, or emoji substitute was introduced.
- Copy: visible controls use `Add a property`, `Comments`, `Add comment`, and the existing page-writing prompt. Internal machine identifiers and navigation copy no longer appear in the page body.

## Interaction and final assessment

- Verified the toolbar Comments action scrolls to and focuses the inline composer.
- Verified typing and posting a page comment keeps the side peek open and immediately renders the saved comment.
- Verified the property popout opens in place, exposes name and type selection, creates a canonical property, closes on success, and refreshes the side-peek schema without full-page navigation.
- Verified the invisible left boundary remains pointer- and keyboard-resizable without adding a visual drag handle.
- Verified the clean final in-app Browser tab emitted zero error-level console logs.
- Automated evidence: five focused side-peek DOM tests and the app TypeScript check passed.
- P0 findings: none.
- Unresolved P1 findings: none.
- Unresolved P2 findings: none.

final result: passed
