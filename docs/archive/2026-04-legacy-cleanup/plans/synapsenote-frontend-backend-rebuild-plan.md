# Plan: SynapseNote 프론트엔드·백엔드 재구축

**Generated**: 2026-03-26
**Last Updated**: 2026-03-26 (검토 피드백 반영)
**Estimated Complexity**: High

## Overview

`docs/design/design_specification.md`와 `docs/product_specification.md` 기준으로 시냅스노트를 `AI 채팅 + Context Manager + Knowledge Base`의 순환 구조로 다시 세운다.

이번 재구축은 현재의 `Flask + Vite` 단일 서비스 보수보다, 아래 방향의 구조 재정의를 목표로 한다.

- 프론트엔드: `Next.js / React` 기반 공통 앱 셸 재구성
- 백엔드: `FastAPI` 기반 도메인 API, 인증, 에이전트 오케스트레이션 계층 분리
- 데이터 계층: `CouchDB` 동기화 자산은 유지하되, 노드/문서/채팅/컨텍스트를 명시적 도메인 모델로 재정리
- UX 계층: `Active Context`를 중심 허브로 두고 Chat, Library, Graph, Editor를 하나의 셸 안에서 연결

## Assumptions

- 기존 `services/couchdb`, `services/livesync-bridge`, `services/pdf-extractor`는 재사용한다.
- 기존 `services/web-editor/app.py`의 Flask 앱은 점진 폐기 대상으로 보고, FastAPI 서비스로 대체한다.
- 기존 `services/web-editor/frontend`는 Vite 앱에서 Next.js 앱으로 전환한다.
- 문서 본문과 디렉토리 구조의 정본은 Vault의 Markdown 파일과 파일 시스템이다.
- `CouchDB`는 사용자 세션, 채팅 로그, 컨텍스트 상태, 노드 메타데이터, 검색/그래프 인덱스 저장소로 사용한다.
- 현재 제품은 단일 사용자 제품으로 가정하고 권한 모델은 단일 사용자 기준으로 단순화한다.
- MVP의 우선순위는 기획서 15장의 범위를 따른다.
- `Learning Studio`, 고급 RAG, 외부 챗봇 자동 수집은 후속 확장으로 둔다.
- 문서 본문은 Markdown 중심으로 유지하고, 그래프는 디렉토리 구조 기반 연결과 의미 연결을 모두 MVP 범위에 포함한다.
- Sprint 1의 FastAPI 부트스트랩(Task 1.1)과 Next.js 전환(Task 1.2)은 독립적으로 병렬 진행한다.

## Target Architecture

### Frontend

- 위치: `services/web-editor/frontend`
- 스택: `Next.js`, `React 19`, 타입스크립트 우선, 반응형 공통 셸
- 주요 영역:
  - `src/app`: 라우팅 및 화면 진입점
  - `src/features/chat`
  - `src/features/context`
  - `src/features/library`
  - `src/features/graph`
  - `src/features/editor`
  - `src/components/shell`
  - `src/styles/tokens.css`

### Backend

- 권장 위치: `services/web-editor/backend`
- 스택: `FastAPI`, Pydantic, 서비스/리포지토리 분리
- 주요 영역:
  - `app/main.py`
  - `app/api`
  - `app/domain`
  - `app/services`
  - `app/repositories`
  - `app/models`
  - `app/core`

### Data / Infra

- Vault/Markdown: 문서 본문, 디렉토리 구조, 기본 링크 구조의 정본
- `CouchDB`: 사용자 세션, 노드 메타데이터, 채팅, 컨텍스트 상태, 검색/그래프 인덱스 저장
- `Qdrant`: MVP 이후 RAG 확장 기본 슬롯만 확보
- Docker Compose: 프론트/백 별도 서비스로 분리하고 기존 `obsidian-web` 배포 흐름은 재정의

## MVP Scope

- 공통 앱 셸
- `Chat / Context Manager / Knowledge Base` 3축 정보 구조
- `Library View` (카드 그리드, 검색, 필터)
- 구조적 연결 + 의미 연결을 포함한 `Knowledge Graph View`
- 메시지 저장을 통한 노드화
- 문서형 노드 편집 화면
- 우측 `Active Context` 레일
- 모바일 전환 구조
- id/pw 인증
- 실시간 채팅 스트리밍 (SSE)
- Vault 파일 감시 및 CouchDB 인덱스 동기화

## Non-Goals For MVP

- Learning Studio 완성형
- 외부 AI 채널 자동 수집
- Git Issue / PDF / Web Article 전용 고급 파서
- 의미 기반 추천 연결 자동화
- 완성형 벡터 검색 및 고급 오케스트레이션

---

## Sprint 0: 아키텍처 고정과 재구축 베이스라인

**Goal**: 재구축 중 흔들리면 안 되는 서비스 경계, 데이터 기준, 화면 셸 규칙, 실시간 통신 방식, 의미 연결 전략을 고정한다.

