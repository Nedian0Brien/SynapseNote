---
"@nedian0brien/synapsenote": patch
---

Extend workspace search with permission-scoped `database`, `data_source`, `view`, and `record` results carrying stable IDs and revision-aware cache invalidation.

Bind MCP database reads to a validated session principal and resolve production query access through independently revisioned user, agent-capability, Agent View, and session-delegation layers without accepting caller-supplied scopes.

Filter catalog and describe metadata before ranking or caching, re-authorize exact plans immediately before mutation, bind audit attribution to the transport principal, and fail closed on unscoped agent audit, task, automation, repair, permission-management, and external-egress routes.

Apply permission projection before counts, ranking, derived values, relation cards, snippets, bodies, and recovery candidates; bind cache identities to the effective scope; scope semantic status metadata; and prevent restricted reads from rebuilding or exporting a shared semantic index.

Persist owner-managed workspace and database action grants outside Git, expose revision-safe create, edit, list, and revoke operations, and apply them to non-owner user and invoking-user access layers before agent capability intersection.

Add a database Share dialog for exact database or workspace action grants, including creation authority, revision-safe editing, refresh, and revocation.

Add canonical View only and Content editor roles whose action expansions are validated across core, storage, HTTP, and browser layers, while retaining explicit Custom grants.

Model database, View, Form, Chart, and record public-share targets with bounded projections, expiry, revocation, and hashed one-time link tokens in owner-only policy storage.

Enforce server-resolved public shares through a separate read-only Data Plane context, expose token-safe revisioned management and anonymous read endpoints, and add browser controls plus projected public database, View, Chart, and record pages.

Compile exact human-facing database object keys and declared unique record keys to stable IDs before planning, expose the resolution ledger, and refuse ambiguous option names or record matches.

Add ordered, typed, revision-bound record mutations for set, unset, multi-select add/remove, numeric increment, text or body append, and relation link/unlink, compiled into the same atomic and idempotent commit path as complete record upserts.

Bind effective permission revisions and query target snapshots into database plan hashes and refuse commits when either guard changes before execution.

Require at least one trusted write-permission guard and fail closed before canonical mutation when permission/query guard resolution is missing, malformed, unavailable, or changed, alongside existing exact target and schema snapshot checks.

Add approval-gated durable import, manifest-migration, and exact-plan bulk tasks over HTTP and MCP, with private bounded inputs, frozen target revisions, resumable checkpoints, retry-from-input, progress, safe cancellation, and restart recovery.

Add a browser-safe reviewed database mutation command that routes human UI drafts, exact-plan approval, atomic commit verification, and undo through the same server engine as agent writes.

Route new-database creation through an ephemeral history entry so Escape,
cancel, and browser back leave no uncommitted manifest/source/record behind;
successful creation replaces the draft route with the canonical database page
target while failed drafts retain their typed title for retry.

Persist the selected full-page saved view in the stable database route hash so
reloads and agent/user handoffs retain the same view without copying records.

Refuse browser mutation success unless the server receipt matches the exact reviewed plan and reports passed post-commit verification.

Add a shared fail-closed Review, Balanced, and Autonomous policy evaluator that composes database and session modes and retains approval for sensitive or undelegated effects.

Persist revisioned database and session autonomy policy in owner-only local state, bind non-Review sessions to one-time server-issued capabilities stored only as hashes, expose versioned policy configuration over HTTP, and enforce the effective policy under the same lock as atomic commits and revocation.

Apply exact database, action, property, body, activation/expiry, per-action row, cumulative row/action, and cumulative egress-byte delegation budgets. Reserve usage durably and idempotently before automatic commits, and expose separate policy and usage revisions for conflict-safe inspection.

Derive destructive delete, permission-change, public-publish, and external-communication risk from typed actions instead of caller-supplied flags, and keep these plus irreversible or undelegated side effects behind exact-plan approval in every autonomy mode.

Add durable owner-only Agent Runs history and a command-palette inspection panel for database agent intent, stable-ID scope, bounded proposed diffs, execution, verification, failures, and undo. Keep raw prompts out of storage, expose compact-list and exact-detail HTTP contracts, auto-refresh active runs, and fail closed before canonical mutation when the audit proposal cannot be persisted.

Add a command-palette Table View backed by validated catalog, describe, and snapshot-query contracts, with stable-ID rows and columns, explicit index/pagination/empty/error states, scoped realtime refresh, and revision-bound inline cell edits. Render exact planned values as non-canonical ghost cells until reviewed commit succeeds and the canonical snapshot reloads.

Distinguish Table View loading, definitive empty, invalid schema, stale index, offline transport, canonical conflict, permission denial, and service failure states. Offer state-specific recovery without replaying an uncertain write or presenting denied data as empty.

Keep invalid cell drafts local with corrective messages, label partial snapshots explicitly, and provide safe conflict, stale-index, offline, and permission recovery guidance.

