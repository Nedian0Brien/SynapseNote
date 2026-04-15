# Sprint 1 로그: 기반 구축

**Sprint Goal**
- 로그인 가능한 최소 백엔드와 공통 셸 기반 프론트를 올린다.
- 이후 Sprint 2~4 기능 작업을 얹을 수 있는 테스트/빌드 기반을 만든다.

**상태**: `완료`
**진행률**: `100%`
**시작일**: 2026-03-26
**마지막 업데이트**: 2026-03-26

## 완료된 작업

### 1. FastAPI 부트스트랩
- 파일: [main.py](/home/ubuntu/project/SynapseNote/services/web-editor/backend/app/main.py)
- 내용:
  - FastAPI 앱 생성
  - 세션 미들웨어 연결
  - `/health` 엔드포인트 추가
  - `/auth/login` 엔드포인트 추가
  - `/api/me` 엔드포인트 추가

### 2. Next.js 전환 시작
- 파일: [package.json](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/package.json)
- 파일: [layout.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/layout.js)
- 파일: [page.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/page.js)
- 내용:
  - Vite 스크립트를 Next.js 스크립트로 전환
  - App Router 구조 추가
  - 루트 페이지와 레이아웃 추가

### 3. 공통 셸 초안
- 파일: [AppShell.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/shell/AppShell.jsx)
- 파일: [globals.css](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/globals.css)
- 내용:
  - 좌측 내비게이션
  - 중앙 워크스페이스
  - 우측 Active Context 레일
  - 디자인 스펙 기반 다크 셸 스타일 초안

### 4. 테스트 기반 추가
- 파일: [test_api_app.py](/home/ubuntu/project/SynapseNote/services/web-editor/tests/test_api_app.py)
- 파일: [AppShell.test.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/shell/AppShell.test.jsx)
- 파일: [vitest.config.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/vitest.config.js)
- 내용:
  - 백엔드 헬스체크/로그인 테스트
  - 프론트 셸 렌더링 테스트

### 5. 라우트 및 로그인 연결
- 파일: [page.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/page.js)
- 파일: [page.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/chat/page.js)
- 파일: [page.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/library/page.js)
- 파일: [page.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/graph/page.js)
- 파일: [page.js](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/app/editor/[nodeId]/page.js)
- 파일: [LoginForm.jsx](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/src/components/auth/LoginForm.jsx)
- 내용:
  - `/chat`, `/library`, `/graph`, `/editor/[nodeId]` 라우트 분리
  - 로그인 폼을 `/api/auth/login`에 연결
  - 공통 소개 화면을 `WorkspaceIntro`로 분리

### 6. 배포 구조 전환 초안
- 파일: [Dockerfile](/home/ubuntu/project/SynapseNote/services/web-editor/backend/Dockerfile)
- 파일: [Dockerfile](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/Dockerfile)
- 파일: [docker-compose.yml](/home/ubuntu/project/SynapseNote/docker-compose.yml)
- 파일: [deploy.sh](/home/ubuntu/project/SynapseNote/services/web-editor/deploy.sh)
- 파일: [next.config.mjs](/home/ubuntu/project/SynapseNote/services/web-editor/frontend/next.config.mjs)
- 내용:
  - 백엔드/프론트 Dockerfile 분리
  - Compose에서 `synapsenote-api`와 `obsidian-web` 분리
  - Next rewrite로 백엔드 프록시 연결
  - 배포 스크립트 프론트/백 동시 갱신

### 7. 배포 리허설 완료
- 파일: [deploy.sh](/home/ubuntu/project/SynapseNote/services/web-editor/deploy.sh)
- 내용:
  - `bash services/web-editor/deploy.sh` 실행
  - `synapsenote-api`, `obsidian-web` 컨테이너 재기동 확인
  - `http://127.0.0.1:3002` 응답 확인
  - `http://127.0.0.1:8000/health` 응답 확인
  - 네트워크 중복 연결 오류 문구 제거

## 검증 기록

- `pytest services/web-editor/tests/test_api_app.py` 통과
- `npm test -- src/components/shell/AppShell.test.jsx src/components/auth/LoginForm.test.jsx` 통과
- `npm run build` 통과
- `npm run lint` 통과
- `docker compose config` 통과
- `bash services/web-editor/deploy.sh` 통과
- `curl http://127.0.0.1:3002` 응답 확인
- `curl http://127.0.0.1:8000/health` 응답 확인

## 관련 커밋

- `11b0e72` `feat: FastAPI 백엔드와 Next.js 프론트 기반 추가`
- `1baea79` `feat: 라우팅과 배포 구조를 재구성`
- `ec345c4` `fix: 배포 리허설 오류를 정리`

## Sprint 종료 판단

- Sprint 1 목표였던 `백엔드 기동`, `프론트 셸`, `로그인 연결`, `배포 가능 구조`, `리허설`까지 완료
- 남은 항목은 Sprint 2 이후 품질 고도화 또는 기능 확장 범위로 이관

## 이관된 후속 작업

1. `/api/me` 연동으로 로그인 상태 복원
2. 라우트별 헤더/상태 표시 고도화
3. 환경변수 문서화
4. 모바일 하단 내비게이션 세부 UX 다듬기

## 다음 작업 제안

1. Sprint 2 진입: Library API/UI + Context Manager API/UI
2. 세션 복원(`/api/me`) 연결
