# Sprint 3 로그: Agent Chat / Capture

**Sprint Goal**
- 채팅 세션과 메시지를 저장할 수 있는 백엔드 구조를 만든다.
- Claude Code / Codex CLI / Gemini CLI 선택형 세션 흐름을 구현한다.
- SSE 기반 실행 이벤트, 승인 흐름, 캡처와 Vault 노드화를 연결한다.

**상태**: `완료`
**진행률**: `100%`
**시작일**: 2026-03-27
**마지막 업데이트**: 2026-03-27

## 완료된 작업

### 1. 채팅 저장 계층과 API
- 파일: [chat_store.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/chat_store.py)
- 파일: [chat_service.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/chat_service.py)
- 파일: [main.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/main.py)
- 내용:
  - `ChatSession`, `ChatMessage`, `HandoffRecord` 저장 구조 추가
  - `GET/POST /api/chat/sessions`
  - `GET/POST /api/chat/sessions/{sessionId}/messages`
  - `POST /api/chat/sessions/{sessionId}/agent`
  - `POST /api/chat/sessions/{sessionId}/policy`

### 1-1. CouchDB 정본 저장소 이관
- 파일: [chat_store.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/chat_store.py)
- 파일: [chat_runtime.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/chat_runtime.py)
- 파일: [capture_service.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/capture_service.py)
- 파일: [deploy.sh](/home/ubuntu/project/SynapseNote/services/web-editor/deploy.sh)
- 파일: [docker-compose.yml](/home/ubuntu/project/SynapseNote/docker-compose.yml)
- 내용:
  - 기본 저장소를 `in_memory`에서 `couchdb`로 전환
  - 단일 DB에 `session`, `message`, `handoff`, `run`, `capture` 문서 타입 분리 저장
  - 런타임 run 상태와 capture 기록도 함께 영속화
  - API 컨테이너에 CouchDB 접속 환경 변수 추가
  - 배포 스크립트가 실행 중인 `couchdb` 컨테이너에서 자격 증명을 읽어 API 재배포 시 주입하도록 보정

### 2. 에이전트 실행과 SSE 스트림
- 파일: [chat_runtime.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/chat_runtime.py)
- 파일: [agent_adapters/base.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/agent_adapters/base.py)
- 파일: [agent_adapters/claude_code.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/agent_adapters/claude_code.py)
- 파일: [agent_adapters/codex_cli.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/agent_adapters/codex_cli.py)
- 파일: [agent_adapters/gemini_cli.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/agent_adapters/gemini_cli.py)
- 내용:
  - `POST /api/chat/sessions/{sessionId}/runs`
  - `GET /api/chat/runs/{runId}/stream`
  - 에이전트별 어댑터 추상화 추가
  - `agent_thinking`, `proposed_change`, `file_change`, `run_completed` 이벤트 표준화

### 3. handoff와 승인 흐름
- 파일: [chat_service.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/chat_service.py)
- 파일: [chat_runtime.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/chat_runtime.py)
- 파일: [main.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/main.py)
- 내용:
  - 서버 자동 요약 + 에이전트 요약 혼합 handoff 기록
  - 승인 필요 모드에서 `pending_approval` 상태 유지
  - `POST /api/chat/runs/{runId}/approvals` 추가
  - 승인 시 `file_change`, 거절 시 `change_rejected` 후속 처리

### 4. 캡처와 Vault 노드화
- 파일: [capture_service.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/capture_service.py)
- 파일: [main.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/main.py)
- 내용:
  - `POST /api/chat/captures` 추가
  - 선택한 메시지를 Vault Markdown 파일로 저장
  - 채팅에 `saved_as_node` 블록 삽입

### 5. Chat UI
- 파일: [ChatWorkspace.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/chat/ChatWorkspace.jsx)
- 파일: [AgentSelector.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/chat/AgentSelector.jsx)
- 파일: [ChatSessionList.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/chat/ChatSessionList.jsx)
- 파일: [RunEventStream.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/chat/RunEventStream.js)
- 내용:
  - 세션 목록과 에이전트 선택 UI
  - 세션별 수정 정책 전환 UI
  - 메시지 전송 후 SSE 이벤트 렌더링
  - `proposed_change` 승인/거절 버튼 연결
  - 에이전트 메시지 캡처 버튼 연결
  - `saved_as_node`에서 `Add to Context` 액션 추가

### 6. Library / Context 교차 반영
- 파일: [LibraryWorkspace.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/library/LibraryWorkspace.jsx)
- 파일: [libraryRefreshBus.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/libraryRefreshBus.js)
- 내용:
  - 캡처 성공 시 Library refresh 이벤트 발행
  - Library가 `/api/nodes`를 다시 읽어 새 노드를 즉시 반영
  - Chat의 Active Context를 `/api/context` 기준으로 동기화

### 7. 테스트 / 검증
- 파일: [test_chat_api.py](/home/ubuntu/project/SynapseNote/services/web-editor/tests/test_chat_api.py)
- 파일: [test_agent_runtime.py](/home/ubuntu/project/SynapseNote/services/web-editor/tests/test_agent_runtime.py)
- 파일: [test_capture_api.py](/home/ubuntu/project/SynapseNote/services/web-editor/tests/test_capture_api.py)
- 파일: [ChatWorkspace.test.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/chat/ChatWorkspace.test.jsx)
- 파일: [LibraryWorkspace.test.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/library/LibraryWorkspace.test.jsx)
- 내용:
  - 채팅 API 테스트
  - CouchDB 저장소 단위 테스트
  - 승인 흐름 테스트
  - 캡처 API 테스트
  - 채팅 UI 스트림/캡처/정책 전환 테스트
  - Library refresh 테스트

## 검증 기록

- `pytest services/web-editor/tests/test_api_app.py services/web-editor/tests/test_chat_api.py services/web-editor/tests/test_agent_runtime.py services/web-editor/tests/test_capture_api.py -q` 통과
- `npm test -- --run src/components/chat/ChatWorkspace.test.jsx src/components/library/LibraryWorkspace.test.jsx src/components/shell/AppShell.test.jsx src/components/auth/LoginForm.test.jsx` 통과
- `npm run build` 통과
- 실 CouchDB 검증:
  - `synapsenote_chat_verify` DB에 `session/message/run/capture` 문서 생성 확인 후 정리

## 마감 정리

1. Sprint 3의 완료 조건이었던 `CouchDB 정본 저장`까지 닫혔다.
2. Chat 세션, SSE, 승인 흐름, 캡처, Vault 노드화, Library/Context 연동이 모두 구현됐다.
3. 다음 작업은 Sprint 4의 `Graph / Editor / 의미 연결`로 넘어간다.