Make every source expose exactly one required Title property, synchronize it with the ordinary record-page H1, support revision-bound Table and page-title edits, and keep title changes independent from stable record IDs and Markdown paths.

Add a permission-filtered stable-ID record lookup so record pages can obtain an exact revision without scanning query pages, then route database-owned visual property controls through the same reviewed plan, transaction, and verification engine used by agents.

Add keyboard cell traversal plus canonical cell and selected-row TSV copy. Validate rectangular multi-cell TSV paste completely before compiling one atomic, revision-bound reviewed mutation across the affected records.

Add Shift-extended rectangular cell selection, accessible cell context actions, and canonical TSV drag/drop. Copy, drag, drop, and paste now share one quoted typed representation and the same atomic reviewed mutation path.

Complete Table View with windowed rows, a frozen Title column, persisted stable-ID column widths/order/visibility, wrapping and row-height controls, and full-snapshot server calculations. Keyboard navigation crosses virtual windows without losing the target cell.

Protect database-owned frontmatter from direct in-app Source Mode edits while preserving body editing, CRDT command synchronization, and externally editable Markdown files. Page properties, record titles, and Table View now share the reviewed database mutation engine used by agents.

Validate URL, Email, and Phone values consistently in manifests, record materialization, and Table edits, with safe open targets and exact-value copy actions.

Enforce required, typed default, per-source uniqueness, numeric min/max, text length and regex, and select enum constraints across manifests, external records, UI edits, desired-state plans, schema migrations, and post-commit verification.

Add validated locale-aware Number display formats for precision, grouping, signed values, percent, currency, standard units, and custom prefix/suffix/multiplier presentation without changing canonical numeric storage.

Add stable-ID CSV export and bounded atomic CSV import for existing records. File interchange preserves locale-neutral canonical numbers and rejects display-formatted or invalid numeric input before planning.

Preview CSV and TSV imports before planning with encoding and delimiter detection, stable header mappings, canonical sample rows, typed issues, and empty, date, and option summaries. Confirmed imports resolve exact current record revisions and remain one bounded reviewed mutation.

Export either the current Table View scope or the complete source, including archived records, from a fresh cursor-consistent snapshot. Both scopes use documented stable filenames, columns, typed value encodings, UTF-8, CRLF, and RFC-style CSV quoting.

Export complete database sources as a versioned machine-readable JSON envelope containing stable schema and record identities, canonical values, revision receipts, and explicit completeness. Partial, cross-source, or count-inconsistent snapshots are refused.

Verify CSV and TSV interchange by restoring supported canonical property types into a different revision-bound record state and comparing the final typed property map, including multiline, quoted, and empty values.

Add stable-ID Select option lifecycle previews for rename, recolor, reorder, archive/restore, merge, and safe deletion. Archived options cannot be newly assigned; merges rewrite affected records, defaults, and saved views through one exact atomic plan with undo, while in-use deletes fail closed.

Add a distinct Status property with stable workflow-group and option identities, default Not started/In progress/Done states, deterministic progress semantics, Board-compatible sorting and grouping, and consistent Table, Markdown, interchange, query, and agent mutation behavior.

Complete Checkbox behavior with exact per-record bulk toggle previews, deterministic boolean filtering and sorting, and an explicit boolean/number/text coercion contract reserved for formulas.

Complete Date with strict all-day and offset-bearing timestamp values, optional ranges, IANA timezones, anchored reminders, daylight-saving-safe editing, relative display, full-span calculations, searchable metadata, and stable Markdown, API, JSON, CSV, and TSV serialization.

Complete Person with database-scoped stable identities for local users, collaborators, guests, and agents; one/many values; inactive-history retention; display-name retrieval; readable Markdown and CSV/TSV keys; reviewed Table, bulk, and agent edits; and minimal permission-safe identity projection for queries and context packs.

Complete multiline Text with canonical Markdown-compatible person, record, document, and URL references; a cursor-aware Table editor; deterministic plain-text query, search, Formula, constraint, and context-pack projections; compact stable reference metadata; and lossless Markdown, clipboard, CSV, TSV, and JSON interchange.

Complete Files & media with ordered local asset and external URL objects, optional names and captions, hardened uploads, inline preview and missing-file feedback, compact permission-safe availability projections, stable JSON/CSV/TSV interchange, and exact revision-bound browser and agent editing.

Complete Relation properties with one-way or stable symmetric paired identities, enforced one/many cardinality, stable record-ID interchange, permission-scoped title search, minimal token-budgeted target cards, revision-bound browser and agent edits, atomic inverse updates, and guarded delete/restore convergence that prevents dangling, wrong-source, or asymmetric references.

Add the Synapse Formula 1 source compiler with stable property-reference resolution, relation traversal, Notion-style expressions, deterministic formatting, structured schema-aware type diagnostics, injected function signatures, resource limits, and canonical versioned AST serialization.