**Demo/Validation**:
- 새 프론트/백 서비스 디렉토리 구조가 합의된다.
- `docker-compose.yml`에서 프론트/백 분리 초안이 잡힌다.
- 화면 IA, API 초안, 노드 모델 초안, 의미 연결 전략, 실시간 통신 방식이 문서로 확인된다.

### Task 0.1: 저장소 재구성 초안 수립
- **Location**: `docker-compose.yml`, `services/web-editor/`, `docs/plans/`
- **Description**: 기존 `obsidian-web` 단일 서비스 구조를 `frontend`와 `backend` 중심으로 재편하는 목표 구조를 정의한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - 프론트/백/공통 자산 경계가 문서로 정리된다.
  - 기존 Flask 코드와 새 FastAPI 코드의 공존 기간 전략이 포함된다.
  - Sprint 1에서 FastAPI와 Next.js 병렬 트랙 진행 방식이 명시된다.
- **Validation**:
  - 구조 다이어그램 또는 디렉토리 트리 검토

### Task 0.2: 도메인 모델 및 저장 기준 확정
- **Location**: `services/web-editor/backend/app/models`, `docs/plans/`
- **Description**: `User`, `KnowledgeNode`, `DocumentBody`, `ChatSession`, `ChatMessage`, `ContextSession`, `ContextItem`, `GraphEdge` 모델을 정의하고, 어떤 데이터가 CouchDB에 저장되고 어떤 데이터가 Vault에 남는지 결정한다.
- **Dependencies**: Task 0.1
- **Acceptance Criteria**:
  - 문서 본문과 디렉토리 구조의 정본이 Vault임이 명확하다.
  - 메타데이터, 관계, 컨텍스트 상태, 인덱스의 저장 위치가 명확하다.
  - 디렉토리 기반 그래프와 의미 그래프의 결합 방식이 정리된다.
  - **기존 CouchDB 데이터 호환성 전략**이 명확하다: 기존 문서를 새 모델로 읽기 가능한 매핑 규칙을 정의하고, Sprint 1 이후 새 모델로 쓰기 시작 시 데이터 무결성을 유지하는 방법을 문서화한다.
  - **의미 연결 기술 전략이 확정**된다: 임베딩 기반 / 키워드-태그 기반 / LLM 호출 기반 중 MVP 전략을 결정하고, 연결 근거 점수 저장 방식과 재인덱싱 트리거 조건을 정의한다.
- **Validation**:
  - 엔티티-저장소 매핑표 리뷰
  - 기존 데이터 호환 매핑 시뮬레이션
  - 의미 연결 전략 결정 문서 리뷰

### Task 0.3: 디자인 시스템 베이스라인 정의
- **Location**: `services/web-editor/frontend/src/styles`, `services/web-editor/frontend/src/components/shell`
- **Description**: 디자인 스펙의 색상, 타이포, 유리 패널, 레일, 반응형 규칙, 모션, 접근성을 토큰과 공통 레이아웃 규칙으로 변환한다.
- **Dependencies**: 없음
- **Acceptance Criteria**:
  - **컬러/타입/간격/반응형 토큰** 확정: `#131313` 배경, `#D2BBFF` 보라, `#7C3AED` 컨테이너, `#3B82F6` 블루, `#FFB784` 앰버 계열 정의.
  - **표면/질감 토큰** 확정: 유리 패널(`backdrop-blur`), 반투명 다크 서피스, 저투명도 보더, 발광 오라(`box-shadow + glow`) CSS 변수 정의.
  - **타이포그래피 토큰** 확정: `Lexend`(헤드라인) + `Inter`(본문/메타데이터) 폰트 스택, 크기 스케일, 자간 규칙.
  - **모션 토큰** 확정: 기본 전환 `300ms–500ms`, 이징 `cubic-bezier(0.4, 0, 0.2, 1)`, hover/선택/드래그 패턴별 규칙 CSS 변수로 정의.
  - **접근성 기준** 확정: 본문 대비 최소 `4.5:1`, 상태 표현에 색 외 아이콘/배지/라벨 병용 원칙, 터치 타겟 최소 크기 44px 토큰화.
  - 데스크톱과 모바일 셸 규칙이 공통 컴포넌트 기준으로 정리된다.
- **Validation**:
  - 셸 와이어프레임 또는 스토리북 수준 화면 점검
  - 토큰 파일(`tokens.css`) 리뷰

### Task 0.4: API 계약 및 상태 흐름 초안 작성
- **Location**: `services/web-editor/backend/app/api`, `services/web-editor/frontend/src/lib/api`
- **Description**: 인증, 라이브러리, 그래프, 문서, 채팅, 캡처, 컨텍스트, 검색 관련 API 계약과 실시간 통신 방식을 먼저 고정한다.
- **Dependencies**: Task 0.2
- **Acceptance Criteria**:
  - OpenAPI 수준 엔드포인트 목록이 나온다.
  - 프론트 상태 흐름과 백엔드 응답 형식이 맞춰진다.
  - **공통 에러 응답 포맷** 확정: `{ success, data, error, meta }` 에너벨로프 구조 정의.
  - **실시간 통신 전략** 확정: 채팅 스트리밍을 위한 **SSE(Server-Sent Events)** 방식 채택 또는 WebSocket 사용 여부를 결정하고, 스트리밍 응답 포맷을 정의한다.
  - **환경별 설정 전략** 확정: 개발(`dev`) / 스테이징(`staging`) / 프로덕션(`prod`) 환경 분리를 위한 `.env.*` 파일 구조와 설정 로더 패턴 정의.
  - 검색 API 엔드포인트 목록 포함 (노드 전문 검색, 그래프 필터 검색).
