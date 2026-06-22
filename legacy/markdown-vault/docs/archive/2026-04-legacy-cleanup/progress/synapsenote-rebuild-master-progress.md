# SynapseNote 재구축 마스터 진행률

**기준 문서**
- [재구축 계획](/home/ubuntu/project/SynapseNote/docs/plans/synapsenote-frontend-backend-rebuild-plan.md)
- [제품 스펙](/home/ubuntu/project/SynapseNote/docs/product_specification.md)
- [디자인 스펙](/home/ubuntu/project/SynapseNote/docs/design/design_specification.md)

**Last Updated**: 2026-03-28
**전체 진행률**: `100%`
**현재 단계**: `Sprint 5 완료 — MVP 배포 완료 / 모바일 고도화 진행 중`
**현재 브랜치**: `main`
**마지막 구현 커밋**: `a5a3719 feat: 모바일 그래프 컨텍스트 주입 흐름을 강화`

## 진행률 기준

- `0%`: 계획만 존재
- `10%`: 아키텍처/저장 전략/범위 확정
- `25%`: 기반 런타임, 인증 베이스, 공통 셸, 테스트 체계 확보
- `50%`: Library/Context/Chat 기본 흐름 동작
- `75%`: Graph/Editor/의미 연결 MVP 동작
- `90%`: 배포 경로, 검증, 운영 문서 정리
- `100%`: MVP 배포 완료 및 동작 확인

## 스프린트 현황

| Sprint | 상태 | 진행률 | 비고 |
| --- | --- | ---: | --- |
| Sprint 0 | 완료 | 100% | 저장 전략, 범위, 아키텍처 방향, 런타임/배포 구조 기준 확정 |
| Sprint 1 | 완료 | 100% | FastAPI 부트스트랩, Next.js 라우트, 로그인 폼, 공통 셸, 배포 리허설 완료 |
| Sprint 2 | 완료 | 100% | Vault 기반 노드 조회 API, Context Session API, Library/Context UI + 디자인 전면 재구축 |
| Sprint 3 | 완료 | 100% | Chat 세션, SSE, 승인 흐름, 캡처, 노드화, Library 연동, CouchDB 영속화 완료 |
| Sprint 4 | 완료 | 100% | Graph Workspace, Editor Workspace, graph→chat 컨텍스트 주입, Next 라우트 통합 완료 |
| Sprint 5 | 완료 | 100% | Docker/Compose 배포 경로 정리, 배포 검증, 진행률 문서 갱신 완료 |

## 이번까지 완료된 항목

### 아키텍처 / 문서
- Vault를 문서 정본으로, CouchDB를 세션/메타데이터/인덱스 저장소로 확정
- 단일 사용자 제품 기준으로 범위 확정
- 그래프 MVP에 구조적 연결 + 의미 연결 포함 확정
- 재구축 구현 계획 문서 작성

### 백엔드
- FastAPI 앱 기본 패키지 추가
- `GET /health` 구현
- `POST /auth/login` 구현
- `GET /api/me` 구현
- 세션 기반 단일 사용자 인증 베이스 구현
- `GET /api/nodes` 구현
- `GET /api/context` 구현
- `POST /api/context` 구현
- `DELETE /api/context/{nodeId}` 구현
- Vault 파일 시스템 스캔 기반 노드 메타데이터 서비스 추가
- 세션 기반 Context Manager 서비스 추가
- 채팅 세션/메시지 저장 계층 추가
- 채팅 정본 저장소를 CouchDB로 전환
- 에이전트 전환과 handoff 요약 추가
- `POST /api/chat/sessions/{sessionId}/runs` 추가
- `GET /api/chat/runs/{runId}/stream` 추가
- `POST /api/chat/runs/{runId}/approvals` 추가
- `POST /api/chat/captures` 추가
- 수정 정책 전환 API 추가
- 승인 필요 / 자동 적용 런타임 분기 추가
- Vault 노드 캡처 서비스 추가
- run/capture 영속화 추가
- `graph_service` / `document_service` 분리
- `graph_router` / `document_router` / `context_router` / `node_router` / `chat_router` 구조로 라우터 정리
- Graph/Document 서비스 단위 테스트 및 라우터 테스트 추가

### 프론트엔드
- Vite 기반에서 Next.js App Router 기반으로 전환 시작
- 글로벌 레이아웃 추가
- 다크 차콜 + 보라/블루 계열 공통 스타일 초안 추가
- `AppShell` 공통 셸 컴포넌트 추가
- 루트 페이지에 셸/로그인 카드 프로토타입 추가
- `/chat`, `/library`, `/graph`, `/editor/[nodeId]` 라우트 추가
- 로그인 폼과 백엔드 로그인 API 연결
- 모바일 하단 내비게이션 초안 추가
- `/library`에 실제 노드 조회/검색/필터 UI 연결
- 우측 `Active Context` 레일에 Context Manager UI 연결
- Library Hero, Integration Status, Neural Load 스타일 추가
- 컨텍스트 포함 상태가 카드와 레일에 동기화되도록 연결
- Chat 세션 목록과 에이전트 선택 UI 추가
- 세션별 수정 정책 전환 UI 추가
- SSE 이벤트 렌더링 추가
- 승인/거절 액션 UI 추가
- 에이전트 메시지 캡처 UI 추가
- `saved_as_node` 블록과 Context 추가 액션 추가
- Library refresh 이벤트 기반 새 노드 반영 추가
- `/graph` 라우트에 실제 Graph Workspace 연결
- `/editor/[nodeId]` 라우트에 실제 Editor Workspace 연결
- 그래프 선택 노드 다중 선택 및 `Inject to Chat` 액션 추가
- graph → context session → chat 전환 흐름 연결
- chat / library에서 graph / chat 워크스페이스 전환 버튼 연결
- `nodeTypes` 유틸과 타입 기반 그래프 렌더링 추가
- 모바일 그래프에서 탭 기반 포커스 카드, 선택 트레이, `Inject to Chat` 흐름 추가
- 모바일 셸에서 Active Context 드로어 접근 추가
- 그래프/에디터 워크스페이스에 viewport 기반 모바일 모드 감지 연결