Add the typed Synapse Formula 1 standard library for text, finite numbers, dates, booleans, lists and higher-order list operations, relation pages, and people, with frozen-clock context, permission-projected identity access, bounded outputs, and structured failures.

Complete Place properties with canonical name, address, coordinates, precision and provider provenance; irreversible approximate-coordinate storage; offline manual editing and preview; fail-closed per-property search/map controls; explicit-consent operator geocoding over HTTP and gated MCP; click-only external map display; and stable query, Formula, clipboard, CSV/TSV, agent-plan, and standalone-clone behavior.

Add an exhaustive public property-conversion matrix and bounded non-mutating preview that classifies identity, lossless, conditional, lossy, and blocked paths; reports every affected record and constraint failure; requires explicit lossy approval; preserves stable property IDs and exact record revisions; compiles schema and value rewrites into one strict HTTP/MCP exact plan; provides a Table risk-review surface; and restores the original schema and source values through transaction undo.

Add saved-view selection, projection-bound Table column visibility that remains separate from read permission, and a recursive advanced filter editor for typed AND, OR, and NOT groups, with property-specific operators, source validation, exact manifest-plan review, and filter-only clearing that preserves the rest of the stable view.

Add validated per-source default saved views plus separate per-browser last-opened view preferences, including an explicit local All records override and exact-plan controls for setting or clearing the canonical default.

Persist complete reviewed saved-view settings for ordered sorts, group and subgroup, projection visibility/order, body projection, and typed Table wrapping, row height, and stable-property widths. Canonical view display no longer overwrites the user's local All records layout.

Add reviewed saved-view lifecycle controls for stable-ID creation, identity-preserving rename, full-query duplication under a new identity, source-local reorder, favorites, and guarded deletion. Default views cannot be deleted until their source reference is changed or cleared.

Add canonical inline and full-page linked database blocks that store only stable database, source, and saved-view references, render live canonical query results, refresh on scoped changes, and open the full Table View at the same explicit view.

Add ordered saved-view conditional color rules with recursive typed conditions, whole-row or property targets, deterministic first-match precedence, permission-side-channel refusal, compact paginated query metadata, agent-friendly stable-key compilation, reviewed settings controls, and shared full/linked Table rendering.

Add explicit directed multi-source compatibility with stable property and option mappings, agent-friendly key compilation, validated mapping-aware atomic record moves, and compatible-source discovery in Table View.

Add an exact-plan database creation entry point for blank databases, reviewed starter schemas, existing-folder manifests, and bounded typed CSV/TSV imports, including empty-catalog review and creation assertions.

Add document-native `New database` entry points, catalog-backed sidebar navigation, contextual database page breadcrumbs, and direct-safe optimistic cell and row edits while retaining reviewed exact-plan approval for destructive or elevated mutations.

Explain the record meaning, canonical folder, stable key, initial view, properties, and initial record count in the creation dialog before plan review.

Expose create, open, duplicate, move, archive, restore, and delete from embedded linked Table views, handing mutations to the same stable-record exact-plan review used by the full database.

Add read-only existing-folder onboarding preview over HTTP, MCP, and the database UI, with explicit blocker display and a separate approved durable task that refuses incomplete or unresolved input before changing record identities.

Add read-only manifest migration preview over HTTP and MCP with per-manifest versions, revisions, canonical migration IDs, loss classification, and blockers; task launch repeats the preview and refuses blocked targets before queueing.

Add a stable-ID Formula/Rollup dependency graph with relation-traversal extraction, deterministic dependency-first ordering, direct and indirect cycle diagnostics, downstream blocking, reject-or-surface policies, and explicit graph limits.

Add deterministic property- and record-scoped Formula/Rollup recomputation that evaluates only the affected dependency slice, prunes unchanged downstream results, resolves permission-filtered reverse-relation owners explicitly, and reports blocked targets and adapter failures structurally.

Preserve Formula failures as canonical typed error results with stable codes, AST paths, property/function identity, bounded cause chains, exact change fingerprints, safe exception capture, and no coercion to empty values.

Add permission-revision-bound Rollup aggregation over visible relation targets with count, unique, percentage, numeric, date, and show-original functions; explicit empty, typed-error, truncation, duplicate, and resource-limit semantics; and no denied-target leakage.

Persist Formula and Rollup as read-only manifest properties, resolve agent-authored Rollup keys to stable IDs, and reject derived-value writes across Markdown, browser, and server mutation paths.

Add permission-scoped Formula/Rollup filter and sort projections with bounded revision-aware caching, typed value-or-error API results, explain traces, and delta invalidation when relation targets change.

Keep maximum-size Formula/Rollup dependency chains, fan-outs, and cycles stack-safe and deterministic with iterative graph analysis, stable heap scheduling, linear invalidation queues, explicit performance budgets, and edge-limit regression coverage.

