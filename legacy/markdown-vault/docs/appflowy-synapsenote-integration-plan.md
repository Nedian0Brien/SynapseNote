# AppFlowy 기반 SynapseNote 통합 계획

**작성일**: 2026-06-21
**기준 AppFlowy 커밋**: `4af02cdc87468be10ab15dbb4afd27fbf53ce89b`
**기준 SynapseNote 보존 브랜치**: `archive/synapsenote-before-appflowy`
**AppFlowy 클론 위치**: `.worktrees/appflowy-upstream`

## 1. AppFlowy 구조 분석

AppFlowy는 React/FastAPI 웹앱이 아니라 Flutter 클라이언트와 Rust 코어로 구성된 크로스플랫폼 워크스페이스다. SynapseNote의 현재 코드를 파일 단위로 이식하기보다, 기능 계약을 AppFlowy의 기존 문서, 폴더, 검색, AI 모듈 위에 올리는 방식이 맞다.

### 주요 레이어

| 영역 | 위치 | 역할 | SynapseNote 연결 포인트 |
| --- | --- | --- | --- |
| Flutter 앱 | `.worktrees/appflowy-upstream/frontend/appflowy_flutter/lib` | 데스크톱/모바일 UI, 플러그인, 워크스페이스 화면 | Context Manager, Knowledge Graph, SynapseNote용 AI/학습 화면 |
| 문서 UI | `frontend/appflowy_flutter/lib/plugins/document` | AppFlowy 문서 편집 화면 | SynapseNote의 마크다운 문서 편집 경험을 AppFlowy 문서 모델로 재해석 |
| AI 채팅 UI | `frontend/appflowy_flutter/lib/plugins/ai_chat` | AI 채팅 플러그인 UI | SynapseNote Agent Chatting의 1차 진입점 |
| 워크스페이스 UI | `frontend/appflowy_flutter/lib/workspace` | 사이드바, 탭, 홈, 뷰 관리 | Knowledge Base 진입점과 Context Rail 배치 |
| Rust AI 코어 | `frontend/rust-lib/flowy-ai` | 채팅, 모델 선택, 로컬 AI, 임베딩, RAG 연동 | SynapseNote의 agent adapter, context snapshot, capture 흐름 이식 |
| Rust 문서 코어 | `frontend/rust-lib/flowy-document` | collab 기반 문서 생성, 로딩, 저장 | 로컬 vault 파일 대신 AppFlowy 문서 collab 저장소 사용 |
| Rust 폴더/뷰 코어 | `frontend/rust-lib/flowy-folder` | 워크스페이스, 뷰 트리, ViewLayout | SynapseNote 노드/디렉토리/문서 트리의 기준 모델 |
| Rust 검색 코어 | `frontend/rust-lib/flowy-search` | 로컬 문서 검색 | Recall, Context 추천, Graph 후보 탐색 |
| 임베딩 | `frontend/rust-lib/flowy-ai/src/embeddings` | 문서 chunk 생성과 embedding | SynapseNote의 RAG/컨텍스트 주입 기반 |
| 저장/파일 | `frontend/rust-lib/flowy-storage` | 첨부/스토리지 서비스 | PDF, 웹 문서, 외부 자산 연결 후보 |

### 중요한 구조적 차이

- SynapseNote는 `VAULT_ROOT` 아래의 마크다운 파일을 직접 읽고 쓰며, SQLite 인덱스로 그래프를 만든다.
- AppFlowy는 `View`, `Document`, `Database`, `Chat` 같은 collab 객체를 중심으로 동작한다.
- SynapseNote의 `/api/*` HTTP 계약은 AppFlowy에 그대로 가져오기 어렵다. Flutter와 Rust FFI 이벤트/엔티티 계약으로 다시 정의해야 한다.
- AppFlowy에는 이미 AI 채팅, 로컬 AI, 문서 임베딩, 로컬 검색, 문서/폴더/워크스페이스 모델이 있다. SynapseNote 기능은 새 저장소를 만들기보다 이 레이어에 얹는 편이 안전하다.

## 2. SynapseNote 핵심 기능 인벤토리

현재 SynapseNote의 제품 목표는 "AI 대화가 사라지지 않고 개인 지식 자산으로 누적되는 지식 운영체제"다. 코드 기준으로 확인한 active 기능은 다음과 같다.

### 기능 목록

