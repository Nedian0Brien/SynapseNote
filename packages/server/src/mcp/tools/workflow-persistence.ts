/**
 * Shared procedural fragments for MCP workflow bodies.
 *
 * Tool-agnostic guidance for crash-safe persistence and host rate-limit /
 * session-interrupt recovery. Workflow bodies interpolate these into their
 * markdown plans so agents on Factory, Cursor, Claude, or any other host get
 * the same durability rules without host-specific code paths.
 */

/** How to refer to the host's durable task/todo system without naming one product. */
export function hostTaskSystemPhrase(): string {
  return "your host's task system (`TaskCreate` in Claude; equivalent task/todo APIs elsewhere — Cursor, Factory, etc.)";
}

/**
 * Generic rate-limit / session-interrupt recovery block. Callers pass a
 * resume hint that tells the agent how to pick up where it left off.
 */
export function buildSessionInterruptRecoverySection(resumeHint: string): string {
  return `## Host rate limits + session interrupts — exit cleanly, resume cheaply

Host platforms may rate-limit tool calls, exhaust a session budget, or compact context mid-run. **This is normal for large wiki generation — design for it, don't fight it.**

When the host signals rate limiting, tool-call budget exhaustion, context pressure, or an imminent session end:

1. **Stop cleanly** — do NOT burst remaining work into a trailing batch held only in context. Finished units belong in the KB; unfinished units wait for the next session.
2. **Never bypass OK for wiki markdown** — native \`Write\`/\`Edit\` on in-scope wiki pages is still forbidden (loses attribution, backlinks, live preview). Rate limits are a pause signal, not an excuse to bypass MCP.
3. **Optional snapshot** — if you wrote substantial content this session, \`checkpoint({ summary: "Wiki partial — <last completed page>" })\` before exiting gives the user a named restore point in \`history\`.
4. **Tell the user what's done** — list pages written, what's next, and that re-invoking resumes without redoing finished pages.
5. **Resume** — ${resumeHint}`;
}

/**
 * Wiki-specific persist-as-you-go rules. Multi-page generation is the primary
 * failure mode when hosts rate-limit mid-session.
 */
export function buildWikiPersistAsYouGoSection(contentDir: string): string {
  return `## Persist as you go — the wiki IS your checkpoint

⛔ **PERSIST AS YOU GO — crash-safe checkpoint rule.** Wiki generation is multi-page and tool-call-heavy. Host platforms may rate-limit or terminate sessions mid-run. The most expensive failure is completed analysis held in context, never written — discarded when the session died. The knowledge base is the checkpoint; these rules make every phase crash-safe:

- **Create \`wiki/OVERVIEW.md\` skeleton early (Phase 2)** — stamp \`profile\` + \`source_commit\` + a nav map (placeholder links are fine) before module pages. Fill sections as you go; don't defer the whole hub to the end.
- **\`write\` each page immediately after reading its source** — one page at a time: read source → \`write\`/\`edit\` page → next. Never batch-survey the whole repo and write all pages in one trailing burst.
- **Interleave read work with writes** — read a module's source, write its page, then move on. Holding five module write-ups in context while still reading is the anti-pattern (see the platform skill's cadence note: durability beats batching).
- **After each page lands, update OVERVIEW nav links if needed** — don't defer all hub updates to Phase 7.
- **Structured notes that live only in your context are not persisted work** — if a section is worth keeping, it belongs in a wiki page via \`write\`/\`edit\`, not in chat or memory.

On resume after any interrupt: re-invoke \`workflow({ kind: "wiki" })\`, inventory partial progress with \`exec("find ${contentDir}/wiki -name '*.md'")\` (or \`exec("ls -R ${contentDir}/wiki")\`), read each partial page via \`exec("cat …")\`, skip completed pages, continue from the first gap in phase order.`;
}

/** Step 0 task list for wiki GENERATE mode — persists across context compaction on hosts that support tasks. */
export function buildWikiCheckpointTasksSection(): string {
  const taskPhrase = hostTaskSystemPhrase();
  return `## Step 0 — Create workflow checkpoint tasks (GENERATE mode)

⛔ **ALWAYS THE FIRST ACTION** after mode detection confirms GENERATE (stub \`source_commit\`). Before any survey read or wiki write — create tasks via ${taskPhrase}. They persist across context compaction, make skipped phases visible, and show progress to the user.

\`\`\`
TaskCreate: "Wiki: Resolve profile + scope (Phase 0)"       → in_progress
TaskCreate: "Wiki: Survey codebase (Phase 1)"             → pending, blocked by #1
TaskCreate: "Wiki: Author OVERVIEW hub (Phase 2)"         → pending, blocked by #2
TaskCreate: "Wiki: Architecture pages (Phase 3)"          → pending, blocked by #3
TaskCreate: "Wiki: Module pages (Phase 4)"                → pending, blocked by #4
TaskCreate: "Wiki: Flow pages (Phase 5)"                  → pending, blocked by #5
TaskCreate: "Wiki: Concept pages (Phase 6)"               → pending, blocked by #6
TaskCreate: "Wiki: Link-graph audit + log (Phase 7)"      → pending, blocked by #7
\`\`\`

Use \`addBlockedBy\` (or equivalent) to enforce ordering. Mark each task \`completed\` as its phase finishes; mark the next \`in_progress\`.

**REFRESH mode:** skip this step — jump to the *Refresh mode* section; create at most one task per affected page cluster if the host supports tasks.

**Rate-limit interrupt:** mark the current phase task still \`in_progress\` (not \`completed\`) so the next session knows where to resume.`;
}
