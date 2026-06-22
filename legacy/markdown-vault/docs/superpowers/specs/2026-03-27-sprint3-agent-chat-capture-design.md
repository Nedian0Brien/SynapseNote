# Sprint 3 Agent Chat Capture Design

**Date:** 2026-03-27
**Branch:** `feature/sprint3-agent-chat-capture`
**Scope:** Sprint 3 전체

## Goal

`Agent Chatting`을 실제 작동하는 핵심 흐름으로 전환한다. 사용자는 세션마다 에이전트를 선택해 대화하고, 대화 결과를 실시간으로 보며, 중요한 내용을 즉시 Vault 노드로 캡처할 수 있어야 한다.

## Decisions

- 채팅 정본 저장소는 `CouchDB`
- Vault에는 캡처되어 노드화된 산출물만 기록
- 에이전트는 외부 API가 아니라 로컬 실행 가능한 에이전트 CLI를 사용
  - `Claude Code`
  - `Codex CLI`
  - `Gemini CLI`
- 전송 계층은 `SSE`
- 에이전트는 세션 수준에서 선택하되, 세션 중 전환 가능
- 전환 시 컨텍스트는 `서버 규칙 기반 요약 + 직전 에이전트 자기 요약`을 혼합
- 파일 수정 정책은 세션 설정으로 제어
  - `approval_required`
  - `auto_apply`

## Architecture

Sprint 3는 네 개의 계층으로 나눈다.

1. 저장 계층
`ChatSession`, `ChatMessage`, `AgentRun`, `HandoffRecord`, `CaptureRecord`를 저장한다. 정본은 CouchDB이며, UI 상태와 실행 이력도 여기에서 복원한다.

2. 실행 계층
선택된 에이전트에 따라 어댑터를 붙인다. 에이전트별 CLI 옵션과 출력 차이는 어댑터에서 흡수하고, 서버는 공통 이벤트 포맷으로 정규화한다.

3. 스트리밍 계층
실행 단위는 메시지가 아니라 `run`이다. 사용자가 메시지를 보내면 서버가 run을 만들고, 프론트는 해당 run의 SSE 스트림을 구독한다.

4. 캡처 계층
메시지 일부 또는 전체를 선택해 Vault 기반 문서 노드로 저장한다. 저장 후 Library와 Context에서 즉시 조회 가능해야 한다.

## Data Model

### ChatSession

- `id`
- `title`
- `selectedAgent`
- `editPolicy`
- `contextNodeIds`
- `createdAt`
- `updatedAt`

### ChatMessage

- `id`
- `sessionId`
- `role`
- `agent`
- `blockType`
- `content`
- `contextIds`
- `contextSnapshot`
- `createdAt`

`blockType`는 최소 다음 값을 지원한다.

- `user_message`
- `agent_response`
- `neural_insight`
- `agent_action`
- `saved_as_node`

### AgentRun

- `id`
- `sessionId`
- `messageId`
- `agent`
- `status`
- `editPolicy`
- `startedAt`
- `endedAt`
- `error`

### HandoffRecord

- `id`
- `sessionId`
- `fromAgent`
- `toAgent`
- `serverSummary`
- `agentSummary`
- `recentMessageIds`
- `createdAt`

### CaptureRecord

- `id`
- `sessionId`
- `sourceMessageIds`
- `targetNodePath`
- `status`
- `createdAt`

## Agent Execution Model

공통 인터페이스는 `AgentAdapter`로 둔다.

- `build_handoff_context(session, run)`
- `start_run(run, context)`
- `stream_events(process)`
- `cancel_run(run_id)`

구현체는 다음 세 개다.

- `ClaudeCodeAdapter`
- `CodexCliAdapter`
- `GeminiCliAdapter`

서버는 선택된 에이전트에 따라 어댑터를 고르고, 각 어댑터 출력은 공통 이벤트 스키마로 변환한다.

## Handoff Strategy

에이전트 전환 시 새 에이전트에 전달되는 입력은 다음 네 층으로 구성한다.

1. 세션 원본 로그
2. 최근 메시지 슬라이딩 윈도우
3. Active Context와 작업 메타데이터
4. handoff summary

handaoff summary는 아래 두 소스를 합성한다.

- 서버 규칙 기반 요약
- 직전 에이전트가 남긴 자기 요약

직전 에이전트 요약이 없거나 실패해도, 서버 요약만으로 전환이 성립해야 한다.

## SSE Event Contract

프론트는 run 단위 SSE를 구독한다. 기본 이벤트 타입은 다음과 같다.

- `run_started`
- `handoff_ready`
- `agent_thinking`
- `message_delta`
- `tool_event`
- `proposed_change`
- `file_change`
- `capture_candidate`
- `run_completed`
- `run_failed`

모든 이벤트는 최소한 다음 필드를 가진다.

- `runId`
- `sessionId`
- `agent`
- `timestamp`
- `type`
- `payload`

## Edit Policy

세션은 `editPolicy`를 가진다.

### approval_required

- 에이전트가 파일 수정 의도를 내면 서버가 `proposed_change` 이벤트 생성
- 사용자가 승인하면 실제 파일 변경 실행
- 승인 전에는 Vault에 쓰지 않음

### auto_apply

- 허용된 범위 안에서는 즉시 수정 수행
- 서버는 `file_change` 이벤트와 변경 로그 저장
- 변경 내역은 채팅 이력과 캡처 기록에서 추적 가능해야 함

## API Surface

Sprint 3 1차 기준 API는 다음을 포함한다.

- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/{session_id}`
- `POST /api/chat/sessions/{session_id}/messages`
- `GET /api/chat/sessions/{session_id}/messages`
- `POST /api/chat/sessions/{session_id}/agent`
- `POST /api/chat/sessions/{session_id}/runs`
- `GET /api/chat/runs/{run_id}/stream`
- `POST /api/chat/runs/{run_id}/approve-change`
- `POST /api/chat/captures`

## UI Scope

### Chat Workspace

- 세션 목록 또는 세션 진입점
- 현재 세션 에이전트 표시
- 에이전트 전환 액션
- editPolicy 표시 및 전환
- SSE 기반 메시지 스트리밍
- `Neural Insight`, `Agent Action`, `Saved as Node` 블록 렌더링
- 메시지 선택 후 캡처

### Context Integration

- 현재 `Active Context`를 세션 컨텍스트로 사용
- run 시작 시 context snapshot 저장
- 캡처 완료 후 Library/Context 즉시 반영

## Risks

- 각 에이전트 CLI의 출력 포맷이 서로 달라 이벤트 정규화 난도가 높다.
- 파일 수정 가능 에이전트는 승인 정책과 경계 검증이 미흡하면 위험하다.
- SSE 연결 끊김 시 run 상태와 메시지 저장이 어긋날 수 있다.
- CouchDB 스키마를 너무 느슨하게 두면 세션 전환과 캡처 추적이 어려워진다.

## Non-Goals

- 완전한 다중 사용자 모델
- 고급 권한 체계
- 의미 그래프 인덱싱
- 학습 스튜디오 구현
- 외부 SaaS 챗봇 연동 자동 수집

## Acceptance Criteria

- 사용자가 세션을 만들고 에이전트를 선택할 수 있다.
- 선택된 에이전트와 SSE 기반으로 대화할 수 있다.
- 에이전트 전환 시 handoff가 생성되고 이후 응답에 반영된다.
- 승인 모드와 자동 수정 모드를 전환할 수 있다.
- 채팅 메시지를 캡처해 Vault 노드로 저장할 수 있다.
- 저장 결과가 Library/Context에서 즉시 보인다.