Add a pure transaction-frozen Synapse Formula 1 evaluator with relation traversal, closures, lazy branches, shared function execution, typed null/error propagation, result validation, and bounded steps, plus stable-ID editor completions, references, diagnostics, canonical formatting, and snapshot preview analysis.

Add Formula and Rollup property editors with stable-reference assistance, source-located validation, explicit typed errors, deterministic UTC snapshot previews, and a read-only permission-scoped server preview for unsaved Rollup candidates.

Preserve computed `null` and typed failures explicitly when Formula and Rollup cells are copied or exported through TSV and CSV instead of silently producing empty cells.

Complete multi-select set semantics across Markdown materialization, repair, query/filter/sort, browser and bulk editing, TSV/CSV interchange, and idempotent agent add/remove operations using stable option identities.

Let Table View plan new titled records without writing Markdown first, render each proposed record as a discardable non-canonical ghost row, and create it only after exact-plan approval, verification, and canonical snapshot refresh.

Add exact revision-bound record deletion to desired-state plans and atomic commits, with intrinsic high-risk approval, relation and intervening-edit refusal, typed delete receipts, conflict-safe durable undo, and a Table View deletion ghost that remains visible and discardable until the canonical snapshot confirms commit.

Add stable-ID row selection and bounded revision-safe bulk property edits to Table View, including typed multi-select editing, exact multi-row ghost review, atomic verification, and conflict-preflighted undo of the last committed transaction.

Open a Table View record through the ordinary hash-navigation document route so the canonical Markdown file appears as a normal SynapseNote page without creating a second database-only document.

Preserve the same ordinary document identity for nested Markdown and MDX record paths containing spaces, Unicode, or emoji.

Keep database records compatible with normal Markdown/source editing and external-editor round trips while preserving stable identity, body content, and unrelated frontmatter.

Preserve externally introduced invalid property values without coercion while keeping valid portions of each record queryable. Return permission-scoped diagnostics, exclude invalid values from typed filters and calculations, surface typed derived errors, support correction from the original raw value, and mark clipboard/CSV/TSV exports explicitly.

Add immutable Created time and Last edited time properties backed by canonical record metadata and external file timestamps. Keep them read-only across browser, import, and agent writes while supporting Date filters, sorts, calculations, Formula references, display, and canonical export.

Add immutable Created by and Last edited by properties for human, agent, sync, filesystem, and system provenance. Preserve creator identity across updates and moves, attribute duplicates and external edits correctly, and expose permission-scoped stable actor keys to queries, formulas, UI, and exports without allowing direct value writes.

Complete Button properties as virtual read-only controls with stable-ID multi-step database actions, secret-free external connection references, exact record-revision and permission-policy guards, internal diff and egress-byte previews, and reviewed Table invocation. One approved composite run commits verified internal changes before ordered external delivery, persists content-free lifecycle and undo receipts, rechecks permission and egress revisions, prevents duplicate delivery, and recovers bounded retries after restart across browser, HTTP, and MCP entry points.

Add canonical database/source header Buttons with stable placement, agent-authored desired-state definitions, multiple scoped record creations, per-step permission guards, and one atomic reviewed commit/undo flow without synthetic record context.

Complete Unique ID properties with canonical numeric record storage, configurable display prefixes, monotonic non-reusing manifest watermarks, automatic create/backfill/duplicate/move allocation, formatted Table and CSV/TSV projection, read-only agent and import contracts, standalone-clone continuity, and approval-bound atomic collision repair.

Duplicate records through a source-revision-bound server operation that copies complete typed values and Markdown body into a new stable ID, refuses intervening source edits, previews a ghost row, and supports exact transaction undo.

Store record archive state canonically in `_sn.archived_at`, exclude archived records from typed queries and lexical retrieval by default, support explicit archived projection and revision-bound restore, and preview both transitions as discardable Table View ghosts without moving Markdown files.

Move records between compatible sources with stable identity, exact-revision and destination-path guards, option-key mapping, paired atomic delete/create receipts, ghost preview, index verification, and two-path undo.

Add deterministic two-level grouping and typed per-column calculations over the complete permission-scoped match set, with explicit group and membership bounds, completeness, truncation, saved-view defaults, and explain traces.

Complete Board View with saved grouping and subgroup swimlanes, projected card properties, bounded empty groups and counts, local Files covers, card sizing, keyboard and drag transitions, linked-view rendering, and one revision-bound exact-plan mutation for every group change.

Complete Timeline View with typed range or separate Date mapping, hour-to-year scales, projected context, saved groups, permission-safe dependencies, Today and no-date states, linked rendering, and atomic exact-plan keyboard, drag, and resize changes.

Complete Calendar View with saved month/week display, Date mapping, week and weekend preferences, IANA timezone and daylight-saving behavior, multi-day cards, bounded daily display, linked rendering, and atomic exact-plan reschedule and resize changes.