| 기능 | 현재 위치 | 현재 계약 | AppFlowy 이전 방향 |
| --- | --- | --- | --- |
| 단일 사용자 인증 | `services/web/backend/app/routers/auth_router.py`, `services/web/frontend/src/shared/auth/AuthContext.jsx` | 세션 쿠키, `SYNAPSENOTE_USER_ID`, `SYNAPSENOTE_USER_PASSWORD` | AppFlowy user/workspace 계정 모델에 흡수. 별도 단일 사용자 로그인은 유지하지 않음 |
| Vault 문서 CRUD | `services/web/backend/app/services/document_service.py`, `document_router.py` | `.md` 파일 create/read/write/delete/move | AppFlowy `DocumentManager`와 view 생성/수정 이벤트로 변환 |
| Vault 트리/노드 목록 | `node_service.py`, `useVaultTree.js`, `Sidebar.jsx` | SQLite `nodes` 테이블 + `/api/nodes` | AppFlowy folder `ViewPB` 트리를 Knowledge Base 목록으로 사용 |
| Knowledge Graph | `graph_service.py`, `GraphView.jsx`, `useGraph.js` | SQLite `nodes`, `edges`, `wikilink`, directory edge | AppFlowy view/document 관계와 backlink/index 결과로 graph projection 생성 |
| Backlinks | `graph_service.get_backlinks`, `BacklinksPanel.jsx` | `edges.edge_type = wikilink` | AppFlowy 문서 파서/검색 인덱스에서 link relation 추출 |
| Markdown editor | `EditorView.jsx`, `wikilinkPlugin.js`, `useFileContent.js` | Milkdown, markdown text 저장 | AppFlowy editor document block 모델로 전환. Markdown import/export는 호환 기능으로 유지 |
| Agent Chatting | `chat_router.py`, `chat_service.py`, `chat_runtime.py`, `ChatPanel.jsx` | chat session/message/run/capture, SSE stream | AppFlowy `flowy-ai` Chat, AIManager, ai_chat 플러그인 확장 |
| Agent adapter 선택 | `services/agent_adapters/{claude_code,codex_cli,gemini_cli}.py` | Claude Code, Codex CLI, Gemini CLI adapter | AppFlowy model source 또는 별도 SynapseNote provider로 Rust 쪽에 새 계약 추가 |
| Context Manager | `context_router.py`, `context_service.py`, `ContextPanel.jsx` | 활성 node id 목록과 UI mock 성격이 섞임 | AppFlowy chat RAG ids + SynapseNote context set 모델로 제품화 |
| Chat capture | `capture_service.py` | 선택 메시지를 `.md` 문서로 저장 | AI 채팅 메시지를 AppFlowy 문서 또는 view로 생성하는 "Save to Knowledge" 액션 |
| Indexing/watching | `VaultIndexer`, `VaultWatcher` | vault 파일 재인덱싱, 파일 감시 | AppFlowy 문서 변경 이벤트와 search/embedding index hook 사용 |
| Backup | `services/backup/backup.sh`, `docker-compose.yml` backup service | vault tar.gz, optional rclone GDrive | AppFlowy 로컬 데이터/워크스페이스 export 백업으로 재설계 |
| Deploy | `deploy/deploy.sh`, `docker-compose.yml` | FastAPI + Vite/nginx + backup container | AppFlowy 기반에서는 앱 빌드/배포 체계 별도 결정 필요 |

### 보존해야 할 SynapseNote 제품 개념

1. **Capture**: AI 대화 중 나온 내용을 문서/노드로 저장한다.
2. **Recall**: 저장된 지식을 검색하고 대화에서 다시 쓴다.
3. **Context Control**: 사용자가 AI가 참조할 문서와 노드를 직접 고른다.
4. **Knowledge Graph**: 폴더/문서 구조와 의미 연결을 시각적으로 탐색한다.
5. **Learn**: 선택한 지식을 질문, 퀴즈, 회고로 재구성한다.

## 3. 1차 구현 로드맵

이식은 "AppFlowy를 SynapseNote처럼 보이게 만드는 작업"이 아니라 "AppFlowy의 문서/AI/검색 기반 위에 SynapseNote의 지식 흐름을 추가하는 작업"으로 잡는다.

### Sprint 0: 기준 고정과 실행 가능성 확인

**목표**: AppFlowy 원본을 실행 가능한 기준으로 고정하고, SynapseNote 기능을 붙일 최소 빌드 경로를 확인한다.

**작업**

1. AppFlowy 원본 브랜치 생성
   - 위치: `.worktrees/appflowy-upstream`
   - 브랜치 예: `feat/synapsenote-foundation`
   - 검증: `git status --short --branch`

