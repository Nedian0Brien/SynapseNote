# SynapseNote 프로젝트 전반 레거시 정리 설계

## 1. 배경

현재 SynapseNote는 `docs/design-system-preview.html`와 `docs/main-ui-preview.html`를 기준으로
전체 UI를 리뉴얼하는 중이지만, 레포 전반에는 이전 세대의 구조와 산출물이 함께 남아 있다.

특히 다음 문제가 동시에 존재한다.

- 실제 런타임 경로와 문서/설정이 서로 다른 세대를 가리킨다.
- 프론트엔드는 리뉴얼된 그래프 워크스페이스 위에 이전 멀티뷰 흔적이 남아 있다.
- 백엔드는 `FastAPI` 기반 구조와 과거 `Flask` 단일 앱 구조가 동시에 존재한다.
- 배포 스크립트와 `docker-compose.yml`, Dockerfile, README 설명이 서로 완전히 일치하지 않는다.
- 설계 문서, 실험용 프리뷰, stitch 산출물, 과거 계획 문서가 현재 기준 문서와 같은 레벨에 섞여 있다.

이 상태에서는 “무엇이 현재 제품인가”, “무엇이 기준 문서인가”, “무엇이 보존용 자산인가”가
불분명해져서 이후 리뉴얼 작업마다 불필요한 탐색 비용과 회귀 위험이 반복된다.

## 2. 목표

이번 정리의 목표는 단순 삭제가 아니라, 프로젝트 전반을 다음 세 층으로 재정렬하는 것이다.

- `active`: 실제 런타임과 현재 개발이 이루어지는 경로
- `reference`: 현재 제품 리뉴얼의 공식 기준으로 유지할 문서
- `archive`: 과거 구현, 실험, 백업, 폐기 예정 문서를 보존할 경로

이 구조를 통해 다음 상태를 만든다.

- 현재 제품 경로가 한눈에 드러난다.
- 리뉴얼 기준 문서가 명시적으로 고정된다.
- 과거 자산은 보존하되 실행 경로와 혼동되지 않는다.
- 남겨둘 기능은 책임 경계가 분명한 구조로 재편된다.
- 배포와 문서가 실제 런타임 구조를 정확히 설명한다.

## 3. 범위

이번 작업은 프로젝트 전반 레거시 정리를 대상으로 하며, 범위는 다음과 같다.

### 포함

- 프론트엔드 구조 정리
- 백엔드 구조 정리
- 루트 문서 및 설계 자산 분류/이관
- 배포 스크립트 및 Docker 관련 정의 정합화
- 죽은 파일, 설정, 의존성, 참조 제거
- 유지 대상 기능의 책임 재배치

### 유지 대상 기능

- 로그인
- 그래프 워크스페이스
- 에디터
- 컨텍스트 패널
- 채팅 패널

### 제외

- archive 자산의 최종 삭제
- 새로운 기능 추가
- 디자인 기준 자체 변경

## 4. 현재 상태 진단

### 4.1 기준 문서

현재 리뉴얼 기준은 다음 두 문서다.

- `docs/design-system-preview.html`
- `docs/main-ui-preview.html`

이 두 문서는 앞으로도 reference 자산으로 유지한다.

반면 다음 문서들은 현재 기준 문서가 아니라 과거 탐색/비교/실험 산출물 성격이 강하며,
현재는 archive 경로로 이관되었다.

- `docs/archive/2026-04-legacy-cleanup/previews/graph-view-preview.html`
- `docs/archive/2026-04-legacy-cleanup/previews/graph-concept-preview.html`
- `docs/archive/2026-04-legacy-cleanup/previews/layout-comparison.html`
- `docs/archive/2026-04-legacy-cleanup/previews/base-hierarchy-concept.html`
- `docs/archive/2026-04-legacy-cleanup/previews/hub-node-styles.html`
- `docs/archive/2026-04-legacy-cleanup/design-stitch/stitch/**`
- `docs/archive/**`
- 과거 스펙/플랜/진행 로그 중 현재 구조를 잘못 설명하는 문서