Complete List View with compact projected rows, saved group sections, cycle-safe Relation hierarchy, conditional colors, bounded loading, keyboard-first tree navigation, permission-safe operational fields, and shared full or linked rendering.

Complete Gallery View with typed local Files previews, fit or cropped media, three card sizes, ordered projected properties, optional titles, conditional colors, bounded loading, safe lazy asset requests, and explicit fallback art for external, missing, unsupported, empty, or failed media.

Complete Chart View with typed vertical/horizontal bar, line, donut, and number layouts; dimensions, series, record or property measures, snapshot aggregation, legends, value and axis labels, explicit empty and truncation states, bounded drill-through, and shared full or linked rendering.

Complete Form View with typed public or internal access, ordered stable-property response mapping, required and conditional questions, safe local file uploads, close and confirmation states, duplicate checks, honeypot and bounded rate protection, and server-validated exact-plan record creation shared by full and linked views.

Persist content-free Form submission receipts and hashed submission/upload rate windows across server restarts, recover uncertain commits through deterministic record identity, and enforce `delete_after` retention with an hourly revision-bound verified deletion transaction.

Complete Map View with typed Place mapping, bounded deterministic clustering, pan and zoom, canonical record opening, visible missing and truncated states, a network-free local default, reviewed OpenStreetMap opt-in and attribution, and provider-failure fallback shared by full and linked views.

Complete Dashboard View with persisted responsive rows, up to twelve saved-view widgets, source-typed global filters, Relation-linked selections, independently permission-scoped child queries, realtime refresh, and shared full and linked rendering through stable agent-addressable IDs.

Complete Feed View with typed newest-first chronology, explicit author and source identity, bounded snapshot cursor paging, projected stacked cards, canonical record opening, and optional honest session-local read state shared by full, linked, and Dashboard surfaces.

Persist Side peek, Center peek, or Full page record opening on each stable saved view, with layout-aware defaults and a shared canonical-body peek experience across full and linked database surfaces.

Add reviewed source-default record layouts with stable pinned, panel, hidden, section, and group placement, collapsed groups, scoped full-width content, safe visibility for new properties, and propagation to existing records without rewriting Markdown.

Add revision-safe database record comments with page and eligible property anchors, active-person mentions, replies, author edits, resolve/reopen history, shareable Git-backed artifacts, a record-page discussion panel, and an agent-attributed `data_comments` MCP contract.

Add a record-page property history view that interprets rename-aware shadow-Git versions through stable database property IDs and distinguishes reviewed human or agent edits, sync/upstream Git, filesystem changes, system provenance, and page-body changes.

Add bounded permission-safe relation navigation to database record pages while keeping stable Relation IDs out of the Markdown backlink graph, so only explicitly authored document links contribute backlinks.

Keep title, icon, cover, typed properties, comments, canonical body, backlinks, relation navigation, and property-aware history consistent across full-page, side-peek, and center-peek database record surfaces.

Add canonical database record templates with stable IDs, typed property defaults, Markdown starter bodies, source/view/entry-point default resolution, reviewed record creation, and edit, duplicate, reorder, archive, restore, and delete management flows shared by humans and agents.

Add owned repeating record templates with daily, weekly, monthly, and anchored interval schedules, explicit timezones, pause and bounded retry policies, restart-safe occurrence deduplication, exact verified record creation, and bounded browser/API/MCP run history.

Add versioned owned database automations with record, property, schedule, Form, and Button triggers; exact internal record/relation/person/template actions; durable notifications; reviewed webhook and email egress through local-only connection secrets; dry run, test events, retry/recovery, compact history, loop/fan-out/deduplication guards, and shared browser/API/MCP authoring and inspection surfaces.

Add revision-bound canonical per-record presentation overrides for inherited property placement, stable group state, and content width, including exact review, reset, validation, preservation across ordinary lifecycle actions, and safe clearing on cross-source moves.

Add opt-in governed Verification properties with authenticated verifier attribution, evidence-stable record revisions, derived expiry and staleness, reviewed verify/renew/unverify plans, actor-bound commit checks, permission-safe query/search/context-pack evidence, conservative agent ranking, and browser/API/MCP lifecycle surfaces.

Add explicit database lexical, semantic, and hybrid retrieval over the shared project-local embeddings opt-in, with lazy source indexing, exact model/privacy/freshness receipts, permission-first row and property scope, deterministic reciprocal-rank-fusion diagnostics, and visible or required semantic degradation across server, HTTP, and MCP.

Bound database retrieval and derived-query work with explicit lexical term/hit/evidence ceilings, exact bounded top-K ranking, batched semantic provider requests, and documented relation, Formula, Rollup, aggregation, and pagination limits with typed refusal or completeness diagnostics.