### 디자인 전면 재구축 (stitch 시안 기반)
- `globals.css` 완전 재작성 — Neural OS 디자인 토큰 시스템 적용
  - `#131313` void 배경, `#D2BBFF` primary, `#7C3AED` container, `#ADC6FF` secondary 팔레트
  - Material Symbols Outlined + Lexend/Inter 폰트 시스템
- `AppShell.jsx` 재구축 — 고정 사이드바(260px) + 고정 탑바(64px) + 컨텍스트 레일(320px)
  - 사이드바: 로고, 아이콘+레이블 네비게이션, New Thought CTA, Footer
  - 탑바: Neural OS 브랜딩, 모델 탭(Claude/GPT-4/Llama 3/Gemini), 검색, 아이콘 버튼
  - 우측 Context Rail: ctx-node 카드(토글/삭제), Neural Load 바, 액션 버튼
- `LibraryWorkspace.jsx` 개선 — Neural Integrations 그리드 추가 (ChatGPT/Claude/Notion/Gemini)
  - node-grid 3열, filter-chip, badge, node-type-chip 컴포넌트
- `ChatWorkspace.jsx` 신규 생성 — stitch 기반 채팅 UI
  - 메시지 버블(user/agent), Agent Action 블록, 입력 영역(chat-input-area)
- 루트 페이지 `/chat`으로 리다이렉트
- 테스트 3개 모두 pass, `next build` 성공

### 배포 / 운영
- 백엔드 전용 Dockerfile 추가
- 프론트엔드 전용 Dockerfile 추가
- `docker-compose.yml`에 `synapsenote-api` + `obsidian-web` 분리 반영
- `deploy.sh`를 프론트/백 동시 배포 기준으로 갱신
- `deploy.sh`가 실행 중인 `couchdb` 컨테이너에서 자격 증명을 읽어 API 재배포 시 주입하도록 보정
- `bash services/web-editor/deploy.sh` 리허설 성공
- `http://127.0.0.1:3002` 응답 확인
- `http://127.0.0.1:8000/health` 응답 확인
- 라이브 `/api/chat/sessions` 요청이 `synapsenote_chat` CouchDB 문서로 저장되는 것 확인
- `bash services/web-editor/deploy.sh` 재실행으로 최신 프론트/백 반영 완료
- `http://127.0.0.1:3002`가 `/chat`으로 리다이렉트되는 것 확인
- `http://127.0.0.1:8000/health`가 `{"status":"ok"}` 반환하는 것 확인
- 모바일 그래프 포커스 카드 / 선택 트레이 포함 버전 재배포 완료

### 테스트 / 검증
- 백엔드 API 테스트 추가
- 프론트 셸 컴포넌트 테스트 추가
- 프론트 로그인 폼 테스트 추가
- 프론트 Library Workspace 테스트 추가
- `pytest`, `vitest`, `next build`, `eslint`, `docker compose config` 검증 완료
- 배포 리허설 후 실제 HTTP 응답 검증 완료
- Sprint 3 채팅 API / 런타임 / 캡처 테스트 추가
- CouchDB 저장소 단위 테스트 추가
- ChatWorkspace 승인/캡처/정책 전환 테스트 추가
- Library refresh 테스트 추가
- Graph Workspace / Editor Workspace 라우트 테스트 추가
- graph → chat 컨텍스트 주입 및 워크스페이스 전환 테스트 추가
- `nodeTypes` 유틸 테스트 추가
- 모바일 그래프 포커스 카드 / 선택 트레이 테스트 추가
- 모바일 컨텍스트 드로어 테스트 추가
- 프런트 `vitest` 전체 23개 테스트 통과 확인
- 프런트 `next build` 성공 확인
- 백엔드 `pytest services/web-editor/backend/tests -q` 50개 테스트 통과 확인

## 다음 작업 후보

1. 그래프 의미 연결 품질 개선
2. Editor 저장/미리보기 UX 고도화
3. 모바일 인터랙션 개선
4. 운영 문서와 런북 보강

## 블로커 / 주의사항

- 검색/필터는 현재 클라이언트 로컬 상태 중심이며, 서버 측 인덱싱/페이지네이션은 후속 작업이다.
- MVP 배포는 완료됐고, 이후 작업은 품질/고도화 단계다.

## 연결 문서

- [Sprint 1 로그](/home/ubuntu/project/SynapseNote/docs/progress/sprint-01-foundation-log.md)
- [Sprint 2 로그](/home/ubuntu/project/SynapseNote/docs/progress/sprint-02-library-context-log.md)
- [Sprint 3 로그](/home/ubuntu/project/SynapseNote/docs/progress/sprint-03-agent-chat-log.md)