2. AppFlowy 개발 환경 확인
   - 위치: `frontend/appflowy_flutter`, `frontend/rust-lib`
   - 확인 항목: Flutter 버전, Rust toolchain, 기존 빌드 명령, generated code 필요 여부
   - 검증: AppFlowy 공식 from-source 절차 기준으로 최소 analyze/test/build 중 하나 통과

3. SynapseNote 기능 계약 freeze
   - 위치: 이 문서와 `docs/product_specification.md`
   - 산출물: 기능별 "유지/변경/폐기" 표
   - 검증: 사용자 확인

### Sprint 1: SynapseNote Knowledge Base 모델을 AppFlowy View 위에 매핑

**목표**: SynapseNote의 노드/문서/디렉토리 개념을 AppFlowy의 View/Document 모델로 대응시킨다.

**작업**

1. View 타입 매핑 정의
   - 위치: `frontend/rust-lib/flowy-folder/src/entities/view.rs`
   - 입력: `ViewLayoutPB::{Document, Grid, Board, Calendar, Chat}`
   - 산출물: SynapseNote node type mapping 문서 또는 enum 확장 여부 결정
   - 검증: 기존 ViewLayout 직렬화와 호환성 확인

2. Knowledge Base 목록 진입점 설계
   - 위치: `frontend/appflowy_flutter/lib/workspace`, `frontend/appflowy_flutter/lib/features/workspace`
   - 산출물: 기존 사이드바/홈에서 SynapseNote Knowledge Base로 진입하는 화면 위치 결정
   - 검증: UI 라우팅이 기존 workspace navigation을 깨지 않음

3. Markdown 호환 전략 결정
   - 위치: `frontend/rust-lib/flowy-document/src/parser`
   - 산출물: 기존 vault markdown을 AppFlowy document data로 import할지, markdown export/import만 유지할지 결정
   - 검증: 샘플 `.md` 3개 import/export round trip

### Sprint 2: Context Manager를 AppFlowy AI Chat에 연결

**목표**: AI 채팅이 어떤 문서/노드를 참조하는지 사용자가 볼 수 있고 바꿀 수 있게 한다.

**작업**

1. Context Set 모델 정의
   - 위치 후보: `frontend/rust-lib/flowy-ai/src/entities.rs`, `frontend/rust-lib/flowy-ai-pub`
   - 필드 후보: `chat_id`, `view_id`, `source_type`, `title`, `locked`, `included`, `token_estimate`
   - 검증: Rust unit test로 직렬화/역직렬화 확인

2. 기존 chat RAG ids 조사 및 확장
   - 위치: `frontend/rust-lib/flowy-ai/src/ai_manager.rs`
   - 기준: `query_chat_rag_ids`, `sync_rag_documents`, `select_chat_rag_ids`
   - 검증: 선택한 view ids가 AI chat request에 반영되는 테스트

3. Flutter Context Rail 추가
   - 위치 후보: `frontend/appflowy_flutter/lib/plugins/ai_chat/presentation`, `frontend/appflowy_flutter/lib/workspace/presentation`
   - UI 원칙: 내부 구현 용어 없이 현재 포함된 문서와 제어 상태만 표시
   - 검증: 데스크톱/모바일 대표 viewport에서 overflow 없음

### Sprint 3: Capture를 "Save to Knowledge"로 구현

**목표**: AI 채팅 메시지를 AppFlowy 문서로 저장하고 Knowledge Base에 즉시 나타나게 한다.

**작업**

1. Chat message selection/action 설계
   - 위치: `frontend/appflowy_flutter/lib/plugins/ai_chat`
   - 산출물: 단일/다중 메시지 선택 후 저장 액션
   - 검증: 메시지 선택 상태와 액션 availability 테스트

2. Rust capture command 추가
   - 위치 후보: `frontend/rust-lib/flowy-ai/src/event_handler.rs`, `frontend/rust-lib/flowy-document/src/manager.rs`, `frontend/rust-lib/flowy-folder/src/manager.rs`
   - 동작: 메시지 본문을 새 document view로 생성
   - 검증: 생성된 view가 folder tree에 나타나고 document data가 열림

3. 저장 결과 피드백
   - 위치: Flutter AI chat UI
   - 문구 원칙: "저장됨", "문서 열기"처럼 사용자 행동 중심
   - 검증: 실패 시 원인과 다음 행동이 보임

### Sprint 4: Knowledge Graph 1차 버전