이들은 archive로 이관하되, 현재 구현에 여전히 필요한 참조가 있는 경우 링크를 갱신한다.

### 4.2 프론트엔드

현재 프론트엔드는 `services/web-editor/frontend` 아래의 `React + Vite` 앱이 실제 엔트리다.
하지만 다음과 같은 레거시 혼재 상태가 있다.

- `next.config.mjs`가 남아 있으나 실제 앱은 Vite로 구동된다.
- `frontend/README.md`가 여전히 Vite 템플릿 기본 문서다.
- `package.json`에는 현재 코드에서 사용하지 않는 패키지 후보가 섞여 있다.
- 리뉴얼 기준이 그래프 워크스페이스인데, 앱 셸에는 이전 단계의 뷰 전환 구조가 남아 있다.
- 스타일 파일은 리뉴얼 토큰 기반으로 상당 부분 정리됐지만, 역할 기준 디렉터리 구조는 아직 약하다.

다만 `GraphView`, `ContextPanel`, `ChatPanel`, `Sidebar`, `Topbar`는 현재 active 축이므로
삭제가 아니라 경계 정리 대상이다. `LoginForm`, `EditorView`도 유지 대상 기능이므로 동일하다.

### 4.3 백엔드

현재 레포에는 두 세대가 공존한다.

- `services/web-editor/backend/app/**`: 현재 `FastAPI` 구조
- `services/web-editor/app.py`, `base_routes.py`: 과거 `Flask` 단일 앱 구조

문제는 배포/문서/테스트 일부가 아직 Flask 세대를 기준으로 남아 있다는 점이다.

- `services/web-editor/Dockerfile`은 `app.py`를 실행한다.
- `services/web-editor/backend/Dockerfile`은 `FastAPI`를 실행한다.
- 루트 배포 스크립트는 `synapsenote-api`를 가정하지만, compose 정의는 그와 어긋난다.
- 과거 플랜/스펙 다수가 Flask 및 Next.js 기준 서술을 포함한다.

따라서 백엔드는 “현행 런타임이 무엇인지”를 먼저 확정하고, 나머지를 archive 또는 제거 후보로
내려야 한다.

### 4.4 배포 및 운영 문서

배포 체계에도 세대 혼재가 있다.

- `deploy/deploy.sh`는 `synapsenote-api` 서비스를 배포 대상으로 포함한다.
- `docker-compose.yml`에는 현재 `synapsenote-api` 서비스 정의가 없다.
- `deploy/README.md`는 프론트를 `Next.js`로 설명한다.
- 루트 `README.md`는 여전히 `Flask`/과거 디렉터리 구조 전제를 섞어 설명한다.
- `services/web-editor/deploy.sh`도 남아 있어 루트 배포 진입점과 중복된다.

즉 배포 경로는 “반드시 이것만 사용한다”는 진입점 하나만 남기고, 나머지는 archive 또는 제거
후보로 정리해야 한다.

## 5. 목표 구조

### 5.1 최상위 구조 원칙

정리 이후 레포는 다음 원칙을 따른다.

- 실제 실행 경로는 루트와 `services/web-editor` 중심으로 최소화한다.
- 현재 기준 문서는 `docs/reference` 성격으로 분명히 남긴다.
- 과거 산출물은 `docs/archive` 또는 별도 archive 폴더로 이관한다.
- 디렉터리 이름만 남기고 참조가 끊긴 “반쯤 죽은 자산”을 방치하지 않는다.

### 5.2 문서 계층

문서 계층은 아래 방향으로 재정리한다.

- 유지:
  - `docs/design-system-preview.html`
  - `docs/main-ui-preview.html`
  - 현재 유효한 운영/배포 문서
- archive 이동:
  - 과거 프리뷰 HTML
  - stitch 산출물
  - 과거 단계 진행 로그 중 현행 구조와 불일치하는 문서
  - 이미 역할이 끝난 계획/백업 문서

