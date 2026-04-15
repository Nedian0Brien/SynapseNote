# Sprint 2 로그: Library / Context Manager

**Sprint Goal**
- Vault 기반 노드 조회 API와 세션 기반 Context Manager API를 연결한다.
- `/library` 화면을 디자인 스펙 수준의 카드형 탐색 화면으로 끌어올린다.
- Active Context 레일을 실제 세션 제어면으로 전환한다.

**상태**: `완료`
**진행률**: `100%`
**시작일**: 2026-03-26
**마지막 업데이트**: 2026-03-27

## 완료된 작업

### 1. Vault 노드 서비스 추가
- 파일: [node_service.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/node_service.py)
- 내용:
  - `VAULT_ROOT` 기준 디렉토리와 Markdown 문서를 스캔
  - Directory / Document 노드 메타데이터 생성
  - 제목, 요약, 태그 추출 로직 추가
  - 노드 조회 및 타입/검색어 필터 지원

### 2. Context Session 서비스 추가
- 파일: [context_service.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/context_service.py)
- 파일: [__init__.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/services/__init__.py)
- 내용:
  - 세션 기반 컨텍스트 아이템 목록 조회
  - 노드 추가/중복 방지
  - 노드 제거

### 3. Library / Context API 추가
- 파일: [main.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/main.py)
- 내용:
  - `GET /api/nodes`
  - `GET /api/context`
  - `POST /api/context`
  - `DELETE /api/context/{nodeId}`
  - 세션 인증 이후에만 접근 가능하도록 연결

### 4. Library Workspace 구현
- 파일: [LibraryWorkspace.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/library/LibraryWorkspace.jsx)
- 파일: [page.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/library/page.js)
- 내용:
  - 노드 목록 로드
  - 검색어 및 타입 필터
  - 카드 뷰 기반 Library UI
  - 카드에서 Context 추가
  - 우측 레일에서 Context 제거

### 5. 디자인 적용 고도화
- 파일: [globals.css](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/globals.css)
- 파일: [AppShell.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/shell/AppShell.jsx)
- 내용:
  - Library Hero 블록 추가
  - Integration Status / Context Relay 인사이트 카드 추가
  - Context Ready / Neural Load / Empty State 표현 추가
  - 카드 선택 상태 글로우와 컨텍스트 포함 상태 표현 추가
  - 모바일 축소 시 1열 레이아웃으로 자연스럽게 전환

### 6. 테스트 보강
- 파일: [test_api_app.py](/home/ubuntu/project/SynapseNote/services/web-editor/tests/test_api_app.py)
- 파일: [LibraryWorkspace.test.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/library/LibraryWorkspace.test.jsx)
- 내용:
  - 노드 API 응답 테스트 추가
  - Context 추가/삭제 API 테스트 추가
  - Library UI의 컨텍스트 주입 흐름 테스트 추가

## 검증 기록

- `pytest services/web-editor/tests/test_api_app.py` 통과
- `npm test -- src/components/library/LibraryWorkspace.test.jsx src/components/shell/AppShell.test.jsx src/components/auth/LoginForm.test.jsx` 통과
- `npm run lint` 통과
- `npm run build` 통과

## 마감 정리

1. Library와 Context Manager의 MVP 범위는 완료됐다.
2. 이후 작업은 Sprint 3의 채팅 세션/캡처/노드화 흐름으로 이관됐다.
3. Library는 Sprint 3에서 캡처 후 refresh 연동까지 확장됐다.
