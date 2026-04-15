# Sprint 3 Agent Chat Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CouchDB 기반 채팅 세션 저장, 에이전트 선택/전환, SSE 스트리밍, 메시지 캡처와 Vault 노드화를 Sprint 3 범위 안에서 구현한다.

**Architecture:** FastAPI 백엔드에 채팅 저장/실행/캡처 계층을 추가하고, 에이전트별 CLI 차이는 어댑터로 숨긴다. Next.js 프론트는 ChatWorkspace를 세션 중심 화면으로 확장하고 SSE 이벤트를 실시간 렌더링한다.

**Tech Stack:** FastAPI, Starlette SessionMiddleware, CouchDB, Next.js 16, React 19, SSE, pytest, vitest

---

## File Map

**Backend create**

- `services/web-editor/backend/app/services/chat_store.py`
- `services/web-editor/backend/app/services/chat_service.py`
- `services/web-editor/backend/app/services/chat_runtime.py`
- `services/web-editor/backend/app/services/capture_service.py`
- `services/web-editor/backend/app/services/agent_adapters/__init__.py`
- `services/web-editor/backend/app/services/agent_adapters/base.py`
- `services/web-editor/backend/app/services/agent_adapters/claude_code.py`
- `services/web-editor/backend/app/services/agent_adapters/codex_cli.py`
- `services/web-editor/backend/app/services/agent_adapters/gemini_cli.py`

**Backend modify**

- `services/web-editor/backend/app/main.py`
- `services/web-editor/backend/app/services/context_service.py`

**Frontend modify/create**

- `services/web-editor/frontend/src/components/chat/ChatWorkspace.jsx`
- `services/web-editor/frontend/src/styles/chat.css`
- `services/web-editor/frontend/src/app/chat/page.js`
- `services/web-editor/frontend/src/components/shell/AppShell.jsx`
- `services/web-editor/frontend/src/contexts/AuthContext.jsx`
- `services/web-editor/frontend/src/components/chat/AgentSelector.jsx`
- `services/web-editor/frontend/src/components/chat/ChatSessionList.jsx`
- `services/web-editor/frontend/src/components/chat/RunEventStream.js`

**Tests create/modify**

- `services/web-editor/tests/test_chat_api.py`
- `services/web-editor/tests/test_capture_api.py`
- `services/web-editor/tests/test_agent_runtime.py`
- `services/web-editor/frontend/src/components/chat/ChatWorkspace.test.jsx`

### Task 1: Define backend chat store and failing tests

**Files:**
- Create: `services/web-editor/tests/test_chat_api.py`
- Create: `services/web-editor/backend/app/services/chat_store.py`

- [ ] Step 1: Write failing tests for session creation, message persistence, and agent switch records.
- [ ] Step 2: Run `pytest services/web-editor/tests/test_chat_api.py -q` and confirm failure.
- [ ] Step 3: Implement minimal in-store persistence shape for `ChatSession`, `ChatMessage`, `AgentRun`, `HandoffRecord`.
- [ ] Step 4: Run `pytest services/web-editor/tests/test_chat_api.py -q` and confirm pass.
- [ ] Step 5: Commit with `feat` tag.

### Task 2: Expose chat session and message APIs

**Files:**
- Modify: `services/web-editor/backend/app/main.py`
- Create: `services/web-editor/backend/app/services/chat_service.py`
- Test: `services/web-editor/tests/test_chat_api.py`

- [ ] Step 1: Add failing API tests for session list/create, message list/create, and agent change.
- [ ] Step 2: Run the targeted pytest command and verify failure.
- [ ] Step 3: Implement session-authenticated chat endpoints with consistent response envelopes.
- [ ] Step 4: Re-run targeted pytest and confirm pass.
- [ ] Step 5: Commit the API surface.

### Task 3: Implement run orchestration and SSE stream

**Files:**
- Create: `services/web-editor/backend/app/services/chat_runtime.py`
- Modify: `services/web-editor/backend/app/main.py`
- Create: `services/web-editor/tests/test_agent_runtime.py`

- [ ] Step 1: Write failing tests for run creation and SSE event ordering.
- [ ] Step 2: Run `pytest services/web-editor/tests/test_agent_runtime.py -q` and confirm failure.
- [ ] Step 3: Implement run lifecycle, in-memory stream broker, and `run_started`/`run_completed` events.
- [ ] Step 4: Re-run runtime tests and confirm pass.
- [ ] Step 5: Commit the run orchestration layer.

### Task 4: Add agent adapter abstraction

**Files:**
- Create: `services/web-editor/backend/app/services/agent_adapters/base.py`
- Create: `services/web-editor/backend/app/services/agent_adapters/claude_code.py`
- Create: `services/web-editor/backend/app/services/agent_adapters/codex_cli.py`
- Create: `services/web-editor/backend/app/services/agent_adapters/gemini_cli.py`
- Modify: `services/web-editor/backend/app/services/chat_runtime.py`
- Test: `services/web-editor/tests/test_agent_runtime.py`