archive는 “삭제 전 임시 보관”이 아니라 “현행 경로에서 분리된 보존 공간”으로 취급한다.

### 5.3 프론트엔드 구조

프론트엔드는 기능 중심 구조로 정리한다.

- `app shell`: 인증 이후 제품의 공통 프레임
- `auth`: 로그인 및 인증 상태
- `workspace`: 그래프 워크스페이스와 해당 상호작용
- `editor`: 문서 편집
- `panels`: 컨텍스트/채팅 패널
- `shared`: 공용 훅, 유틸, 스타일 토큰

핵심 원칙은 다음과 같다.

- 리뉴얼 기준 UI는 `main-ui-preview`에 맞춘다.
- 로그인/에디터는 유지하되, 그래프 중심 워크스페이스와 명확히 연결한다.
- 더 이상 사용하지 않는 프레임워크 전환 흔적과 중복 설정은 제거한다.
- 현재 사용하는 의존성만 남긴다.

### 5.4 백엔드 구조

백엔드는 `FastAPI` 기반 경로를 active 기준으로 확정하는 것을 기본 방향으로 한다.

이를 전제로 다음을 수행한다.

- 실제 배포 대상 백엔드 엔트리포인트를 `FastAPI` 기준으로 통일
- `Flask` 앱은 archive 또는 제거 후보로 내림
- 테스트와 문서를 현행 엔트리포인트 기준으로 갱신
- 라우터/서비스/인덱서/DB 경계를 현재 구조에 맞춰 유지

단, 실제 운영이 아직 일부 Flask 경로에 의존한다면, 완전 제거 전에 호환성 검증 단계를 둔다.

### 5.5 배포 구조

배포는 다음 원칙으로 정리한다.

- 공식 배포 진입점은 `bash deploy/deploy.sh` 하나로 통일
- `docker-compose.yml`, Dockerfile, 배포 README가 동일한 서비스 정의를 설명하도록 정합화
- 서비스명, 포트, 환경 변수, 빌드 경로를 한 세대 기준으로 통일
- 보조/과거 배포 스크립트는 archive 또는 제거 후보로 전환

## 6. 분류 규칙

정리 과정에서 모든 자산은 아래 세 분류 중 하나로 들어가야 한다.

### Active

현재 실행되거나, 지금 리뉴얼 작업에서 직접 수정되는 자산

예시:

- `services/web-editor/backend/app/**`
- `services/web-editor/frontend/src/**`
- `deploy/deploy.sh`
- `docker-compose.yml`
- 현행 README/운영 문서

### Reference

현재 제품 구조의 기준으로 계속 참조할 자산

예시:

- `docs/design-system-preview.html`
- `docs/main-ui-preview.html`

### Archive

현재 실행에는 쓰이지 않지만, 추후 삭제 전까지 보존할 자산

예시:

- 과거 프리뷰 문서
- stitch 산출물
- 이전 세대 플랜/실험/백업 문서
- 제거 예정의 Flask/Next.js/Vite 전환 흔적 문서
- 중복 배포 스크립트와 구형 참고 자산

## 7. 실행 단계

### Phase 1. 인벤토리 확정

- active/reference/archive 후보를 전수 분류한다.
- 현재 실행 경로와 참조 경로를 표로 정리한다.
- 삭제 금지 자산과 보존 자산을 먼저 잠근다.

### Phase 2. 문서/자산 이관

- 기준 문서 두 개를 제외한 과거 프리뷰/실험 문서를 archive로 이동한다.
- stitch 산출물과 백업 문서도 archive로 이동한다.
- 이동 후 깨지는 링크를 전부 수정한다.

### Phase 3. 런타임 구조 정합화

- 실제 배포 기준 백엔드 엔트리포인트를 확정한다.
- Dockerfile, compose, deploy 스크립트, README 설명을 통일한다.
- 중복/구형 배포 진입점을 archive 또는 제거 후보로 내린다.