- **Validation**:
  - 엔드포인트별 request/response 샘플 리뷰
  - SSE/WebSocket 방식 결정 문서 리뷰

### Task 0.5: Vault 파일 감시 메커니즘 설계
- **Location**: `services/web-editor/backend/app/services/vault_watcher.py`, `docs/plans/`
- **Description**: Vault(파일 시스템)에서 Markdown 파일이 생성/수정/삭제될 때 CouchDB 인덱스(노드 메타데이터, 그래프 엣지)를 자동으로 갱신하는 메커니즘을 설계한다.
- **Dependencies**: Task 0.2
- **Acceptance Criteria**:
  - 파일 감시 방식 확정: `watchdog` 라이브러리 기반 이벤트 루프 또는 폴링 방식 중 선택.
  - 감시 대상 이벤트: 파일 생성, 수정, 이름 변경, 삭제.
  - 이벤트 발생 시 CouchDB에 반영되는 항목: 노드 메타데이터, 파일 링크 기반 그래프 엣지, 디렉토리 계층 구조.
  - 시작 시 전체 Vault 초기 인덱싱과 이후 증분 감시로 분리된다.
  - 감시 서비스가 FastAPI 앱 생명주기(startup/shutdown)에 통합된다.
- **Validation**:
  - 파일 변경 → CouchDB 반영 수동 테스트

---

## Sprint 1: 공통 셸과 인증 기반 구축

**Goal**: 사용자가 로그인 후 공통 셸 안에서 Chat, Library, Graph, Editor로 이동할 수 있는 기본 뼈대를 만든다.

**Demo/Validation**:
- 로그인 가능
- 좌측 레일, 상단 바, 우측 컨텍스트 레일, 모바일 하단 내비게이션이 동작
- 목업 데이터로 주요 화면 라우팅 가능

> **병렬 트랙 안내**: Task 1.1(FastAPI 부트스트랩)과 Task 1.2(Next.js 전환)는 서로 의존하지 않으므로 병렬로 진행한다. Task 1.3(인증)은 Task 1.1 완료 후, Task 1.4(공통 셸)는 Task 1.2 완료 후 시작한다.

### Task 1.1: FastAPI 서비스 부트스트랩
- **Location**: `services/web-editor/backend/app/main.py`, `services/web-editor/backend/app/api`
- **Description**: FastAPI 앱 초기화, 헬스체크, 설정 로더, 공통 예외 응답, CORS, 인증 미들웨어를 구성한다. Task 0.5에서 설계한 Vault 감시 서비스를 앱 생명주기에 통합한다.
- **Dependencies**: Sprint 0 완료
- **Acceptance Criteria**:
  - `/health`, `/auth/*`, `/api/*` 기본 구조가 동작한다.
  - Task 0.4에서 확정한 환경별 설정 전략(`.env.dev`, `.env.prod`)이 적용된다.
  - Task 0.4에서 확정한 공통 에러 응답 포맷(`{ success, data, error, meta }`)이 전역 예외 핸들러에 적용된다.
  - Vault 감시 서비스가 앱 startup 시 초기화되고 shutdown 시 정상 종료된다.
- **Validation**:
  - 기본 API 호출 테스트
  - 환경별 설정 로딩 확인

### Task 1.2: Next.js 앱 전환
- **Location**: `services/web-editor/frontend`
- **Description**: 기존 Vite 앱을 Next.js 기반으로 전환하고 앱 셸, 라우팅, 서버/클라이언트 경계를 재구성한다. 기존 React 컴포넌트의 마이그레이션 가능 항목을 식별하고 재사용한다.
- **Dependencies**: Task 0.3
- **Acceptance Criteria**:
  - `/chat`, `/library`, `/graph`, `/editor/[nodeId]` 라우트가 열린다.
  - 공통 셸이 모든 모드에서 유지된다.
  - SSR/CSR 경계가 명확히 정의된다(클라이언트 전용 컴포넌트는 `"use client"` 명시).
  - Task 0.3에서 확정한 디자인 토큰(`tokens.css`)이 글로벌 스타일로 적용된다.
  - 환경별 설정(`.env.local`, `.env.production`)이 Next.js 방식으로 분리된다.
- **Validation**:
  - `build` 및 기본 페이지 렌더링 확인
  - 디자인 토큰 적용 시각 점검