Add a fail-closed database permission core that keeps agent identity distinct from its invoking user and deterministically intersects user permission, agent capability, Agent View policy, and session delegation across workspace, database, source, view, row-filter, record, property, body, action, and activation scopes.

Add Agent View sensitivity ceilings that redact root and related properties, relation traversal, evidence scopes, and inherited record bodies before context-pack encoding or token accounting, with content-free inspection receipts for operational diagnostics.

Extend durable database audit receipts with a deterministic intent summary, exact plan and actor/session binding, executing server tool version, stable data-source scope, content-free file deltas, and postcondition verification across direct, HTTP, and MCP commits.

Keep raw prompts out of Agent Runs, transaction receipts, Git, and journals by default, while offering a separately authorized explicit-consent process-memory retention action with a mandatory 60-second-to-seven-day TTL, content-free metadata, early deletion, and restart erasure.

Add an operator-controlled `data-plane-only` sandbox deployment that forces the built-in Codex filesystem read-only and restricts both stdio and HTTP MCP registration to read/discovery and governed database operations, structurally removing generic document, configuration, restore, conflict-resolution, installation, and sharing writes.

Document an implementation-linked database threat model covering record prompt injection, malicious formulas, links and Files values, public Forms and uploads, webhook/email egress, and imported manifests, with explicit trust boundaries, invariants, evidence, residual risks, and beta/GA follow-up gates.

Add application-level database abuse boundaries: bounded manifest bytes, YAML aliases, depth and nodes; bounded generic and public Form upload bytes; per-agent-session request and concurrency limits; a typed HTTP 429 response; and an implementation-linked public/agent/automation resource-limit inventory.

Add the public-beta and GA database security/privacy release-decision record, including the data inventory, evidence requirements, residual-risk ownership, and explicit approver fields; the release gate remains open until those sign-offs are recorded.

Define and implement deterministic concurrent database-record editing: body text keeps Y.Text CRDT semantics, property operations safely rebase when their exact prior values are unchanged, identical same-property writes converge without another commit, and divergent same-property writes remain explicit revision conflicts.

Document and enforce serialized schema and saved-view changes through the cross-process database commit/store locks, immutable plan hashes, exact snapshot revisions, atomic manifest replacement, and post-write verification; a competing stale plan fails for review instead of silently winning.

Show ephemeral attributed collaborator presence for exact database cells, record pages, and schema operations over the shared system awareness channel.

Integrate database commits and undo with document history and Timeline using classified shadow writers, hidden transaction-base checkpoints, structured actor/document attribution, and stable property-level record history.

Keep bounded permission-filtered database snapshots readable after a transport outage, with explicit read-only cache time, snapshot, index, relation, and derived-value freshness labeling.

Persist supported preconditioned record writes in a bounded offline queue and replan them sequentially against the current schema and values, requiring exact review and surfacing environment or optimistic-concurrency conflicts before commit.

Classify concurrent database changes across record values, schema, options, views, formulas, relations, and automations by stable ID, and provide explicit use-latest or fresh-plan recovery without replaying a stale approval.

Add trusted clone-local semantic Git merge drivers for canonical database manifests and records, merging independent stable-ID or property changes while retaining explicit conflict markers for ambiguous same-target edits.

Block database reads when Git exposes only part of a multi-file merge, rebase, cherry-pick, or revert, and add revision-checked explicit status and abort recovery commands.

Preserve canonical database, source, property, and record IDs across branch switches, semantic merges and rebases, and hosted Git push, clone, and pull synchronization.

Create project-wide shadow checkpoints for database transactions and durably roll back their exact multi-file manifest and record scope with derived-index recovery.

Pin deterministic conflict outcomes for human/human, human/agent, agent/agent, filesystem/CRDT, and Git/CRDT database races.

Add confirmation-gated Markdown and Obsidian schema inference, structured loss-reporting Notion import plans, exact portable manifest/record/media bundles, durable import rollback, and representative lossless migration corpora.

Complete the versioned database CRUD and migration surface with exact desired-state resource removal and revision-bound, approval-gated whole-database deletion that atomically removes manifests and records and restores their exact bytes through durable undo.

Define reproducible 1k, 50k, 500k, and 1m-record database benchmark corpora with a realistic 30-property schema, bounded body/relation/value distributions, deterministic random access, and streaming digest-bearing materialization.

Add an executable warm typed-query performance gate over the shared 50k-record, 30-property corpus and record a reference p95 comfortably below the 150 ms budget.

Add executable p95 performance gates and reference baselines for canonical cold database discovery, initial and incremental record indexing, Formula/Rollup propagation, 50k-record token-budgeted context packing, and real virtualized application Table rendering.

Bound browser database memory across every saved-view layout with finite loaded-record snapshots, viewport-windowed Table rows, a wide-schema mounted-column ceiling, shortened final pages, and visible recovery guidance at each limit.

