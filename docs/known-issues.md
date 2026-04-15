# SynapseNote Known Issues

> 2026-03-28 기준 식별된 문제 목록. 수정 완료된 항목은 ~~취소선~~ 처리.

---

## 🔴 치명적 — 사용 불가

### ~~IS-01 · `/learn` 페이지 404~~
- **수정**: `frontend/src/app/learn/page.js` 플레이스홀더 페이지 생성 (2026-03-28)

### ~~IS-02 · `/settings` 페이지 404~~
- **수정**: `frontend/src/app/settings/page.js` 플레이스홀더 페이지 생성 (2026-03-28)

---

## 🟠 높음 — 기능 broken

### IS-03 · Integration 카드 전부 가짜 데이터
- **증상**: Library 페이지에 ChatGPT/Claude/Notion/Gemini가 "connected" 상태로 표시되지만 실제 연동 없음
- **원인**: `INTEGRATIONS` 배열이 하드코딩된 정적 데이터
- **위치**: `frontend/src/components/library/LibraryWorkspace.jsx:11~44`

### IS-04 · Bulk Action / Export Data 버튼 미구현
- **증상**: Library 헤더의 두 버튼이 클릭해도 아무 동작 없음
- **원인**: `onClick` 핸들러 없음
- **위치**: `frontend/src/components/library/LibraryWorkspace.jsx:221~233`

### IS-05 · Review Selection 버튼 미구현
- **증상**: Context 패널의 "Review Selection" 버튼 동작 없음
- **원인**: `onClick` 핸들러 없음
- **위치**: `frontend/src/components/library/LibraryWorkspace.jsx:197~201`

### IS-06 · 에디터 Rename / Delete 기능 미구현
- **증상**: 에디터 툴바에 버튼은 있으나 동작 안 함
- **원인**: 새 API(`/api/documents`)에 rename/delete 엔드포인트 미구현으로 인해 비활성화 처리
- **위치**: `frontend/src/components/EditorPanel.jsx`, `backend/app/routers/`

### IS-07 · 인증 세션 복원 실패 (`/api/me` 경로 불일치)
- **증상**: 페이지 새로고침 시 로그아웃 됨
- **원인**: 프론트엔드는 `/api/auth/me` 호출, 백엔드 라우터는 `/api/me` 제공 → 경로 불일치
- **위치**: `backend/app/routers/auth_router.py:20`, `frontend/src/contexts/AuthContext.jsx:38`

---

## 🟡 중간 — 디자인·UX 깨짐

### ~~IS-08 · Library 스크롤 시 흰 배경 노출~~
- **수정**: `.shell-workspace`에 `background: var(--bg)` 추가 (2026-03-28)

### IS-09 · Library 로딩 느림
- **증상**: Library 탭 진입 시 로딩이 오래 걸림
- **원인**: 전체 노드(638개+)를 클라이언트로 한꺼번에 로드한 뒤 JS로 필터링. 서버사이드 필터링/페이지네이션 없음
- **위치**: `frontend/src/components/library/LibraryWorkspace.jsx`, `backend/app/routers/node_router.py`

### IS-10 · Library 노드 카드 그리드 반응형 없음
- **증상**: 모바일 또는 좁은 뷰포트에서 3열 카드 레이아웃이 붕괴됨
- **원인**: `.node-grid { grid-template-columns: repeat(3, ...) }`에 미디어쿼리 없음
- **위치**: `frontend/src/styles/library.css` `.node-grid`

### IS-11 · Integration 카드 그리드 반응형 없음
- **증상**: 모바일에서 4열 integration 카드가 붕괴됨
- **원인**: `.integrations-grid { grid-template-columns: repeat(4, ...) }`에 미디어쿼리 없음
- **위치**: `frontend/src/styles/library.css` `.integrations-grid`

### IS-12 · Graph 뷰 모바일에서 UI 겹침
- **증상**: 그래프 캔버스 위에 float하는 사이드 패널(RecentFiles, RightSidebar)이 모바일에서 캔버스와 겹침
- **위치**: `frontend/src/components/FullGraphView.jsx`

### ~~IS-13 · Tailwind 클래스와 디자인 토큰 혼용으로 다크/라이트 배경 혼재~~
- **수정**: 9개 컴포넌트의 Tailwind `bg-white/bg-slate-*`를 CSS 변수로 전면 교체 (2026-03-28)
  · EditorPanel, ExplorerPanel, FullGraphView, GraphPanel, LeftSidebar, NavigationRail, RecentFilesPanel, RightSidebar, SearchPanel

### IS-14 · SearchPanel 미구현 (placeholder)
- **증상**: Graph 뷰 SearchPanel이 "Search functionality is coming soon" 텍스트만 표시
- **위치**: `frontend/src/components/SearchPanel.jsx` 전체

### IS-15 · RightSidebar에서 `confirm()` / `alert()` 사용
- **증상**: 버전 복원 시 브라우저 기본 다이얼로그 팝업. iOS Safari에서 특히 UX 나쁨
- **위치**: `frontend/src/components/RightSidebar.jsx:63,76,85,95`

---

## 🔵 낮음 — 개선 필요

### IS-16 · Library "더 보기" 페이지네이션 방식 비효율
- **증상**: 60개 이후 항목은 숨겨지지만 전체 데이터는 메모리에 상주 → 로딩 느림은 해결 안 됨
- **위치**: `frontend/src/components/library/LibraryWorkspace.jsx`

### IS-17 · AppShell 사이드바 반응형 미흡
- **증상**: 900px 근처 뷰포트에서 사이드바(256px 고정)가 콘텐츠를 덮음
- **위치**: `frontend/src/styles/shell.css`

### IS-18 · 구 파일 잔존 (dead code)
- **증상**: Next.js App Router 이전 후에도 구 CRA 기반 파일들이 남아있음
- **위치**: `frontend/src/App.jsx`, `frontend/src/index.css`, `frontend/src/App.css`

### IS-19 · 기본 자격증명 하드코딩
- **증상**: `.env`에 `SYNAPSENOTE_USER_ID` 미설정 시 `solo/solo`로 누구나 로그인 가능
- **위치**: `backend/app/main.py:34`

### IS-20 · 배포 스크립트 `version.txt`가 git에 의존
- **증상**: git이 없거나 clean한 환경에서 `deploy.sh` 실행 시 오류 가능
- **위치**: `deploy/deploy.sh`

---

## 수정 이력

| 날짜 | 이슈 | 내용 |
|------|------|------|
| 2026-03-28 | — | 초기 이슈 목록 작성 (20개) |
| 2026-03-28 | IS-08 | shell-workspace 배경색 추가 |
| 2026-03-28 | IS-01 | /learn 플레이스홀더 페이지 생성 |
| 2026-03-28 | IS-02 | /settings 플레이스홀더 페이지 생성 |
| 2026-03-28 | IS-13 | 9개 컴포넌트 다크 테마 마이그레이션 |