### Task 1.3: id/pw 인증과 세션 처리 구현
- **Location**: `services/web-editor/backend/app/api/auth.py`, `services/web-editor/backend/app/services/auth_service.py`, `services/web-editor/frontend/src/features/auth`
- **Description**: 기획서 기준의 id/pw 로그인, 세션 쿠키 또는 토큰 전략, 사용자별 데이터 접근 경계를 구현한다.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - 로그인/로그아웃/세션 복구가 가능하다.
  - 기존 Basic Auth는 내부 호환 또는 마이그레이션 전용으로 격리된다.
- **Validation**:
  - 인증 API 테스트
  - 인증된 사용자만 주요 API 접근 가능 확인

### Task 1.4: 공통 셸 컴포넌트 구현
- **Location**: `services/web-editor/frontend/src/components/shell`
- **Description**: 좌측 레일, 상단 유틸리티 바, 우측 `Active Context` 레일, 모바일 하단 탭 구조를 구현한다. Task 0.3에서 확정한 디자인 토큰(컬러, 표면/질감, 모션)을 적용한다.
- **Dependencies**: Task 1.2, Task 0.3
- **Acceptance Criteria**:
  - 디자인 스펙의 3축 구조(좌측 레일/중앙 워크스페이스/우측 Context 레일)가 모든 화면에 유지된다.
  - 태블릿/모바일에서 레일 접기 또는 오버레이 전환이 동작한다.
  - 좌측 레일 항목: Chat, Graph, Library, Learn, Sync/Settings, `New Thought` CTA.
  - 활성 화면 강조: 보라 계열 배경 + 좌측 강조선.
  - 모바일 하단 내비게이션: Chat / Context / Graph 3항 구조, 활성 탭 글로우 캡슐 표시.
  - 모션 토큰(`transition-duration`, `transition-timing-function`)이 모든 전환 애니메이션에 사용된다.
  - 접근성: 모든 인터랙티브 요소에 `aria-label` 또는 `aria-current` 적용.
- **Validation**:
  - 반응형 화면 점검 (데스크톱/태블릿/모바일)
  - 접근성 점검

---

## Sprint 2: Knowledge Base와 Context Manager MVP

**Goal**: 저장된 지식을 목록과 컨텍스트 중심으로 탐색하고 통제할 수 있게 만든다.

**Demo/Validation**:
- 라이브러리 카드 목록 조회 가능
- 컨텍스트 추가/제거/잠금 가능
- 노드 전문 검색 가능
- 모바일에서도 `Chat / Context / Graph` 전환 구조 유지

### Task 2.1: 노드/디렉토리 조회 API 구현
- **Location**: `services/web-editor/backend/app/api/nodes.py`, `services/web-editor/backend/app/repositories`
- **Description**: Vault 디렉토리 구조, 노드 타입, 메타데이터, 날짜, 요약을 포함한 Library 조회 API를 만든다.
- **Dependencies**: Sprint 1 완료
- **Acceptance Criteria**:
  - 필터, 검색, 정렬이 가능한 목록 API가 제공된다.
  - `Directory`, `Document`, `Agent Chat`, `PDF`, `Code` 등 타입 구분 필드가 포함된다.
  - 공통 에러 응답 포맷(`{ success, data, error, meta }`)을 준수한다.
- **Validation**:
  - 목록/검색 API 테스트

### Task 2.2: Context Session API 구현
- **Location**: `services/web-editor/backend/app/api/context.py`, `services/web-editor/backend/app/services/context_service.py`
- **Description**: 현재 대화 세션에 주입된 노드 목록, 포함/제외/잠금 상태, 일괄 주입을 처리하는 API를 구현한다.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - 컨텍스트 상태 조회/추가/삭제/정렬 API가 제공된다.
  - 세션 단위 상태가 유지된다.
- **Validation**:
  - 컨텍스트 CRUD 테스트

### Task 2.3: Library View UI 구현
- **Location**: `services/web-editor/frontend/src/features/library`
- **Description**: 카드형 콘텐츠 그리드, 검색, 필터, 뷰 전환, Export 액션 영역을 구현한다.
- **Dependencies**: Task 2.1, Task 1.4
- **Acceptance Criteria**:
  - Knowledge Base 입구 역할을 하는 정돈된 목록 화면이 제공된다.
  - 노드 클릭 시 상세/에디터/그래프 흐름으로 이동할 수 있다.
  - 문서 카드: 제목, 날짜, 요약, 태그, 타입 아이콘 표시.
- **Validation**:
  - 목록 렌더링 및 필터 동작 확인

### Task 2.4: Context Manager UI 구현
- **Location**: `services/web-editor/frontend/src/features/context`
- **Description**: 우측 고정 레일과 모바일 별도 화면에서 현재 주입 컨텍스트를 제어하는 UI를 구현한다.
- **Dependencies**: Task 2.2, Task 1.4
- **Acceptance Criteria**:
  - 각 컨텍스트 아이템: 아이콘, 제목, 타입, 메타데이터, 활성 토글 표시.
  - `Context Ready`, `Switch to Chat`, `Switch to Graph` 세션 전환 액션 포함.
  - 하단에 `Neural Load`, `Merge`, `Inject` 같은 일괄 주입 액션 배치.
  - 단순 체크리스트가 아니라 AI 세션 작동 조건을 설정하는 제어면처럼 보여야 한다.