Keep ordinary typed database queries on a body-free in-memory index projection, avoiding canonical file reads and large Markdown-body clones while retaining explicit lexical evidence and full-body context disclosure.

Enforce the existing document-open and shared database-frontmatter UTF-8 byte limits during record materialization, with typed index diagnostics and actionable guidance for moving oversized content to bodies, linked records, documents, or Files.

Keep database rebuild, import, migration, bulk mutation, automation, and Git refresh work responsive through awaited canonical I/O, durable per-target checkpoints, cancellation boundaries, coalesced rebuilds, watcher replay, and an executable event-loop heartbeat gate.

Recover database state across restart, disk-full and permission failures, malformed files, stale locks, derived-cache loss, and interrupted renames through canonical rebuilds, atomic preservation, durable checkpoints/outboxes/receipts, and exact transaction backups.

Propagate cooperative cancellation from MCP and disconnected HTTP clients through database queries and context packs, while bounding rebuild event queues, live change subscriptions, entry-point concurrency, and durable task cancellation without returning partial results.

Certify identical database query and Formula outputs across core, browser, server transports, desktop, Ubuntu, macOS, and Windows with shared versioned golden vectors and a focused cross-platform CI gate.

Gate database latency, retained memory, index payload size, token efficiency, virtualized rendering, application bundles, and the dedicated database workspace chunk against executable versioned budgets; keep the record-mutation validation contract browser-safe in core.

Make database cell, row, property, saved-view, and database operations keyboard accessible, including virtualized arrow navigation, range selection, editing, clipboard actions, and a focus-managed Context Menu/Shift+F10 action menu.

Expose virtualized Tables as named, indexed, selection-aware grids with roving focus, and Boards as labeled semantic record lists with card positions and polite move announcements.

Meet the database WCAG 2.2 AA interaction contract with shared contrast and focus treatments, reduced-motion behavior, named and described errors and forms, non-color status cues, screen-reader chart values, and a focus-visible keyboard-operable Map with textual location alternatives.

Keep the database workspace usable under browser zoom, narrow panes, and desktop resizing with wrapping controls, bounded scrolling, compact responsive spacing, reduced-motion overrides, forced-colors selection/status treatments, and semantic screen-reader alternatives.

Localize database display copy and formatting through Lingui plus a shared display-only `Intl` layer for numbers, currency, dates, relative time, and natural label collation while keeping canonical storage and query ordering locale-neutral.

Preserve long and mixed-direction Unicode database content with automatic bidi direction, bounded wrapping and full-value labels, IME-safe cell commits, and byte-preserving canonical strings across CJK, emoji, combining marks, and right-to-left text.

Show exact scope, risk reasons, confirmation state, and durable undo recovery for destructive or lossy database plans, and add principal-, role-, and scope-specific confirmation with recreate guidance for immediate permission revocation.

Open database records through the ordinary document route and editor activity pool so existing tabs, editor modes, graph, backlinks, search, Timeline, history, and desktop document conventions remain intact.

Add the first file-native database foundation with versioned manifests, a canonical lossless migration matrix, machine-readable database and property semantics, saved view definitions including typed Agent View projection/scope/token/semantic/write-policy contracts, source-located diagnostics, comment- and source-order-preserving manifest edits, a versioned stable-ID formula AST, and deterministic content-free Git transaction and undo receipt schemas; stable database identities across record moves; typed Markdown record validation; exact queries with a complete current-property operator matrix, versioned locale-neutral natural Unicode sort semantics, revision-bound saved-view queries, stateless snapshot-bound pagination that survives process and index reconstruction, a public versioned conformance runner shared by core, server, HTTP, MCP, browser UI, and future SDK adapters, freshness, no-match/partial-index/permission/truncation state, content-free explain traces, permission-exclusion, Agent View receipts, and policy-bound cursor metadata; startup manifest discovery; atomic manifest persistence; byte-preserving record ID assignment; a safe existing-folder onboarding preview; deterministic live typed-property and permission-scoped lexical indexes with freshness, extractive evidence, explanation traces, diagnostics, canonical consistency audits, concurrent-event-safe rebuild coordination, live manifest refresh, branch-safe Git synchronization, private provenance-bearing generated summaries with fail-closed stale-state tracking, bounded content-free `database-changed` realtime events for record bursts and index rebuild state, and optional MCP catalog/schema/content-free-snapshot resources with project-scoped change subscriptions; and an Agent Data Plane with an immutable public v1 request/response schema registry and HTTP version header, bounded durable task lifecycle metadata with revision-safe list/get/cancel and restart interruption recovery, ranked discovery, cacheable schema descriptions, query-bound catalog revisions, conditional HTTP and MCP reads, inspectable natural-language queries, revision-aware deltas, saved Agent View query/pack enforcement, token-budgeted progressive context with depth/fan-out/total-bounded projected relation expansion, a bounded process-local **What the agent saw** inspector for exact packs, tokens, redactions, omissions, freshness, and truncation, ephemeral snapshot-bound desired-state planning with stable-ID create/update/noop ensures, relations, schema alteration, and revision-bound record upserts, approval-gated atomic database creation and update commits, durable local idempotency receipts and update undo bases, conflict-aware atomic undo, preview-first canonical/index repair, and RFC 9457 recovery instructions—including structured request paths, schema candidates, valid operators, stale revisions, and denied permission scopes—over HTTP and the separate MCP `data`, `data_plan`, `data_commit`, `data_undo`, `data_repair`, and `data_task` tools.

