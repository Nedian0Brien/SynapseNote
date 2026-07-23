# SynapseNote database UX evidence protocol

Status: active local evidence contract (2026-07-23)

This document defines the minimum evidence recorded for a Notion-aligned
database journey. It is deliberately separate from the database data plane:
the evidence describes what a person experienced, never the contents of their
pages or records. DOM and component tests can prove that a signal exists, but
they do not replace a running-app or observed-session record when a checklist
item asks for visual or usability evidence.

## Evidence record

Each completed attempt is one content-free JSON object. Timestamps are elapsed
milliseconds from the journey start, not wall-clock times.

```json
{
  "journeyId": "inline-slash-create",
  "surface": "electron",
  "viewport": "1440x900",
  "entryPoint": "slash:/database",
  "actions": [
    { "id": "open-slash-menu", "atMs": 0 },
    { "id": "choose-inline-database", "atMs": 420 },
    { "id": "reach-editable-table", "atMs": 1830 }
  ],
  "outcome": "success",
  "timeMs": 1830,
  "errors": [],
  "abandonedAtAction": null,
  "recovery": { "attempts": 0, "actions": [], "final": "not-needed" }
}
```

The fields have one meaning across manual notes, browser runs, and Electron
captures:

| Field | Required meaning |
| --- | --- |
| `journeyId` | Stable journey name from the catalog below; do not put a document title, path, record value, or user identifier here. |
| `surface` | `web`, `electron`, `playwright`, or `manual`. A hosted run may use `playwright` plus its host name in the evidence attachment, not in the record. |
| `viewport` | CSS width and height used for the attempt. Use `1280x900`, `1440x900`, or `768x900` for the baseline set unless the journey explicitly tests another size. |
| `entryPoint` | Human-facing route or affordance, such as `new-page`, `sidebar-new-database`, `slash:/database`, `command-palette`, or `linked-view`. Stable IDs are not evidence. |
| `actions` | Semantic user actions, ordered by `atMs`. Count an intentional menu choice or submit as one action; do not inflate the count with implementation events. |
| `outcome` | `success`, `failed`, `cancelled`, or `abandoned`. A success must name the user-visible terminal state in the journey catalog. |
| `timeMs` | Time to the terminal state for success/failure/cancel; `null` for an abandoned attempt without a known terminal timestamp. |
| `errors` | User-visible error or conflict signals, each with a stable code and whether recovery was offered. Console noise without a user-visible effect is not a UX error. |
| `abandonedAtAction` | The last completed semantic action when the person leaves, presses Back, closes the surface, or stops without a terminal result; `null` otherwise. |
| `recovery` | Retry, undo, redo, conflict resolution, offline retry, or agent-run resume attempts and the final result. Use `not-needed` for a clean success. |

## Journey catalog

The catalog is intentionally written in user language. A run may add a
screen-reader or keyboard variant, but it keeps the same `journeyId` and adds
the variant to the attachment metadata.

| Journey | Start | Success terminal state | Primary actions budget |
| --- | --- | --- | ---: |
| `full-page-new-database` | New → Database | Ordinary document page with editable Table and `New` row affordance | 2 |
| `inline-slash-create` | `/database` or `/table` in a document | Inline Table is ready, title is visible, and the first-row affordance is focusable | 3 |
| `linked-view-insertion` | `/database` → Linked view | Existing database view is rendered in the document with shared records | 4 |
| `row-page-continuity` | Table row title | Record page opens and Back/Return restores the same saved view context | 2 |
| `property-edit` | Table → Add property | New property is visible and its first value can be edited | 3 |
| `view-switch` | Saved-view tab | Chosen view is active and its projection/filter remains visible | 2 |
| `agent-proposal` | Contextual Ask agent action | Proposed diff is understandable, reviewable, and either committed or discarded | 4 |
| `destructive-review` | Destructive row/property action | Impact preview is shown and the explicit choice is applied or cancelled | 3 |

## Collection and interpretation rules

1. Record the start signal before the first primary action and stop the timer
   at the terminal state, not at the network response. For a Table, “editable”
   means the title cell or new-row control is visible, enabled, and focusable.
2. Keep semantic action counts independent from latency. A slow but successful
   journey is not a failure; it is a budget miss that must be reported with the
   median and the individual attempt values.
3. Record every recovery attempt, including a retry that succeeds. A failed
   first attempt followed by a successful retry is `outcome: "success"` with a
   non-empty `recovery` object, not a clean success.
4. Treat closing a dialog, browser Back, Escape, permission denial, and an
   offline stop as distinct cancellation/abandonment reasons. Never infer that
   a person “gave up” from a timeout alone.
5. Redact document names, record values, file paths, agent prompts, tokens,
   principal IDs, and clipboard contents before saving an attachment. Keep
   only stable journey IDs, semantic action IDs, timings, error codes, and
   recovery outcomes.
6. A local DOM result is supporting evidence. Close a visual gate only when a
   dated running-app capture (or an approved manual observation) is attached
   alongside the machine-readable record.

## Current supporting evidence

- `packages/app/src/editor/components/DatabaseView.dom.test.tsx` covers the
  inline title, row, cell, paste, undo/redo, context-inspection, and saved-view
  interaction signals.
- The 2026-07-23 direct Electron renderer smoke reached the ready inline table
  after `/database`, including `Table`, `New`, `Filters`, `View settings`, the
  `Title` header, and the new-page affordance. It remains supporting evidence
  until the visual comparison and manual interaction record are attached.
- The existing primary Playwright journey file and accessibility suite define
  the runnable browser attachment points. A missing local Chromium binary is a
  runner limitation, not a reason to change the user-facing success criteria.

Future UX-008/UX-009/UX-1101–UX-1114 attachments should link their records to
this catalog instead of inventing one-off metrics or storing page content.