- **Validation**:
  - 데스크톱/모바일 컨텍스트 조작 확인

### Task 2.5: 전문 검색 서비스 구현
- **Location**: `services/web-editor/backend/app/services/search_service.py`, `services/web-editor/backend/app/api/search.py`
- **Description**: Vault 노드 제목, 본문 내용, 태그, 메타데이터를 대상으로 한 전문 검색 인덱스를 구현한다. Library View 검색과 Graph 필터 검색 모두 이 서비스를 공유한다.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - CouchDB의 Mango Query 또는 전문 검색 인덱스(`$text` 인덱스)를 활용한다.
  - 검색 결과는 노드 타입, 날짜, 연관도 기준 정렬을 지원한다.
  - `GET /api/search?q=...&type=...&sort=...` 엔드포인트가 제공된다.
  - 검색 결과 응답에 노드 ID, 제목, 타입, 요약 프리뷰, 날짜가 포함된다.
- **Validation**:
  - 검색 API 테스트 (빈 쿼리, 특수문자, 긴 쿼리 포함)

---

## Sprint 3: Agent Chatting과 지식 캡처 흐름 구축

**Goal**: 대화가 생성에서 끝나지 않고 즉시 노드화되는 핵심 가치 제안을 구현한다.

**Demo/Validation**:
- 에이전트와 대화 가능 (SSE 스트리밍)
- 메시지를 노드로 저장 가능
- 저장된 노드가 Library/Context에 바로 반영

### Task 3.1: 채팅 세션 및 메시지 모델 구현
- **Location**: `services/web-editor/backend/app/api/chat.py`, `services/web-editor/backend/app/services/chat_service.py`
- **Description**: 채팅 세션, 메시지, 사용 모델, 참조 컨텍스트, 응답 출처 메타데이터를 저장하는 계층을 구현한다.
- **Dependencies**: Sprint 2 완료
- **Acceptance Criteria**:
  - 세션 생성, 메시지 조회, 메시지 저장이 가능하다.
  - 응답이 어떤 컨텍스트를 기준으로 생성되었는지 추적 필드(`context_ids`, `context_snapshot`)가 포함된다.
  - **메시지 블록 타입 필드** 포함: 각 메시지는 `block_type` 필드를 가지며 `user_message`, `agent_response`, `neural_insight`, `agent_action`, `saved_as_node` 값을 지원한다.
  - Task 0.4에서 확정한 SSE/WebSocket 방식으로 스트리밍 응답을 전송하는 엔드포인트(`POST /api/chat/{session_id}/stream`)가 구현된다.
- **Validation**:
  - 채팅 API 테스트
  - SSE 스트리밍 응답 수신 테스트

### Task 3.2: LLM Provider 추상화
- **Location**: `services/web-editor/backend/app/services/llm`
- **Description**: `Claude Code 우선`, `Codex`, `Gemini`를 수용할 수 있는 모델 선택 계층을 만든다. MVP는 1개 우선 공급자부터 연결한다.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - 모델 선택 UI와 백엔드 공급자 인터페이스가 분리된다.
  - 프롬프트 입력, 컨텍스트 주입, 응답 구조화 규칙이 정의된다.
  - 스트리밍 응답을 SSE 형식으로 변환하는 어댑터 계층이 포함된다.
- **Validation**:
  - 공급자 어댑터 단위 테스트

### Task 3.3: 메시지 캡처 및 노드화 API 구현
- **Location**: `services/web-editor/backend/app/api/capture.py`, `services/web-editor/backend/app/services/capture_service.py`
- **Description**: 채팅 메시지 또는 에이전트 응답 일부를 선택해 Vault 기반 문서형 노드 또는 개념 노드로 저장하는 기능을 구현한다.
- **Dependencies**: Task 3.1, Task 2.1
- **Acceptance Criteria**:
  - 저장 시 디렉토리/주제 연결이 가능하다.
  - 저장 후 Knowledge Base와 Context Manager에 즉시 반영된다.
  - 저장 완료 후 `block_type: saved_as_node` 블록이 채팅 스레드에 삽입된다.
- **Validation**:
  - 캡처 API와 저장 후 조회 테스트

### Task 3.4: Agent Chatting Workspace UI 구현
- **Location**: `services/web-editor/frontend/src/features/chat`
- **Description**: 중앙 대화 스레드, 옴니바 입력창, 구조화된 응답 블록, 모델 전환 표시를 구현한다.
- **Dependencies**: Task 3.1, Task 3.3, Task 1.4
- **Acceptance Criteria**:
  - `Neural Insight`, `Agent Action`, `Saved as Knowledge Node` 블록이 메시지 내 패널형 카드로 렌더링된다.
  - 메시지 선택 후 저장 액션이 가능하다.
  - **옴니바 입력창** 구현: 텍스트 입력 외 파일 첨부 아이콘, 전송 버튼을 포함한다. 입력창 배경은 글로우/내부 패딩 중심으로 질감을 형성한다.
  - SSE 스트리밍 응답을 실시간으로 렌더링한다 (타이핑 인디케이터 표시).
  - 상단에 현재 사용 중인 모델명과 컨텍스트 연결 상태가 표시된다.
  - 사용자 메시지와 에이전트 메시지는 말풍선이 아닌 패널형 카드로 표현된다.