### Phase 4. 프론트엔드 재구성

- 기능 중심 구조로 파일 경계를 재배치한다.
- 죽은 설정 파일과 미사용 의존성을 제거한다.
- 로그인/그래프/에디터/패널을 유지하면서 리뉴얼 기준 UI와 맞지 않는 흔적을 줄인다.

### Phase 5. 백엔드 정리

- FastAPI 기준 active 구조를 확정한다.
- Flask 경로의 실사용 여부를 확인한 뒤 archive 또는 제거 후보로 전환한다.
- 테스트를 현행 구조 기준으로 재정렬한다.

### Phase 6. 최종 검증

- 프론트엔드 빌드/테스트
- 백엔드 테스트
- 배포 스크립트 dry run 수준 점검
- 문서 링크와 경로 검증

## 8. 검증 기준

정리가 완료되었다고 보기 위한 최소 기준은 다음과 같다.

- 현재 제품 실행 경로가 문서와 코드에서 일관되다.
- 리뉴얼 기준 문서가 두 개로 명시적으로 고정된다.
- archive 자산은 실행 경로와 분리되어 더 이상 혼동을 일으키지 않는다.
- 프론트엔드 엔트리, 설정, 의존성이 실제 구조와 일치한다.
- 백엔드 엔트리포인트와 배포 정의가 실제 런타임과 일치한다.
- README와 배포 문서가 현행 구조를 설명한다.

## 9. 리스크와 대응

### 리스크 1. Flask 경로의 숨은 운영 의존성

과거 테스트나 배포가 여전히 `services/web-editor/app.py`를 참조할 수 있다.

대응:

- 제거 전에 참조 검색과 테스트 경로 확인을 먼저 수행한다.
- 완전 제거 전 archive 또는 호환 전환 단계를 둔다.

### 리스크 2. 문서 archive 이동 후 링크 파손

문서를 옮긴 뒤 내부 링크가 깨질 수 있다.

대응:

- 이동 직후 링크와 문서 참조를 일괄 검색해 수정한다.
- 기준 문서에서 archive 문서를 직접 참조하지 않도록 정리한다.

### 리스크 3. 프론트엔드 구조 재배치 중 UI 회귀

GraphView 중심 리뉴얼 상태에서 파일 경계를 잘못 자르면 동작 회귀가 발생할 수 있다.

대응:

- 엔트리포인트와 스타일 import 순서를 보존하면서 단계적으로 이동한다.
- 테스트와 빌드 검증을 각 단계 뒤에 수행한다.

### 리스크 4. 배포 정의와 실제 운영 환경 차이

compose와 운영 컨테이너 구성이 현재 로컬 파일과 다를 수 있다.

대응:

- 배포 스크립트와 compose 정의를 먼저 맞춘 후, 실제 서비스명/포트를 확인한다.
- 배포는 최종 단계에서만 수행한다.

## 10. 결정 사항

- `docs/design-system-preview.html`와 `docs/main-ui-preview.html`를 공식 리뉴얼 기준 문서로 유지한다.
- 프로젝트 전반 레거시 정리를 수행한다.
- 과거 자산은 즉시 삭제하지 않고 archive로 이동한다.
- 로그인과 에디터는 유지 대상이다.
- 정리는 단계적으로 수행한다.
- 배포는 루트 `deploy/deploy.sh`를 공식 진입점으로 통일한다.

## 11. 구현 전 체크포인트

구현에 들어가기 전 다음 질문에 코드 기준으로 답할 수 있어야 한다.

- 현재 active 백엔드 엔트리포인트는 무엇인가
- `docker-compose.yml`이 실제 배포 서비스와 일치하는가
- archive로 이동할 문서/자산 목록이 확정되었는가
- 프론트엔드에서 유지할 기능과 제거할 흔적이 구분되었는가
- 테스트/배포 검증 순서가 정리되었는가

이 체크포인트가 충족되면, 다음 단계는 구현 계획 문서 작성이다.
