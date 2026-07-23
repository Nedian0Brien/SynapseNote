# RFC 0001 implementation checklist: Databases and the Agent Data Plane

> **UX status note:** Checked capability work in this document does not by
> itself establish a Notion-like human experience. Entry, creation, full-page,
> inline/linked, direct editing, views, record-page, accessibility, and usability
> acceptance are tracked in the
> [Notion UX alignment checklist](./0001-notion-ux-alignment-checklist.md).

- Status: Active
- Last updated: 2026-07-22
- Companion RFC: [File-native databases and the Agent Data Plane](./0001-databases-and-agent-data-plane.md)

## How to use this checklist

This is the source of truth for reaching Notion-class database parity while
making SynapseNote substantially more agent-friendly.

Check an item only when all of the following are true:

- the behavior is implemented through the shared core, not only mocked in one
  surface;
- the canonical file format and standalone clone experience still work;
- relevant unit, contract, integration, and user-flow tests pass;
- error, empty, loading, conflict, permission, and offline states are handled;
- public behavior has documentation and a changeset;
- agent-visible behavior has stable IDs, explicit completeness, and no silent
  coercion or truncation.

An experimental feature behind a flag may satisfy an implementation item, but
it does not satisfy a milestone release gate until migration, observability,
accessibility, performance, and documentation gates also pass.

## Milestones

### M0 — File-native foundation

A developer can define, validate, materialize, and query a database snapshot in
the shared core. No production persistence or UI is implied.

### M1 — Table alpha

A user can create a database, edit records and common properties in a Table
View, restart SynapseNote, and recover the exact same canonical state.

### M2 — Collaborative beta

Multiple users and agents can safely query and edit databases with relations,
formulas, additional views, offline recovery, permissions, and migrations.

### M3 — Notion-class parity

All property families, view families, templates, forms, charts, buttons,
automations, layouts, import/export, permissions, and collaboration flows meet
their acceptance gates.

### M4 — Agent-native GA

Agents can discover, retrieve, pack, create, migrate, bulk-edit, verify, and
undo database work within explicit scopes and token budgets. Retrieval and
mutation eval gates pass in production-like datasets.

## A. Product contract and architecture decisions

- [x] **A-001** Document the file-native database and Agent Data Plane RFC.
- [x] **A-002** Define Database → Data source → Property schema → Record as the
      initial logical hierarchy.
- [x] **A-003** Define Markdown/MDX files as canonical records and indexes as
      rebuildable derived state.
- [x] **A-004** Define explicit stable identity prefixes for databases, sources,
      properties, options, and records.
- [x] **A-005** Decide whether v2 manifests remain one file per database or use
      independently mergeable database/source/view files.
- [x] **A-006** Select the formula language and canonical serialized AST.
- [x] **A-007** Decide which semantic-index artifacts, if any, are portable
      between clones.
- [x] **A-008** Decide eager versus lazy record-ID assignment when onboarding an
      existing folder.
- [x] **A-009** Specify the multi-file Git transaction and undo receipt format.
- [x] **A-010** Define the compatibility policy for newer manifest, property,
      view, formula, and automation versions.
- [x] **A-011** Publish the stable-ID lifecycle: generation, collision handling,
      rename survival, deletion, tombstones, and prohibition on reuse.
- [x] **A-012** Define feature flags and downgrade behavior for databases created
      by a newer SynapseNote version.
- [x] **A-013** Maintain a Notion parity matrix and update it whenever Notion adds
      or changes a database capability.