- **Validation**:
  - 채팅-캡처-라이브러리 반영 E2E 확인
  - SSE 스트리밍 UX 점검

---

## Sprint 4: Graph View와 문서 편집기 통합

**Goal**: 그래프 탐색, 문서 편집, 컨텍스트 주입이 하나의 흐름으로 연결되게 만든다.

**Demo/Validation**:
- 그래프에서 노드 탐색 가능
- 다중 선택 후 컨텍스트 주입 가능
- 문서 편집 후 그래프/라이브러리/컨텍스트에 반영

### Task 4.1: 그래프 인덱싱 및 조회 API 구현
- **Location**: `services/web-editor/backend/app/api/graph.py`, `services/web-editor/backend/app/services/graph_service.py`
- **Description**: 기존 `services/web-editor/app.py`의 Markdown 링크 파싱 규칙을 참고해 디렉토리 구조와 문서 링크를 그래프 데이터로 노출하고, 별도 의미 연결 인덱스를 함께 합성한다.
- **Dependencies**: Sprint 3 완료
- **Acceptance Criteria**:
  - 노드, 엣지, inbound/outbound, orphan 통계가 제공된다.
  - 디렉토리 기반 구조 연결, 문서 링크 연결, 의미 연결이 함께 표현된다.
  - 구조적 엣지(`edge_type: structural`)와 의미 엣지(`edge_type: semantic`)가 응답에서 구분 가능하다.
  - Vault 감시 서비스(Task 0.5)가 파일 변경을 감지하면 그래프 인덱스가 자동으로 갱신된다.
- **Validation**:
  - 그래프 API 테스트

### Task 4.2: 의미 연결 생성 파이프라인 구현
- **Location**: `services/web-editor/backend/app/services/graph_service.py`, `services/web-editor/backend/app/services/indexing`
- **Description**: Sprint 0 Task 0.2에서 확정한 의미 연결 기술 전략을 기반으로 의미 연결 후보를 생성하고 갱신하는 인덱싱 파이프라인을 구현한다.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - Sprint 0에서 결정한 기술 전략(임베딩/키워드-태그/LLM 중 선택)이 구현된다.
  - 연결의 근거 점수(`confidence_score`)와 근거 유형(`reason_type`)을 저장한다.
  - 임계값 이하 연결(`confidence_score < 0.5`)은 기본적으로 그래프에 노출하지 않는다.
  - 재인덱싱 트리거: 신규 노드 저장, 노드 수정, 수동 재인덱싱 요청.
- **Validation**:
  - 샘플 데이터 기준 의미 연결 생성 테스트

### Task 4.3: Knowledge Graph View UI 구현
- **Location**: `services/web-editor/frontend/src/features/graph`
- **Description**: 포커스 노드 중심 탐색, 노드 프리뷰, 다중 선택, 컨텍스트 주입 UI를 구현한다. 디자인 스펙의 노드 형태 규칙과 발광 비주얼을 적용한다.
- **Dependencies**: Task 4.1, Task 4.2, Task 2.4
- **Acceptance Criteria**:
  - 활성 노드 강조(발광 오라, 배경 농도 상승), 연결 노드 프리뷰, 하단 툴바가 동작한다.
  - 구조적 연결과 의미 연결을 시각적으로 구분한다 (선 스타일 또는 색상 차이).
  - **노드 형태 규칙 적용**: 내용 없는 개념 노드는 원형, 내용 있는 노드는 둥근 모서리 사각형으로 렌더링.
  - **노드 확장/축소 상태 지원**: 축소 상태(제목 + 타입), 확장 상태(제목 + 타입 + 짧은 미리보기).
  - **다중 선택 인터랙션**: 단일 클릭(선택/포커스), 다중 선택(Shift+클릭 또는 드래그 박스), 일괄 컨텍스트 추가/제외.
  - **모바일 인터랙션 분리**: 데스크톱은 드래그 앤 드롭 주입, 모바일은 탭 선택 후 "컨텍스트에 추가" 액션 버튼 방식 사용.
  - 배경: 다크 보이드(`#131313`) 위 점형 그리드.
  - 연결선: 비활성 시 낮은 불투명도, 활성 시 발광 강조.
- **Validation**:
  - 그래프 탐색 및 컨텍스트 주입 시나리오 점검
  - 데스크톱/모바일 인터랙션 분리 점검