- [ ] Step 1: Add failing adapter tests for provider selection and normalized event conversion.
- [ ] Step 2: Run the runtime tests and verify failure.
- [ ] Step 3: Implement a common adapter interface and stub adapters for three agent CLIs.
- [ ] Step 4: Re-run runtime tests and confirm pass.
- [ ] Step 5: Commit adapter abstraction.

### Task 5: Implement handoff summary generation

**Files:**
- Modify: `services/web-editor/backend/app/services/chat_service.py`
- Modify: `services/web-editor/backend/app/services/chat_runtime.py`
- Test: `services/web-editor/tests/test_chat_api.py`

- [ ] Step 1: Write failing tests for server summary generation and agent-summary merge during agent switch.
- [ ] Step 2: Run targeted tests and verify failure.
- [ ] Step 3: Implement handoff record creation with `serverSummary` and optional `agentSummary`.
- [ ] Step 4: Re-run tests and confirm pass.
- [ ] Step 5: Commit handoff logic.

### Task 6: Implement edit policy and approval flow

**Files:**
- Modify: `services/web-editor/backend/app/services/chat_runtime.py`
- Modify: `services/web-editor/backend/app/main.py`
- Test: `services/web-editor/tests/test_agent_runtime.py`

- [ ] Step 1: Add failing tests for `approval_required` and `auto_apply` behavior.
- [ ] Step 2: Run runtime tests and confirm failure.
- [ ] Step 3: Implement `proposed_change`, approval endpoint, and `file_change` event flow.
- [ ] Step 4: Re-run runtime tests and confirm pass.
- [ ] Step 5: Commit edit policy support.

### Task 7: Implement capture and node creation

**Files:**
- Create: `services/web-editor/backend/app/services/capture_service.py`
- Create: `services/web-editor/tests/test_capture_api.py`
- Modify: `services/web-editor/backend/app/main.py`

- [ ] Step 1: Write failing tests for message capture and Vault node creation.
- [ ] Step 2: Run `pytest services/web-editor/tests/test_capture_api.py -q` and confirm failure.
- [ ] Step 3: Implement capture API and saved-node message block insertion.
- [ ] Step 4: Re-run capture tests and confirm pass.
- [ ] Step 5: Commit capture flow.

### Task 8: Build chat session UI shell

**Files:**
- Modify: `services/web-editor/frontend/src/components/chat/ChatWorkspace.jsx`
- Create: `services/web-editor/frontend/src/components/chat/AgentSelector.jsx`
- Create: `services/web-editor/frontend/src/components/chat/ChatSessionList.jsx`
- Create: `services/web-editor/frontend/src/components/chat/RunEventStream.js`
- Test: `services/web-editor/frontend/src/components/chat/ChatWorkspace.test.jsx`

- [ ] Step 1: Write failing component tests for session list, agent selector, and empty chat state.
- [ ] Step 2: Run `npm test -- --run src/components/chat/ChatWorkspace.test.jsx` and confirm failure.
- [ ] Step 3: Implement the minimal UI to load sessions and select an agent.
- [ ] Step 4: Re-run targeted tests and confirm pass.
- [ ] Step 5: Commit chat UI shell.

### Task 9: Render SSE stream and edit-policy controls

**Files:**
- Modify: `services/web-editor/frontend/src/components/chat/ChatWorkspace.jsx`
- Modify: `services/web-editor/frontend/src/styles/chat.css`
- Test: `services/web-editor/frontend/src/components/chat/ChatWorkspace.test.jsx`

- [ ] Step 1: Add failing tests for streamed message rendering and edit-policy toggles.
- [ ] Step 2: Run targeted frontend tests and verify failure.
- [ ] Step 3: Implement SSE subscription, partial message rendering, and approval prompts.
- [ ] Step 4: Re-run targeted frontend tests and confirm pass.
- [ ] Step 5: Commit stream UX.

### Task 10: Add capture UI and cross-surface refresh

**Files:**
- Modify: `services/web-editor/frontend/src/components/chat/ChatWorkspace.jsx`
- Modify: `services/web-editor/frontend/src/components/library/LibraryWorkspace.jsx`
- Modify: `services/web-editor/frontend/src/styles/chat.css`
- Test: `services/web-editor/frontend/src/components/chat/ChatWorkspace.test.jsx`

- [ ] Step 1: Write failing tests for capture actions and saved-node confirmation blocks.
- [ ] Step 2: Run targeted frontend tests and verify failure.
- [ ] Step 3: Implement capture action, saved-node block, and data refresh hooks for Library/Context.
- [ ] Step 4: Re-run tests and confirm pass.
- [ ] Step 5: Commit capture UX.

### Task 11: Full verification and docs sync

**Files:**
- Modify: `docs/progress/synapsenote-rebuild-master-progress.md`
- Modify: `docs/progress/sprint-02-library-context-log.md`
- Create or modify: `docs/progress/sprint-03-agent-chat-log.md`

- [ ] Step 1: Run `pytest services/web-editor/tests -q`.
- [ ] Step 2: Run `npm test`.
- [ ] Step 3: Run `npm run build`.
- [ ] Step 4: Update progress docs to reflect Sprint 3 actual state.
- [ ] Step 5: Commit docs and verification results.