- [x] **A-014** Decide the v1 AI-autofill boundary: suggestions are optional,
      provenance-bearing, permission-scoped, freshness-bound, and never
      canonical until a user or approved agent mutation commits them; typed
      failures leave the existing value unchanged. Evidence: the AI autofill
      decision contract in the [main RFC](./0001-databases-and-agent-data-plane.md#ai-autofill-decision-v1)
      and the corresponding deferred row in the [parity matrix](./0001-notion-parity-matrix.md).

## B. Canonical schema and file format

- [x] **B-001** Implement the strict v1 YAML database manifest schema.
- [x] **B-002** Implement browser- and Node-compatible manifest parse and
      deterministic serialization.
- [x] **B-003** Require exactly one title property per data source.
- [x] **B-004** Reject duplicate source, property, and option identities.
- [x] **B-005** Validate relation targets against declared data sources.
- [x] **B-006** Define `_sn.database_id`, `_sn.source_id`, and `_sn.record_id`
      record metadata.
- [x] **B-007** Preserve unrelated frontmatter outside the database projection.
- [x] **B-008** Map human-readable property and option keys to stable canonical
      IDs.
- [x] **B-009** Add view definitions, stable view IDs, layouts, filters, sorts,
      groups, and projections to the canonical format.
- [x] **B-010** Add database-level machine-contract metadata: purpose,
      canonicality, vocabulary, default time field, freshness, and sensitivity.
- [x] **B-011** Add property semantics: aliases, constraints, inference policy,
      sensitivity, format, and default value.
- [x] **B-012** Define canonical schema migrations for every manifest version.
- [x] **B-013** Preserve comments and source ordering when editing manifests.
- [x] **B-014** Detect duplicate database IDs and keys across all workspace
      manifests.
- [x] **B-015** Produce source-located diagnostics for invalid YAML, unknown
      versions, invalid properties, and relation errors.
- [x] **B-016** Define a forward-compatible representation for unknown property
      and view types without silently treating them as text.
- [x] **B-017** Add golden fixtures proving that a standalone clone can interpret
      every canonical object without a cache or server database.

## C. Persistence, transactions, and indexing

- [x] **C-001** Discover `.ok/databases/*.yml` manifests at project startup.
- [x] **C-002** Atomically create, update, rename, and delete manifests with file
      locking and stale temporary-file cleanup.
- [x] **C-003** Add a database store API that never exposes unresolved filesystem
      paths to callers.
- [x] **C-004** Assign collision-resistant record IDs without changing unrelated
      frontmatter or Markdown body bytes.
- [x] **C-005** Onboard an existing folder with a preview of files to include,
      exclude, modify, or reject.
- [x] **C-006** Keep record identity stable across file moves, title changes, and
      source-folder moves.
- [x] **C-007** Detect raw external file edits and incrementally rematerialize
      affected records.
- [x] **C-008** Build the live typed-property index from canonical files.
- [x] **C-009** Incrementally update the index for create, edit, move, delete,
      schema migration, and Git sync events.
- [x] **C-010** Rebuild the entire index deterministically after cache loss or
      corruption.
- [x] **C-011** Expose index state, snapshot revision, freshness, rebuild progress,
      and last error.
- [x] **C-012** Add consistency checks comparing index rows with canonical
      Markdown and manifests.
- [x] **C-013** Add a repair operation that previews and fixes stale identities,
      invalid values, missing records, and orphaned index entries.
- [x] **C-014** Implement atomic multi-record and schema transactions with
      rollback on partial filesystem failure.
- [x] **C-015** Persist idempotency keys and transaction receipts durably enough
      to survive process restarts.
- [x] **C-016** Prevent partial reads while a schema or bulk transaction is being
      committed.
- [x] **C-017** Define deletion and trash semantics for records, sources,
      databases, views, properties, options, and relations.
- [x] **C-018** Add backup and restore tests for manifests, records, derived
      indexes, and transaction journals.

## D. Property system

Each property is complete only when storage, validation, editor, filter, sort,
copy/paste, import/export, API, agent schema, permissions, and tests agree.

- [x] **D-001** Implement initial schemas for title, text, number, checkbox, date,
      select, multi-select, URL, email, phone, and relation.
- [x] **D-002** Materialize and validate the initial property values from
      frontmatter.
- [x] **D-003** Complete Title property editing, uniqueness of the title column,
      and page-title synchronization.
- [x] **D-004** Complete Text with multiline content, mentions, rich-text
      references, and deterministic plain-text query projection.
- [x] **D-005** Complete Number with decimal precision, thousands separators,
      percent, currency, custom format, min/max, and invalid-input handling.
- [x] **D-006** Complete Select with stable option IDs, reorder, rename, recolor,
      merge, archive, and safe deletion previews.
- [x] **D-007** Complete Status with groups, progress semantics, default statuses,
      and board-compatible ordering.
- [x] **D-008** Complete Multi-select with stable options, set semantics, dedupe,
      and bulk editing.
- [x] **D-009** Complete Date with optional time, timezone, date ranges,
      reminders, relative display, and locale-safe serialization.
- [x] **D-010** Complete Person with local identities, collaborators, agents,
      multi-person values, inactive users, and permission-safe projection.
- [x] **D-011** Complete Files & media with local assets, URLs, ordering,
      captions, preview, missing files, and safe import/export.
- [x] **D-012** Complete Checkbox with bulk toggle, filter, sort, and formula
      coercion rules.
- [x] **D-013** Complete URL, Email, and Phone with validation, display, copy, and
      explicit external-action confirmation.
- [x] **D-014** Complete Relation with one/many cardinality and referential
      integrity.
- [x] **D-015** Complete Rollup with count, unique count, percent, sum, average,
      min/max, earliest/latest, show original, and empty/error semantics.
- [x] **D-016** Complete Formula as a typed, dependency-tracked property.
- [x] **D-017** Complete Created time and Last edited time as immutable derived
      metadata.
- [x] **D-018** Complete Created by and Last edited by for human, agent, sync, and
      filesystem actors.
- [x] **D-019** Complete Button property with scoped database and external
      actions.
- [x] **D-020** Complete Unique ID with configurable prefix, monotonic allocation,
      clone behavior, and collision repair.
- [x] **D-021** Complete Place with address search, coordinates, map display,
      privacy controls, and offline fallback.
- [x] **D-022** Define verification/certification metadata for canonical records
      if retained in the parity matrix.
- [x] **D-023** Support required, default, unique, min/max, regex, enum, and
      relation constraints where meaningful.
- [x] **D-024** Show invalid-but-preserved external values without corrupting or
      silently coercing them.
- [x] **D-025** Add a property-type conversion matrix with loss preview,
      rollback, and migration tests.
- [x] **D-026** Implement opt-in Verification properties with authenticated
      verifier attribution, expiry/staleness derivation, reviewed lifecycle,
      permission-safe retrieval, and agent-ranking tests.

## E. Query, search, and aggregation engine

- [x] **E-001** Implement exact nested `and`, `or`, and `not` filters.
- [x] **E-002** Implement typed equality, containment, comparison, membership,
      and empty-value operators for the initial types.
- [x] **E-003** Implement deterministic multi-property sorting with stable record
      tie-breaking.
- [x] **E-004** Implement property projection.
- [x] **E-005** Implement page limits, explicit completeness, match/return counts,
      and truncation cause.
- [x] **E-006** Bind cursors to their query and snapshot so stale or cross-query
      reuse fails explicitly.
- [x] **E-007** Return property candidates rather than guessing unknown IDs.
- [x] **E-008** Complete the operator matrix for every property type.
- [x] **E-009** Define locale, collation, case, diacritic, natural-number, and
      empty-value sort semantics.
- [x] **E-010** Add advanced filter groups to the saved query format and UI.
- [x] **E-011** Add lexical full-text indexing for title, selected properties,
      and Markdown body with evidence offsets.
- [x] **E-012** Add optional semantic indexing with explicit model, freshness,
      and privacy state.
- [x] **E-013** Add hybrid retrieval and deterministic ranking diagnostics.
- [x] **E-014** Add bounded relation expansion with depth, fan-out, projection,
      and cycle controls.
- [x] **E-015** Add formula and rollup filter/sort indexes.
- [x] **E-016** Add group, subgroup, aggregate, and per-column calculation
      queries.
- [x] **E-017** Apply row and property permissions before ranking, counts, and
      aggregation.
- [x] **E-018** Distinguish no match, permission-filtered, stale index, partial
      index, and truncated result states.
- [x] **E-019** Add saved-query revisions and invalidate cursors when schemas or
      permission scopes change.
- [x] **E-020** Add query explain traces for selected source, filters, ranking,
      permission exclusions, and truncation.
- [x] **E-021** Add streaming or durable pagination for very large result sets.
- [x] **E-022** Add a query conformance suite shared by core, server API, UI, MCP,
      and future SDKs.

## F. Views and database UI

### Shared view behavior

- [x] **F-001** Add database creation from blank, template, existing folder,
      CSV, and agent-authored draft.
- [x] **F-002** Add inline and full-page database blocks without duplicating
      canonical records.
- [x] **F-003** Add create, rename, duplicate, reorder, favorite, and delete view
      operations with stable IDs.
- [x] **F-004** Persist per-view filter, sort, group, subgroup, projection,
      property order, layout, and display settings.
- [x] **F-005** Add linked database views that preserve one canonical source.
- [x] **F-006** Add multi-source databases with explicit source compatibility
      and per-source property mapping.
- [x] **F-007** Add view-level property visibility without changing read
      permission.
- [x] **F-008** Add saved default view and per-user last-opened view state.
- [x] **F-009** Add record create, open, duplicate, move, archive, restore, and
      delete actions from every applicable view.
- [x] **F-010** Add multi-select and bulk property operations with preview and
      undo.
- [x] **F-011** Add keyboard navigation, command palette actions, context menus,
      drag/drop, clipboard, and TSV paste.
- [x] **F-012** Add consistent loading, empty, invalid schema, stale index,
      offline, conflict, and permission states.
- [x] **F-013** Add conditional color rules shared across applicable views.

### View families

- [x] **F-020** Complete Table View: virtualized rows, frozen title, resize,
      reorder, hide, wrap, row height, calculations, inline editing, and bulk paste.
- [x] **F-021** Complete Board View: grouping, swimlanes, card properties, cover,
      drag transitions, empty groups, and group limits.
- [x] **F-022** Complete Timeline View: date/range mapping, scale, dependencies,
      drag/resize, groups, today marker, and no-date lane.
- [x] **F-023** Complete Calendar View: month/week views, date mapping,
      drag/reschedule, multi-day records, and timezone behavior.
- [x] **F-024** Complete List View: compact hierarchy, visible properties,
      sections, and keyboard-first navigation.
- [x] **F-025** Complete Gallery View: card preview source, fit, size, properties,
      fallback art, and media loading.
- [x] **F-026** Complete Chart View: supported chart types, dimensions, measures,
      aggregation, legends, labels, limits, empty data, and drill-through.
- [x] **F-027** Complete Form View: public/internal access, validation,
      conditional questions, file uploads, response mapping, close date, and spam
      protection.
- [x] **F-028** Complete Map View: Place mapping, clustering, missing locations,
      privacy, and provider failure behavior.
- [x] **F-029** Complete Dashboard View: composable database widgets, filters,
      linked interactions, layout persistence, and responsive behavior.
- [x] **F-030** Complete Feed View: chronological presentation, source identity,
      pagination, and read state where supported by the parity decision.

## G. Record pages and database layouts

- [x] **G-001** Open every record as a normal SynapseNote page without losing
      database context.
- [x] **G-002** Keep title, icon, cover, properties, comments, body, backlinks,
      and history consistent between page and database surfaces.
- [x] **G-003** Add peek modes and remember per-view open behavior.
- [x] **G-004** Add customizable property layouts: pinned, hidden, sections,
      groups, panel, and full-width content.
- [x] **G-005** Add database-level default page layout and safe propagation to
      existing records.
- [x] **G-006** Add per-record layout overrides where they do not break the
      database contract.
- [x] **G-007** Add comments, mentions, and resolved threads in database record
      context.
- [x] **G-008** Add record history and property-level attribution for humans,
      agents, Git, sync, and filesystem edits.
- [x] **G-009** Add backlinks and relation navigation without double-counting
      generated relation links.
- [x] **G-010** Preserve normal Markdown editing, source mode, and external editor
      compatibility for database records.

## H. Relations, formulas, and rollups

- [x] **H-001** Add one-way and two-way relation creation with stable paired
      identities.
- [x] **H-002** Enforce one/many cardinality and duplicate-link rules.
- [x] **H-003** Handle deleted, moved, inaccessible, and cross-source relation
      targets explicitly.
- [x] **H-004** Add relation pickers with scoped search and permission-safe
      previews.
- [x] **H-005** Define relation behavior when a source or property is deleted or
      restored.
- [x] **H-006** Implement formula parser, formatter, type checker, and versioned
      AST serializer.
- [x] **H-007** Implement the agreed function library for text, number, date,
      boolean, list, relation, and person values.
- [x] **H-008** Build the formula dependency graph and reject or surface cycles.
- [x] **H-009** Recompute only affected formulas and rollups after a change.
- [x] **H-010** Preserve typed formula errors rather than converting them to
      empty strings.
- [x] **H-011** Implement rollup aggregation over permission-filtered relations.
- [x] **H-012** Add formula and rollup editor assistance, references, validation,
      and preview.
- [x] **H-013** Add deterministic timezone, locale, rounding, null, and error
      semantics across core and UI.
- [x] **H-014** Add deep-chain and large-fan-out performance and cycle tests.

## I. Templates, buttons, forms, and automations

- [x] **I-001** Add database templates with property defaults and Markdown body
      starter content.
- [x] **I-002** Add one default template per source and optional defaults per
      view or creation entry point.
- [x] **I-003** Add template duplicate, reorder, edit, archive, and delete flows.
- [x] **I-004** Add repeating templates with schedule, timezone, owner, pause,
      retry, and history.
- [x] **I-005** Add database buttons that execute scoped multi-step actions.
- [x] **I-006** Add Button properties with per-record context and permission
      checks.
- [x] **I-007** Add automation triggers for record added, property changed,
      schedule, form submitted, and button invoked.
- [x] **I-008** Add internal actions for create/update record, add/remove relation,
      assign person, notification, and template application.
- [x] **I-009** Add reviewed external actions such as webhook and email with
      secret isolation and egress policy.
- [x] **I-010** Add automation dry run, test event, versioning, enable/disable,
      ownership, run history, retry, and failure recovery.
- [x] **I-011** Prevent automation loops, duplicate delivery, runaway fan-out,
      and stale-schema execution.
- [x] **I-012** Route automation changes through the same plan, permission,
      audit, and transaction engine as human and agent writes.
- [x] **I-013** Finish Form View response handling, confirmation, closed state,
      duplicate submission, abuse limits, and data retention.

## J. Agent Data Plane — discovery and reads

- [x] **J-001** Extend workspace search with `database`, `data_source`, `view`, and
      `record` result kinds.
- [x] **J-002** Implement catalog discovery over purpose, record meaning,
      aliases, vocabulary, relations, freshness, and canonicality.
- [x] **J-003** Return ranked candidates for ambiguous requests instead of
      selecting silently.
- [x] **J-004** Implement `describe` with schema revision, stable IDs,
      constraints, semantics, sensitivity, relations, and allowed operations.
- [x] **J-005** Implement forgiving natural-language `find` that compiles to an
      inspectable typed query.
- [x] **J-006** Expose exact typed `query` through the server and MCP.
- [x] **J-007** Return matched/returned counts, completeness, cursor, snapshot,
      index freshness, permission exclusions, and truncation cause.
- [x] **J-008** Return `matched_by`, evidence snippets, offsets, and stable
      evidence references for ranked retrieval.
- [x] **J-009** Add bounded relation expansion and deduplication.
- [x] **J-010** Implement token-budgeted Context Pack creation.
- [x] **J-011** Support database card → schema projection → compact record →
      evidence excerpt → full-body progressive disclosure.
- [x] **J-012** Support explicit tokenizer, max tokens, reserve, overflow cursor,
      and conservative byte fallback.
- [x] **J-013** Remove repeated schema labels, null fields, duplicate relations,
      duplicate sources, and irrelevant properties from packs.
- [x] **J-014** Add object-row and columnar/dictionary pack encodings with the
      same semantics.
- [x] **J-015** Add schema revision caching and `not_modified` responses.
- [x] **J-016** Add query IDs, pack IDs, record revision maps, and `delta_since`
      delivery.
- [x] **J-017** Store generated summaries only with source hash, created time,
      model provenance, and stale state.
- [x] **J-018** Add Agent View as a first-class saved projection, scope, token
      budget, semantic contract, and write policy.
- [x] **J-019** Add the “What the agent saw” inspector with exact pack, token
      count, redactions, omissions, freshness, and truncation.
- [x] **J-020** Add “Why was this found?” and “Why was this not found?” traces.
- [x] **J-021** Provide useful recovery data for unknown fields, stale indexes,
      invalid filters, and permission denials.
- [x] **J-022** Keep read tools usable for clients that do not support MCP
      resources or subscriptions.

## K. Agent Data Plane — creation and writes

- [x] **K-001** Implement database creation as an ephemeral desired-state draft.
- [x] **K-002** Let an agent draft record meaning, schema, unique key, views,
      templates, policy, and sample records without creating Git noise.
- [x] **K-003** Implement `ensure_database`, `ensure_property`, `ensure_view`,
      `ensure_relation`, `upsert_records`, and `alter_schema` semantics.
- [x] **K-004** Compile every natural-language target to stable IDs before a plan
      can be committed.
- [x] **K-005** Implement fine-grained `set`, `unset`, `add`, `remove`,
      `increment`, `append`, `link`, and `unlink` operations.
- [x] **K-006** Implement `data_plan` with normalized operations, affected
      objects, exact/sample diff, risk, conflicts, approvals, and postconditions.
- [x] **K-007** Give every plan a hash, snapshot revision, expiry, and immutable
      target set.
- [x] **K-008** Implement `data_commit` with plan ID, idempotency key, expected
      snapshot, and approval token.
- [x] **K-009** Abort by default when target records, schemas, permissions, or
      query snapshots change between plan and commit.
- [x] **K-010** Verify uniqueness, required values, relation integrity, affected
      count, and caller-provided assertions in the transaction.
- [x] **K-011** Roll back the entire transaction when a write or postcondition
      fails.
- [x] **K-012** Return mutation ID, actual diff, verification result, revisions,
      audit receipt, and undo token.
- [x] **K-013** Implement `data_undo` with conflict preview and safe refusal when
      intervening changes make reversal ambiguous.
- [x] **K-014** Implement durable bulk/import/migration tasks with progress,
      cancel, checkpoint, retry, and resume.
- [x] **K-015** Make every UI database mutation use the same core command,
      policy, transaction, and verification engine as agents.
- [x] **K-016** Add Review, Balanced, and Autonomous modes per database and
      session.
- [x] **K-017** Apply row-count, time, action, property, database, and egress
      delegation budgets.
- [x] **K-018** Require explicit approval for destructive, permission, public
      sharing, external communication, and undelegated side-effect operations.
- [x] **K-019** Add an Agent Runs panel showing intent, scope, proposed diff,
      execution, verification, failures, and undo.
- [x] **K-020** Render proposed values as non-canonical ghost state until commit.

## L. Permissions, privacy, and audit

- [x] **L-001** Model an agent as a principal distinct from the invoking user.
- [x] **L-002** Compute effective access as user permission ∩ agent capability ∩
      Agent View policy ∩ session delegation.
- [x] **L-003** Support workspace, database, source, view, row-filter, property,
      and action scopes.
- [x] **L-004** Enforce permissions in catalog, describe, search, query,
      aggregation, relation expansion, context packing, mutation, and audit.
- [x] **L-005** Prevent hidden rows or fields from leaking through counts,
      ranking, formulas, rollups, snippets, errors, or timing-sensitive caches.
- [x] **L-006** Add database create/edit/delete/share permission management.
- [x] **L-007** Add view-only and content-edit-without-schema-change roles.
- [x] **L-008** Add public/share-link policy for databases, views, forms, charts,
      and record pages.
- [x] **L-009** Redact sensitive properties from agent packs and logs according
      to policy.
- [x] **L-010** Store intent summary, plan hash, principal, session, tool version,
      data sources, diff, and verification in the audit receipt.
- [x] **L-011** Keep raw prompts out of audit storage by default; make opt-in
      retention explicit and time-bounded.
- [x] **L-012** Isolate automation and external-action secrets from Markdown,
      manifests, Git, logs, and agent context.
- [x] **L-013** Document that tool policy is not a security boundary for an agent
      with unrestricted filesystem access.
- [x] **L-014** Provide a sandboxed deployment mode where canonical writes must
      pass through the Data Plane.
- [x] **L-015** Add threat modeling for prompt injection in records, malicious
      formulas, links/files, public forms, webhooks, and imported manifests.
- [x] **L-016** Add rate limits, abuse controls, and size/depth bounds to public,
      agent, and automation entry points.
- [ ] **L-017** Complete security and privacy review before public beta and GA.
      Evidence attachment exists at
      `docs/rfcs/0001-database-security-scan-2026-07-22.md`; its current scan is
      non-passing, and named public-beta/GA approval plus residual-risk
      disposition are still required.

## M. Collaboration, offline, Git, and conflict recovery

- [x] **M-001** Broadcast record and view changes in real time without reloading
      the database.
- [x] **M-002** Define CRDT behavior for simultaneous edits to different and the
      same property values.
- [x] **M-003** Serialize schema and view edits so concurrent destructive changes
      cannot silently win.
- [x] **M-004** Show presence and attribution in table cells, record pages, and
      schema operations.
- [x] **M-005** Integrate database changes into existing document history and
      timeline surfaces.
- [x] **M-006** Keep cached databases readable offline and clearly mark index and
      relation freshness.
- [x] **M-007** Queue supported offline writes and reconcile them with optimistic
      concurrency on reconnect.
- [x] **M-008** Provide user-resolvable conflicts for record values, schema,
      options, views, formulas, relations, and automations.
- [x] **M-009** Make manifest and record diffs readable and mergeable in Git.
- [x] **M-010** Detect and recover from partially applied Git changes involving
      multiple records and manifests.
- [x] **M-011** Preserve stable IDs across branch switches, merges, rebases, and
      GitHub synchronization.
- [x] **M-012** Add project-wide checkpoint and rollback support for database
      transactions.
- [x] **M-013** Add deterministic conflict fixtures for human/human, human/agent,
      agent/agent, filesystem/CRDT, and Git/CRDT races.

## N. Import, export, migration, and interoperability

- [x] **N-001** Import CSV and TSV with encoding, delimiter, header, type, option,
      date, and empty-value previews.
- [x] **N-002** Import a folder of existing Markdown with inferred schema shown
      as a draft that requires confirmation.
- [x] **N-003** Import Notion databases, data sources, properties, views,
      relations, rollups, formulas, templates, and record bodies as faithfully as
      the export permits.
- [x] **N-004** Produce a detailed Notion import report for unsupported or
      lossy objects rather than silently flattening them.
- [x] **N-005** Import common Obsidian Properties conventions without taking
      ownership of unrelated metadata.
- [x] **N-006** Export filtered or complete data as CSV with stable, documented
      formatting.
- [x] **N-007** Export a portable Markdown + manifest bundle that round-trips all
      canonical SynapseNote database features.
- [x] **N-008** Export a machine-readable JSON representation with stable IDs and
      schema version.
- [x] **N-009** Preserve file/media references and report missing assets during
      import and export.
- [x] **N-010** Add dry-run, progress, cancellation, resume, and rollback for
      large imports and migrations.
- [x] **N-011** Migrate every supported prior manifest version on fixtures and
      real-world corpora without data loss.
- [x] **N-012** Document manual recovery and downgrade paths for failed
      migrations.
- [x] **N-013** Add import/export parity tests that compare final typed database
      state, not only file counts.

## O. Server API, MCP, and integrations

- [x] **O-001** Add versioned server schemas for catalog, describe, query,
      context pack, plan, commit, undo, and task operations.
- [x] **O-002** Add CRUD and migration endpoints for databases, sources,
      properties, views, templates, records, and automations.
- [x] **O-003** Return RFC 9457-style machine-readable errors with recovery data.
- [x] **O-004** Add snapshot revisions, idempotency, conditional requests, and
      pagination consistently across APIs.
- [x] **O-005** Publish database change events and index state over the existing
      realtime channel.
- [x] **O-006** Register read-only MCP `data` actions: `catalog`, `describe`,
      `find`, `query`, and `pack`.
- [x] **O-007** Register separate MCP `data_plan`, `data_commit`, and `data_undo`
      mutation tools.
- [x] **O-008** Add `data_task` for durable import, migration, and bulk jobs.
- [x] **O-009** Keep MCP schemas portable for clients that reject recursive JSON
      Schema references.
- [x] **O-010** Add MCP resources/subscriptions for schema and snapshot changes
      without making them mandatory.
- [x] **O-011** Expose stable public TypeScript types and document versioning
      guarantees.
- [x] **O-012** Add server/API/MCP contract tests proving identical query and
      mutation semantics.
- [x] **O-013** Add examples for Claude, Codex, OpenCode, Pi, and generic MCP
      clients.

## P. Performance, scalability, and reliability

- [x] **P-001** Define benchmark datasets for 1k, 50k, 500k, and 1m records with
      realistic property, body, relation, and formula distributions.
- [x] **P-002** Meet warm local p95 typed-query latency below 150 ms for 50k
      records and 30 properties on the reference machine.
- [x] **P-003** Set and meet budgets for cold startup, initial index, incremental
      update, view render, formula propagation, and context packing.
- [x] **P-004** Virtualize applicable views and keep memory bounded as records and
      columns grow.
- [x] **P-005** Avoid opening or parsing full Markdown bodies when a property-only
      query does not need them.
- [x] **P-006** Bound full-text, semantic, relation, formula, rollup, aggregation,
      and evidence expansion work.
- [x] **P-007** Respect existing per-document open and frontmatter size limits
      with clear errors and migration guidance.
- [x] **P-008** Remain responsive during index rebuild, import, bulk mutation,
      automation, and Git synchronization.
- [x] **P-009** Recover after process kill, disk full, permission loss, malformed
      file, stale lock, cache corruption, and interrupted rename.
- [x] **P-010** Add backpressure and cancellation for queries, packs, tasks, and
      subscriptions.
- [x] **P-011** Prove deterministic query results and formula outputs across web,
      desktop, server, and supported operating systems.
- [x] **P-012** Add regression gates for latency, memory, bundle size, index size,
      and token use.

## Q. UX quality, accessibility, and internationalization

- [x] **Q-001** Complete database onboarding that explains what one record means,
      canonical folder, stable key, and initial view.
- [x] **Q-002** Provide schema and data previews before importing, converting, or
      migrating existing content.
- [x] **Q-003** Make cell, row, property, view, and database operations fully
      keyboard accessible.
- [x] **Q-004** Provide correct roles, names, focus order, announcements, and
      selection semantics for virtualized grids and boards.
- [x] **Q-005** Meet WCAG 2.2 AA for contrast, focus, motion, errors, forms,
      charts, maps, and non-color cues.
- [x] **Q-006** Support zoom, narrow panes, desktop window resizing, reduced
      motion, high contrast, and screen readers.
- [x] **Q-007** Localize UI strings, property formats, dates, numbers, currency,
      relative time, and collation without changing canonical storage.
- [x] **Q-008** Handle long labels, right-to-left text, CJK input, emoji,
      combining characters, and Unicode normalization.
- [x] **Q-009** Give every destructive or lossy operation a clear scope, preview,
      confirmation policy, and recovery path.
- [x] **Q-010** Add actionable invalid-value, conflict, stale-index, permission,
      offline, and partial-result messaging.
- [x] **Q-011** Preserve existing SynapseNote editor, graph, backlinks, tabs,
      search, history, and desktop interaction conventions.
- [ ] **Q-012** Complete usability testing for database creation, table editing,
      view configuration, relation setup, bulk changes, and agent review.

## R. Observability, testing, and evaluation

- [x] **R-001** Add unit tests for v1 manifest validation, record
      materialization, exact query behavior, projection, pagination, and errors.
- [x] **R-002** Run the existing core test suite, type check, lint, and build with
      the initial foundation.
- [x] **R-003** Add filesystem persistence and failure-injection tests.
- [x] **R-004** Add server API and MCP contract tests.
- [ ] **R-005** Add app DOM tests and end-to-end tests for every primary view and
      mutation journey.

      The focused browser coverage now includes
      `packages/app/tests/a11y/database-primary.e2e.ts` (`DB-A11Y-01` and
      `DB-A11Y-02`), which audit both the canonical Table workspace and an
      inline linked Table after a title-based row is created. The tests are
      discovery-checked. Bounded system-Chrome focused runs on 2026-07-23
      passed all three cases in
      `tests/stress/database-primary-journeys.e2e.ts` (canonical create/edit/
      undo/redo/record route, bulk property edit/undo, and saved-view
      create/switch/rename plus List context inspection) and all three cases
      in `tests/stress/database-document-native-journeys.e2e.ts`. The complete
      primary-view matrix, accessibility suite, reload/agent journeys, and
      Electron capture remain required before closing R-005. The bounded
      `tests/stress/database-manage-properties.e2e.ts` run now also passes the
      add-property case and the valued-property delete flow (record value
      cleanup followed by a separate schema removal review); `f5ff201d` keeps
      the test on the semantic command-palette/breadcrumb contracts. Full
      property/view mutation coverage and the remaining destructive/agent
      matrix are still open. The primary saved-view case also passes view
      settings (sort), duplicate, reorder, and delete in its bounded focused
      run (`4f30e862`).
- [x] **R-006** Add property-based tests for filters, sorts, pagination, formula
      evaluation, transactions, and import/export round trips.
- [x] **R-007** Add fuzz corpora for manifests, YAML/frontmatter, formula syntax,
      cursors, public forms, and agent mutation plans.
- [x] **R-008** Add collaboration, offline, Git, crash-recovery, and concurrency
      race suites.
- [x] **R-009** Instrument latency, index freshness, rebuilds, query truncation,
      context tokens, mutation conflicts, rollbacks, and automation failures without
      recording content.
- [x] **R-010** Add a local diagnostics panel for index state, invalid records,
      schema revisions, tasks, and repair actions.
- [x] **R-011** Reach at least 95% Top-1 correct source selection on the held-out
      discovery set.
- [x] **R-012** Surface ambiguous source selection at least 99% of the time.
- [x] **R-013** Reach at least 90% retrieval recall within budget and 95% evidence
      precision.
- [x] **R-014** Reduce agent input tokens by at least 50% versus full-record
      retrieval on the benchmark.
- [x] **R-015** Reach 100% stable-ID resolution, plan/actual diff equality,
      idempotent retry, rollback, and undo in their applicable test suites.
- [x] **R-016** Produce zero silent truncation, stale-index-as-fresh,
      permission-as-empty, unauthorized read, and unauthorized write outcomes.
- [ ] **R-017** Reach at least 90% prompt-to-valid-database creation without
      manual schema repair.
- [x] **R-018** Evaluate final database state, evidence correctness, tokens, tool
      calls, latency, and recovery rather than transcript appearance alone.
      Evidence: `packages/server/src/database-final-eval.ts` is a pure,
      transport-neutral evaluator; `database-final-eval.test.ts` runs a real
      desired-state draft → reviewed commit → evidence Context Pack → undo
      preview/apply scenario and rejects wrong citations or partial recovery.
      Focused result: 2 tests / 9 expectations passed on 2026-07-22.
- [ ] **R-019** Run accessibility, performance, security, migration, and data-loss
      release gates in CI. Focused workflow added at
      `.github/workflows/database-release-gates.yml`; keep open until its first
      hosted run passes and is attached to the release record.

## S. Documentation, examples, and release readiness

- [x] **S-001** Publish user documentation for database concepts, creation,
      properties, views, filters, sorts, groups, relations, formulas, templates,
      forms, buttons, automations, permissions, and troubleshooting. Evidence:
      [Databases guide](/docs/features/databases) and the existing
      [Editor database details](/docs/features/editor#embedded-and-linked-database-views).
- [x] **S-002** Publish agent documentation for catalog, describe, query, context
      packs, Agent Views, plan/commit, approvals, verification, undo, and token
      budgets. Evidence: [Database Data Plane for agents](/docs/reference/database-agent)
      and the [MCP reference](/docs/reference/mcp).
- [x] **S-003** Publish the canonical manifest and record format with complete
      annotated examples. Evidence: the canonical manifest and Markdown record
      examples in [Database Data Plane for agents](/docs/reference/database-agent#canonical-file-example),
      backed by the versioned core schemas.
- [x] **S-004** Publish API/MCP schemas, examples, error recovery, versioning,
      rate limits, and security guidance. Evidence: [Database Data Plane for
      agents](/docs/reference/database-agent), [MCP reference](/docs/reference/mcp),
      and the [security/privacy release review](https://github.com/Nedian0Brien/SynapseNote/blob/main/docs/rfcs/0001-database-security-privacy-release-review.md).
- [x] **S-005** Publish Notion, CSV, Markdown, and Obsidian migration guides with
      known-loss matrices. Evidence: [Database migration matrix](/docs/migrate/databases),
      [From Notion](/docs/migrate/notion), and [From Obsidian](/docs/migrate/obsidian).
- [x] **S-006** Ship sample databases for tasks, projects, CRM, feedback, content
      calendar, issue tracking, and research evidence. Evidence: the seven
      reviewed starter databases are exposed by `DATABASE_CREATION_TEMPLATES`
      with bounded example records, validated through
      `DatabaseDesiredStateDraftSchema`, and covered by the focused
      `packages/app/src/lib/database-creation.test.ts` suite; the user-facing
      list is documented in the [Databases guide](/docs/features/databases).
- [x] **S-007** Add an in-product beta feedback and diagnostics export flow that
      excludes database content by default. Evidence: the in-product
      `Database diagnostics` command exposes content-free index/schema/task/
      telemetry state, repair previews, and a JSON export whose projection
      omits record paths and body/title values; the focused
      `DatabaseDiagnosticsDialog.test.tsx` suite verifies that contract. The
      Electron `ReportBugDialog` review/send flow and CLI bundle tests cover
      explicit consent and redaction for beta feedback.
- [x] **S-008** Complete third-party notices when map, chart, formula, indexing,
      or other dependencies change. Evidence: `bun run notices` completed and
      regenerated `THIRD_PARTY_NOTICES.md` on 2026-07-21.
- [x] **S-009** Complete changesets and release notes for every behavior-changing
      milestone. Evidence: `.changeset/add-file-native-database-core.md` contains
      the user-facing database release notes and declares the required package
      patch release.
- [x] **S-010** Verify web, local server, CLI, macOS desktop, standalone clone,
      GitHub sync, and supported agent harnesses. Evidence on 2026-07-22:
      app production build and typecheck passed; server direct/HTTP/MCP
      contract, database Git recovery, and cross-branch index synchronization
      suites passed (13 tests / 95 expectations); CLI typecheck and database
      Git-driver suite passed (9 tests / 35 expectations, including standalone
      clone and hosted remote round-trip); desktop typecheck and shared query /
      Formula determinism conformance passed (1 test / 2 expectations).
- [x] **S-011** Run upgrade, downgrade/refusal, backup restore, and clean-clone
      release rehearsals. Evidence on 2026-07-22: core migration/interchange/
      transaction fixtures passed (11 tests / 47 expectations), including
      byte-preserving supported-version handling and refusal of invalid/future
      source or target versions; server commit recovery passed 47 tests / 492
      expectations, including engine restart, backup restore, transaction
      refusal, and exact undo; CLI Git-driver tests passed 9 tests / 35
      expectations, including clean standalone clone and hosted remote
      round-trip. The downgrade runbook documents that unsupported/lossy
      downgrades refuse without changing canonical bytes.
- [x] **S-012** Remove or document experimental flags and unsupported combinations
      before GA. Evidence: the public [Database Data Plane compatibility
      section](/docs/reference/database-agent#compatibility-and-feature-states)
      documents every database capability switch, disabled behavior, explicit
      downgrade contract, and unsupported combination; the canonical design
      RFC remains the normative implementation reference.

## Milestone release gates

### M0 gate — File-native foundation

- [x] Versioned manifest schema parses and serializes deterministically.
- [x] Markdown records materialize to stable typed values.
- [x] Exact snapshot queries filter, sort, project, paginate, and fail explicitly.
- [x] Core tests, type check, lint, and build pass.

### M1 gate — Table alpha

- [ ] Database and record persistence survive restart and cache deletion.
- [ ] Common properties work end to end in an editable Table View.
- [ ] Create/edit/move/delete, multi-select, keyboard, clipboard, undo, and errors
      work in the primary journey.
- [ ] File watcher and derived index remain consistent with external Markdown
      edits.
- [ ] No known critical data-loss, identity, or transaction defect remains.

### M2 gate — Collaborative beta

- [ ] Relations, formulas, rollups, templates, core alternative views, and
      permissions pass end-to-end tests.
- [ ] Realtime collaboration, offline recovery, Git sync, and migrations pass
      failure and conflict suites.
- [ ] Agent catalog, describe, query, and context packs pass retrieval gates.
- [ ] Agent plan, commit, verify, and undo pass mutation gates in Review mode.
- [ ] Accessibility, security, and 50k-record performance budgets pass.

### M3 gate — Notion-class parity

- [ ] Every retained parity-matrix property, view, layout, template, form,
      button, chart, map, automation, permission, and import/export item is complete.
- [ ] Notion migration reports every unsupported or lossy object explicitly.
- [ ] Web and desktop primary workflows pass usability and accessibility review.
- [ ] Public documentation and examples cover all released capabilities.

### M4 gate — Agent-native GA

- [ ] Agent discovery, retrieval, evidence, token, mutation, permission, and
      autonomy eval thresholds all pass.
- [ ] Context Inspector and Agent Runs make every read and write explainable.
- [ ] Balanced and Autonomous modes enforce delegation budgets and approval
      boundaries under adversarial tests.
- [ ] Durable tasks, automation, audit, rollback, and recovery operate reliably
      on production-scale fixtures.
- [ ] There are no unresolved critical security, privacy, data-loss, migration,
      accessibility, or performance issues.
- [ ] A clean standalone clone can rebuild and use every canonical database
      without private services or hidden state.