### Task 4.4: 문서형 노드 편집기 구현
- **Location**: `services/web-editor/frontend/src/features/editor`, `services/web-editor/backend/app/api/documents.py`
- **Description**: 마크다운 편집/렌더링, 메타데이터 편집, 저장, 연결 컨텍스트 확인을 제공하는 상세 편집 화면을 구현한다.
- **Dependencies**: Task 2.1, Task 4.1
- **Acceptance Criteria**:
  - 읽기와 쓰기 전환이 자연스럽다.
  - 코드블록, 체크박스, 인용문, 링크 등 기본 문법이 지원된다.
  - 편집 결과가 그래프와 라이브러리에 반영된다.
  - 좌측: 컬렉션/문서 탐색 내비게이션, 중앙: 넓은 편집 캔버스, 우측: Active Context 레일.
  - AI 보조 툴바: 문서 하단 또는 선택 영역 인접 위치에 노출.
- **Validation**:
  - 문서 생성/수정/조회 테스트

### Task 4.5: 모바일 전환 및 화면 연결 마감
- **Location**: `services/web-editor/frontend/src/components/shell`, `services/web-editor/frontend/src/features/*`
- **Description**: 모바일에서 `Chat / Context / Graph` 흐름이 유지되도록 탭/스와이프/오버레이 규칙을 마감한다.
- **Dependencies**: Task 4.3, Task 4.4
- **Acceptance Criteria**:
  - 정보 단절 없이 컨텍스트가 공유된다.
  - 입력창과 하단 내비게이션 충돌이 없다.
  - 좌우 스와이프: 왼쪽(`Chat + Context`), 오른쪽(`Context + Knowledge Base`).
  - Context Manager가 두 화면 공통으로 세션 상태를 유지한다.
- **Validation**:
  - 모바일 브레이크포인트 수동 QA

---

## Sprint 5: 안정화, 운영, 배포 전환

**Goal**: MVP를 운영 가능한 상태로 묶고 기존 배포 구조를 새 아키텍처에 맞춘다.

**Demo/Validation**:
- 핵심 사용자 시나리오 E2E 통과
- 컨테이너 빌드/기동 가능
- 배포 후 로컬 점검 가능

### Task 5.1: 테스트 체계 구축
- **Location**: `services/web-editor/backend/tests`, `services/web-editor/frontend`
- **Description**: API 테스트, 컴포넌트 테스트, 핵심 E2E 시나리오를 정리한다.
- **Dependencies**: Sprint 4 완료
- **Acceptance Criteria**:
  - 로그인, 채팅(스트리밍 포함), 캡처, 컨텍스트, 그래프, 편집, 검색 핵심 경로가 자동 검증된다.
- **Validation**:
  - CI 또는 로컬 테스트 실행

### Task 5.2: 배포 스크립트 및 Compose 갱신
- **Location**: `services/web-editor/deploy.sh`, `docker-compose.yml`, `services/web-editor/version.txt`
- **Description**: 기존 `obsidian-web` 기준 배포 스크립트를 프론트/백 분리 구조에 맞게 수정한다.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - 배포 전 커밋/푸시 기준과 이미지 빌드 대상이 새 구조와 일치한다.
  - 서비스 재시작 범위가 명확하다.
- **Validation**:
  - 배포 리허설

### Task 5.3: 마이그레이션 및 롤백 시나리오 정리
- **Location**: `docs/plans/`, `ops/runtime`
- **Description**: 기존 Flask/Vite 서비스에서 새 서비스로 전환하는 순서와 실패 시 되돌리는 절차를 문서화한다. Task 0.2에서 확정한 CouchDB 호환성 전략을 기반으로 실제 데이터 마이그레이션 절차를 포함한다.
- **Dependencies**: Task 5.2
- **Acceptance Criteria**:
  - 데이터 손실 없이 전환 가능한 절차가 문서화된다.
  - CouchDB 기존 문서를 새 도메인 모델로 읽기 호환하는 변환 스크립트 또는 매핑 규칙이 포함된다.
  - 장애 시 이전 이미지/서비스로 복귀 경로가 있다.
- **Validation**:
  - 체크리스트 기반 리허설

---

## Post-MVP Expansion Backlog

### Phase A: RAG 고도화
- `Qdrant` 도입
- `LlamaIndex` 파이프라인 구성
- 노드 단위 임베딩, 검색, 재랭킹

### Phase B: Learning Studio
- `Socratic Mode`
- `Review Mode`
- `Knowledge Gaps` 패널
- 복습 스케줄링

### Phase C: 외부 지식 연결
- PDF, Web Article, Git Issue, Code 저장소 전용 ingestion
- 외부 챗봇 대화 저장
- MCP / Skills 연결

---

## Testing Strategy

- 백엔드
  - 인증/권한 테스트
  - 노드/컨텍스트/채팅/그래프/문서/검색 API 테스트
  - 저장소 계층과 서비스 계층 분리 테스트
  - SSE 스트리밍 엔드포인트 테스트
- 프론트엔드
  - 공통 셸 렌더링 테스트
  - 반응형 브레이크포인트 점검
  - 핵심 플로우 컴포넌트 테스트
  - 모션/트랜지션 토큰 적용 확인
- E2E
  - 로그인 → 채팅(스트리밍) → 메시지 저장 → 라이브러리 반영
  - 라이브러리 → 그래프 → 컨텍스트 주입 → 채팅 응답
  - 그래프 → 문서 편집 → 그래프/라이브러리 재반영
  - Vault 파일 변경 → CouchDB 인덱스 갱신 → 그래프 반영