Ship seven reviewed starter databases with bounded example records (Tasks,
Projects, CRM, Feedback, Content calendar, Issue tracking, and Research
evidence) and a content-free database diagnostics JSON export for beta feedback.
Publish the database user,
agent, migration, and compatibility guidance plus a Notion UX alignment
checklist. Add document-native `Database` and `Linked database` slash entries,
an inline catalog/source/view picker, advanced-only stable-reference controls,
an optional-title blank creation path that lands on the new table, visible saved
view tabs with a nearby new-view affordance, and a collapsed advanced-storage
summary for canonical folders and stable keys,
plus a stable route-level database workspace used by linked-view full-page
navigation,
and a visible Page/Database type chooser for normal New-page creation. Blank
human creation is direct-safe and opens the first record title field on the new
table; templates, existing-folder manifests, and CSV/TSV imports remain
reviewed.
Database page titles are editable in place through the same exact-plan path,
and failed creation drafts reopen with the typed title preserved for retry.
Table View also exposes a title-cell new-row affordance with Enter/Escape
editing while preserving the shared direct-safe mutation contract.
Canonical full-page creation now emits a sidebar-only navigation notification
after `replaceState`, so the newly created database becomes the active ordinary
page target without mounting a duplicate route-level workspace.
Database page administration actions are grouped under an accessible secondary
`More database actions` menu, keeping filters, view settings, new-record, and
archive visibility controls in the primary toolbar.
Linked inline database blocks expose the database/source title and a saved-view
tab strip for multi-view sources while retaining stable database/source/view
references.
Invalid inline blocks can create a blank database in place through the same
exact-plan path and write the resulting stable references back to the host JSX
node without replacing the surrounding document.
The full database workspace also exposes the existing token/redaction/omission
context inspector from its secondary actions menu.
Context inspector list/detail reads accept database, source, view, and record
scope filters so a handoff can stay within the selected database context; Table
rows and cell menus expose a compact record-context action when the host wires
the inspector. The inspector also renders extractive/full-body citation labels
when the captured pack contains them, and provides non-mutating per-property
All/None controls with a selected-field JSON preview and approximate token count
for compact handoffs; Context Packs retain server-side `propertyIds` selection.
Table headers expose a visible `+ Add property` affordance when schema editing
is available, reusing the reviewed properties dialog.
Visible property headers also expose keyboard-accessible contextual menus for
show/hide, left/right reorder, calculations, rename/configure, type conversion,
and dependency-aware delete. The reviewed properties dialog supports stable-ID
inline rename plus the existing reorder and recovery-aware delete flow.
Active saved-view tabs expose a keyboard-accessible options menu for Filters,
View settings, Manage views, and safe left/right reordering while preserving the
reviewed mutation paths. Each tab also exposes a native drag handle; a drop on
another stable view target compiles one exact `reorder-to` desired state.
Ghost reviews lead with a human-readable change summary and keep the exact
plan identifiers and snapshot under a collapsed details disclosure.

Database workspaces honor Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z outside editable
controls for conflict-safe last-transaction undo/redo paths. Commit and Escape
cancellation restore the edited cell's focus. The Table DOM suite covers the
round trip; the HTTP and server engine suites also cover redo preview/apply,
restart rehydration, conflict guards, and idempotent replay. Complete policy
coverage remains tracked separately.

Inline linked database blocks explain canonical shared records and retain a
bounded per-tab `sessionStorage` last-verified snapshot for an explicit
offline/stale view state after refresh failure. The cache stores only validated
read snapshots, never credentials or pending writes, and remains a fallback
rather than a second source of truth.

Database creation previews bounded template and CSV/TSV sample rows as a first
page before review, while every committed creation mode continues directly to
the editable canonical database table.
Record opens preserve the originating database/view and loaded record order so
the canonical record page can offer guarded Previous/Next and Back to database
view navigation without duplicating records.
and focused release-gate CI for database DOM accessibility, migrations,
security/recovery, held-out retrieval, and bounded performance.

Refresh security-sensitive dependency ranges and compatible lockfile overrides
for database and desktop release paths, removing the current critical audit
findings while retaining an explicit release-review record for remaining
high/moderate advisories.
