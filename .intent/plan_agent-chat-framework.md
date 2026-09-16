---
title: Agent chat framework integration
slug: agent-chat-framework
stage: plan
status: accepted
---

# Files and sequence

1. Add selected source components and provenance/licenses under packages/app/src/components/agent-chat-framework. Adapt composer to multiline input and tools to Radix disclosures with honest status.
2. Update ChatMessageList.tsx and CliChatPanel.tsx to consume these components. Preserve existing transport and markdown logic.
3. Add the scroll dependency to packages/app/package.json and bun.lock. Regenerate THIRD_PARTY_NOTICES.md and add a patch changeset.
4. Update CliChatPanel.dom.test.tsx for disclosure semantics and add regression coverage for component integration and keyboard submission.
5. Run focused tests, build and launch the task desktop app with isolated user data. Send a real CLI request and inspect rendered output, tool disclosures and cancellation.
6. Commit and push codex/agent-chat-framework; leave the running app for review.

# Verification

- bun run test:file -- packages/app/src/components/chat/CliChatPanel.dom.test.tsx
- bun run test:file -- packages/app/src/components/chat/CliChatSession.dom.test.tsx
- Focused formatter/linter for changed TypeScript files.
- Build the desktop runnable surface; run desktop checks if desktop source changes.
- Inspect real desktop UI and actual CLI streaming, tool output, stop and follow-up.

# Risk and recovery

Scroll behavior and controlled composer state are the main regression risks. Keep CLI transport untouched and test send/reject/stop transitions. The isolated branch can be reverted without altering saved user conversations or the installed application.

# Implementation notes

- Added one localized label to the English/pseudo catalogs and updated the notices generator so vendored source attribution survives regeneration.
- Conversation activation uses a layout effect to comply with React Compiler. Scrolling behavior is verified in the real browser surface; the DOM tests cover transcript restoration and composer submission.

# Results

- CliChatPanel: 33 DOM tests passed, including IME/newline submission, rejected sends, session restoration, permissions, selected context, attachments and tool disclosures.
- CliChatSession: 1 DOM test passed. App typecheck, changed-source Biome/oxlint checks, desktop production build and notice regeneration passed.
- A real Codex request produced tool output and a final response in the desktop app. Tool details opened by mouse and collapsed with Enter; jump-to-latest reached the bottom. Generation cancellation released the transport and a follow-up received an answer.
- The Codex tool host reported a missing `code_mode_host_duration_ns` field to the model during the read request, although command output reached the UI. This external CLI issue remains outside the UI integration.

- Real streaming preserved the earlier reading position. After switching to a new chat and back, the old conversation restored scrollTop 200; jump-to-latest still reached the bottom. A DOM regression covers the hidden-tab restore.

# Message actions follow-up

Add framework message-actions.tsx and ChatMessageActions.tsx; connect every message footer. Retain requestPrompt on user timeline entries for regeneration; reuse the original session and lock concurrent sends during preflight. Extend CliChatPanel DOM tests for copying, failures, original context/attachment reuse, draft preservation and rejected regeneration. Update locales, provenance and changeset. Rebuild the desktop renderer and verify actual clipboard writes and regeneration from the footer.

Message action results: 37 CliChatPanel DOM tests and 7 reducer tests passed, app typecheck and desktop production build passed. In the real desktop app, both copy buttons wrote the expected text to the system clipboard; focusing Regenerate displayed its tooltip; regeneration added a second answer to the same request while retaining the first. No renderer page errors were observed during the live check.