---

## Potential Risks & Gotchas

- **저장소 기준 충돌**: Vault와 CouchDB 중 어느 쪽이 정본인지 애매하면 동기화 충돌이 반복된다.
  - 대응: Vault를 문서 정본으로 고정하고 CouchDB는 projection/상태 저장소로 제한한다.

- **그래프 성능 저하**: 대규모 노드에서 전량 렌더링하면 UX가 무너진다.
  - 대응: 포커스 기반 탐색, 점진 로딩, 렌더 상한 도입.

- **의미 연결 품질 저하**: MVP에서 의미 연결을 넣되 품질이 낮으면 오히려 그래프 신뢰도를 떨어뜨린다.
  - 대응: 생성 근거와 점수를 함께 저장하고, 임계값 이하 연결은 노출하지 않는다.

- **인증 경계 불명확**: 현재 Basic Auth 흐름을 그대로 끌고 가면 사용자 단위 권한 분리가 약하다.
  - 대응: 단일 사용자 기준 세션 인증으로 단순화하되, 향후 다중 사용자 확장을 막지 않는 구조로 둔다.

- **UI 복잡도 과다**: Chat, Context, Graph, Editor를 동시에 담으면 정보 밀도가 쉽게 과해진다.
  - 대응: 공통 셸 유지, 모드별 정보 우선순위 명확화.

- **외부 AI 연동 과욕**: 초기부터 다중 공급자 완성형을 노리면 MVP 일정이 밀린다.
  - 대응: 공급자 인터페이스만 먼저 만들고 실제 연결은 1개부터 시작.

- **Sprint 1 병목**: FastAPI 부트스트랩 + Next.js 전환 + 인증 + 공통 셸을 한 스프린트에 담으면 하나의 지연이 전체를 막는다.
  - 대응: Task 1.1(FastAPI)과 Task 1.2(Next.js)를 병렬 트랙으로 진행하고, 각 트랙 완료 후 의존 태스크를 바로 시작한다.

- **기존 CouchDB 데이터 호환성**: 새 도메인 모델로 전환 시 기존 문서 읽기가 깨질 수 있다.
  - 대응: Sprint 0 Task 0.2에서 호환 매핑 전략 확정, Sprint 1부터 읽기 호환 모드로 운영, Sprint 5.3에서 마이그레이션 마감.

- **Vault 감시 서비스 신뢰성**: 파일 시스템 이벤트 누락 또는 지연이 그래프 인덱스 불일치를 유발한다.
  - 대응: 이벤트 기반 감시 + 주기적 전체 재인덱싱을 병행한다. 불일치 감지 시 수동 재인덱싱 API(`POST /api/admin/reindex`) 제공.

---

## Confirmed Decisions

- 문서 본문과 디렉토리 구조의 정본은 Vault 파일 시스템으로 고정한다.
- 제품은 현재 단일 사용자 제품 기준으로 설계한다.
- 그래프는 MVP 단계부터 구조적 연결과 의미 연결을 모두 포함한다.
- Sprint 1의 FastAPI 부트스트랩과 Next.js 전환은 병렬 트랙으로 진행한다.
- 실시간 채팅 스트리밍은 SSE(Server-Sent Events) 방식을 기본으로 하되, Task 0.4에서 최종 확정한다.
- 의미 연결 기술 전략(임베딩/키워드/LLM)은 Sprint 0 Task 0.2에서 확정한다.
- CouchDB 기존 데이터는 읽기 호환 모드로 유지하고, 신규 도메인 모델 기준으로 점진 마이그레이션한다.
- 노드 형태: 내용 없는 개념 노드는 원형, 내용 있는 노드는 둥근 모서리 사각형.
- 접근성: 본문 대비 최소 4.5:1, 터치 타겟 최소 44px.

---

## Rollback Plan

- 기존 `services/web-editor/app.py` 기반 이미지와 Compose 설정을 유지한 채 새 서비스는 병행 배치한다.
- 새 프론트/백 전환 초기에는 라우팅만 바꾸고 데이터 마이그레이션은 읽기 호환 모드로 시작한다.
- 핵심 시나리오 실패 시 기존 `obsidian-web` 이미지와 배포 스크립트로 즉시 되돌린다.

---

## Recommended Execution Order

1. Sprint 0에서 저장 기준, 서비스 경계, 의미 연결 전략, 실시간 통신 방식, CouchDB 호환성 전략을 확정한다.
2. Sprint 1로 인증과 공통 셸을 먼저 완성한다 (FastAPI/Next.js 병렬 진행).
3. Sprint 2에서 Knowledge Base와 Context Manager, 검색 서비스를 안정화한다.
4. Sprint 3에서 채팅과 캡처를 붙여 핵심 가치 제안을 만든다.
5. Sprint 4에서 그래프와 에디터를 연결해 제품 완성도를 올린다.
6. Sprint 5에서 테스트, 배포, 롤백 체계를 마감한다.
