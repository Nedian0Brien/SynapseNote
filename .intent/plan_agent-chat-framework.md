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
