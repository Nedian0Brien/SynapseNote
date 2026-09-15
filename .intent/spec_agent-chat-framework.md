---
title: Agent chat framework integration
slug: agent-chat-framework
stage: spec
status: accepted
---

# Requirements

- Import the framework's props-based Composer, Message, Conversation and Tool components into the existing chat surface.
- Keep CliChatPanel and its reducer as the source of truth for sessions, transport readiness, cancellation, attachments and provider preferences.
- Preserve ChatMarkdown rendering, document links, selected passages and web previews.
- Tool disclosures show actual output and distinguish working, completed, failed and idle states. Unknown results must not appear successful.
- Streaming follows the bottom until the user scrolls away; a labeled control returns to the latest message. Inactive tabs must not move their scroll position.
- Preserve keyboard submission, Shift+Enter, Korean IME composition and retry after rejected dispatch.
- Vendor only consumed component exports, retain licenses and record the framework revision. Adapt Base UI assumptions to existing Radix components and semantic theme tokens.
- Keep public clone builds independent of the framework checkout.

# Design

Use the framework's base components with existing state as props. The `.aui` runtime wrappers are unnecessary because the CLI bridge already owns execution and persistence. Copy selected source exports with provenance notes; use the upstream conversation scroll dependency. Desktop is the acceptance surface because CLI chat requires its bridge.

# Alternatives

A second chat runtime or the framework demo backend would duplicate session ownership. Importing the entire catalog would add unused dependencies and UI.

# Open questions

None.

# Message actions follow-up

- User messages expose Copy; assistant messages expose Copy and Regenerate when a preceding user request exists.
- Copy writes the message's Markdown, confirms success and reports failures. Icon actions provide focus-accessible tooltips.
- Regenerate appends a new turn in the native session using the original submitted prompt and attachments. It preserves old answers and the current unsent draft. Busy/history-loading states and concurrent sends block regeneration.