**목표**: AppFlowy View tree와 문서 링크를 기반으로 SynapseNote식 그래프 탐색을 제공한다.

**작업**

1. Graph projection service 정의
   - 위치 후보: `frontend/rust-lib/flowy-folder`, 별도 `flowy-graph` crate 검토
   - 입력: view tree, document links, search/index metadata
   - 출력: `{ nodes, edges, stats }`와 동등한 내부 모델
   - 검증: directory edge와 wikilink edge가 분리되어 생성됨

2. Flutter graph surface 구현
   - 위치 후보: `frontend/appflowy_flutter/lib/features/workspace` 또는 새 `lib/plugins/knowledge_graph`
   - 범위: 1차는 directory/document 관계 + 클릭해서 문서 열기
   - 검증: 100개 node 샘플에서 프레임 드랍과 라벨 겹침 확인

3. Context Manager와 graph 연결
   - 동작: graph node 선택 -> context set에 추가/제외
   - 검증: 선택된 node가 AI chat context rail에 반영됨

### Sprint 5: Recall과 Learn

**목표**: 저장된 지식을 AI가 다시 꺼내고, 학습 모드로 재구성한다.

**작업**

1. Local search 기반 Recall
   - 위치: `frontend/rust-lib/flowy-search/src/document/local_search_handler.rs`
   - 동작: query 결과를 context 후보로 제안
   - 검증: 검색 결과가 context rail 추천 목록으로 표시됨

2. Embedding 기반 Recall
   - 위치: `frontend/rust-lib/flowy-ai/src/embeddings`
   - 동작: document chunk를 AI context 후보로 사용
   - 검증: 동일 문서 내 관련 chunk가 chat request에 포함됨

3. Learning Studio 1차
   - 위치 후보: Flutter 새 plugin 또는 AI chat preset
   - 범위: 선택한 context set에서 질문/퀴즈 생성
   - 검증: 같은 context set으로 반복 실행 시 문서 출처가 유지됨

## 4. 우선순위 제안

1. **먼저 AppFlowy 실행/빌드 기준을 잡는다.** 실행 기준 없이 기능 설계를 진행하면 Flutter/Rust codegen, FFI, toolchain에서 늦게 막힐 가능성이 크다.
2. **Vault 파일 직접 접근은 1차 이식 대상에서 제외한다.** AppFlowy의 collab document 모델과 충돌한다. 대신 markdown import/export 호환으로 둔다.
3. **Context Manager를 Graph보다 먼저 만든다.** SynapseNote의 차별점은 graph 자체보다 "AI가 지금 무엇을 보고 있는지 사용자가 통제한다"는 흐름에 있다.
4. **Capture는 작은 성공 경로로 시작한다.** 메시지 선택 -> 새 문서 저장 -> 문서 열기까지가 첫 demoable milestone이다.
5. **Graph는 projection으로 시작한다.** AppFlowy 저장 모델을 바꾸지 않고, view/document/search metadata에서 읽기 전용 graph를 만든다.

## 5. 검증 전략

- Rust: 관련 crate의 unit test와 serialization test를 우선 추가한다.
- Flutter: 화면 단위 widget test, 모바일/데스크톱 레이아웃 확인을 추가한다.
- 기능: 각 sprint는 사용자가 직접 확인할 수 있는 demo path를 갖는다.
- 회귀: AppFlowy 원본 문서 생성, 열기, 검색, AI chat 기본 동작이 깨지지 않아야 한다.
- 배포: 기존 SynapseNote `deploy/deploy.sh`는 AppFlowy 기반 전환 후 그대로 쓸 수 없으므로 별도 배포 전략을 정하기 전까지 실행하지 않는다.

## 6. 불확실성과 결정 필요 사항

1. AppFlowy를 현재 SynapseNote repo 루트로 교체할지, 별도 fork/repo로 유지할지 결정해야 한다.
2. SynapseNote의 기존 웹 배포 형태를 계속 유지할지, AppFlowy 데스크톱/모바일 앱 중심으로 갈지 결정해야 한다.
3. 기존 vault markdown을 반드시 실시간 양방향 동기화해야 하는지, 일회성 import/export면 되는지 결정해야 한다.
4. Claude Code/Codex/Gemini CLI adapter를 AppFlowy 안에 넣을지, 로컬 sidecar 서비스로 둘지 결정해야 한다.
5. AppFlowy AGPL 라이선스 위에서 SynapseNote 배포/상용화 계획이 맞는지 확인해야 한다.
