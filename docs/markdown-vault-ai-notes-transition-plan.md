# Markdown Vault 기반 AI 노트 앱 전환 계획

**작성일**: 2026-06-22
**전환 방향**: AppFlowy 협업 문서 저장소에서 서버 로컬 Markdown vault 원본 구조로 전환
**예상 복잡도**: High

## 1. 기준 결정

SynapseNote의 문서 원본은 AppFlowy의 Yjs/Collab 문서가 아니라 서버 파일시스템의 Markdown vault로 둔다.

```text
VAULT_ROOT/
  Notes/
    판례 검토.md
    사건 메모.md
  Attachments/
  .synapsenote/
    graph.db
    index.sqlite
    note-id-map.json
```

앱, 그래프, 검색, AI, 백링크, 컨텍스트 매니저는 모두 이 vault에서 파생된 읽기/쓰기 계층이다. 여러 사용자의 실시간 공동 편집은 1차 목표에서 제외한다.

## 2. 확인한 현재 자산

현재 저장소에는 이미 Markdown vault 기반 SynapseNote 구현 자산이 남아 있다.

| 영역 | 현재 위치 | 의미 |
| --- | --- | --- |
| Vault mount | `docker-compose.yml` | `VAULT_ROOT`를 `/vault`로 마운트 |
| 문서 CRUD | `services/web/backend/app/services/document_service.py` | `.md` 파일 read/write/create/delete/move |
| 경로 보호 | `services/web/backend/app/services/vault_paths.py` | vault 밖 경로 접근 방지, `.md` 제한 |
| 그래프 인덱서 | `services/web/backend/app/indexer/vault_indexer.py` | directory edge, wikilink edge, node metadata 생성 |
| 파일 watcher | `services/web/backend/app/indexer/vault_watcher.py` | 파일 변경을 증분 인덱싱으로 연결 |
| 그래프 API | `services/web/backend/app/services/graph_service.py` | SQLite 기반 graph/backlink 조회 |
| Markdown editor | `services/web/frontend/src/features/editor/EditorView.jsx` | Milkdown 기반 Markdown 편집 |
| Wikilink plugin | `services/web/frontend/src/shared/plugins/wikilinkPlugin.js` | `[[link]]` 탐색과 검색 |
| 기존 테스트 | `services/web/backend/tests/*`, `services/web/tests/*` | vault, graph, document, capture 흐름 검증 |

반대로 AppFlowy Web 쪽에는 Yjs, IndexedDB, sync outbox, collab API가 문서 원본으로 들어가 있다. 이 계층은 Markdown vault 전환 후 핵심 원본 계층이 아니므로 제거하거나 격리해야 한다.

## 3. 목표 아키텍처

```text
Browser UI
  - Markdown editor
  - Knowledge graph
  - Context manager
  - AI chat

Synapse API
  - Vault document API
  - Graph/search API
  - AI context API
  - Capture API

Server local vault
  - Markdown files
  - Attachments
  - .synapsenote metadata

Derived indexes
  - SQLite graph index
  - FTS index
  - Vector index
  - AI chunk cache
```

원칙은 단순하다.

1. Markdown 파일이 원본이다.
2. `.synapsenote/` 아래 DB와 캐시는 언제든 재생성 가능해야 한다.
3. UI 전용 상태는 문서 본문을 오염시키지 않는다.
4. AI가 쓰는 context와 embedding은 Markdown 파일과 frontmatter에서 파생한다.
5. AppFlowy collab 저장소는 새 문서 원본으로 사용하지 않는다.

## 4. 필요한 주요 변경

### 4.1 저장소 계층

**해야 할 일**

- `VaultProvider` 계약을 명확히 정의한다.
- 기존 `document_service.py`, `vault_paths.py`를 새 기준 API로 승격한다.
- 파일 쓰기는 atomic write로 바꾼다.
- 동시 편집은 실시간 merge가 아니라 `mtime`/content hash 기반 optimistic concurrency로 처리한다.
- 삭제는 즉시 삭제보다 `.synapsenote/trash/` 또는 파일 휴지통 정책을 둔다.

**검증**

- `.md` 외 파일 쓰기 거부
- vault 밖 path traversal 거부
- 같은 파일을 오래된 hash로 저장하면 conflict 반환
- create/read/write/move/delete 후 실제 파일 상태 확인

### 4.1.1 준실시간 편집 동기화

**해야 할 일**

- 문서 응답에 content hash를 포함한다.
- 저장 요청은 마지막으로 읽은 `baseHash`를 함께 보내고, 서버의 현재 hash와 다르면 `409 document_revision_conflict`를 반환한다.
- 서버는 문서 생성/수정/삭제/이동 이벤트를 SSE로 방송한다.
- watcher가 외부 파일 변경, 예를 들어 Obsidian이나 Git sync로 발생한 변경도 같은 이벤트 스트림으로 방송한다.
- 클라이언트는 현재 열려 있는 문서의 이벤트를 듣고, 편집 중이 아니면 다시 불러오며, 편집 중이면 충돌 상태를 표시한다.

**1차 구현 계약**

```text
GET /api/vault/events
event: vault
data: {
  "type": "document_changed",
  "action": "modified",
  "path": "Notes/example.md",
  "hash": "...",
  "updatedAt": "..."
}
```

**검증**

- 다른 클라이언트나 외부 프로세스가 파일을 바꾸면 열린 문서가 변경을 감지
- 같은 문서를 오래된 `baseHash`로 저장하면 409 충돌
- 삭제/이동 이벤트는 자동 병합하지 않고 사용자에게 상태를 표시
- 이벤트 스트림은 세션 쿠키 인증을 통과한 사용자에게만 열림

### 4.2 Markdown 문서 모델

**해야 할 일**

- 문서 frontmatter 스펙을 정한다.
- Obsidian 호환 문법을 1급으로 처리한다.
- `[[wikilink]]`, `![[embed]]`, `#tag`, Markdown link, attachment link를 파싱한다.
- 앱 내부 ID는 필수 frontmatter로 강제하지 않고, 가능하면 `.synapsenote/note-id-map.json`에 둔다.

**권장 frontmatter**

```yaml
---
title: 사건 메모
created: 2026-06-22T10:00:00+09:00
updated: 2026-06-22T10:20:00+09:00
tags:
  - litigation
---
```

**검증**

- frontmatter 없는 Obsidian 문서도 정상 표시
- 중복 제목 문서가 path 기준으로 구분됨
- wikilink가 같은 폴더 우선, vault 전체 fallback 순서로 해석됨

### 4.3 인덱싱과 그래프

**해야 할 일**

- 기존 `VaultIndexer`를 제품 기준 인덱서로 유지하되, 파서 품질을 올린다.
- directory edge, wikilink edge, markdown link edge, tag edge를 분리한다.
- attachment node를 그래프에 포함할지 정책을 정한다.
- full rebuild와 incremental update를 모두 유지한다.
- `.synapsenote/graph.db`는 파생 산출물로 취급한다.

**검증**

- 파일 추가/수정/이동/삭제 후 그래프가 갱신됨
- 깨진 링크와 미해결 wikilink를 별도 상태로 표시
- 1,000개 문서 규모에서 full rebuild 시간 측정

### 4.4 편집기

**해야 할 일**

- AppFlowy block editor가 아니라 Markdown 원문 기반 편집기로 방향을 고정한다.
- 기존 Milkdown/ProseMirror 편집기를 유지할지, CodeMirror 6 기반으로 바꿀지 결정한다.
- preview, source mode, wikilink autocomplete, attachment embed를 제공한다.
- 저장은 Yjs가 아니라 `document_service.write_document`로 간다.

**검증**

- iOS/모바일에서 입력, 커서, 키보드, 확대 문제가 재발하지 않음
- `[[link]]` 입력 후 후보 검색과 이동이 동작
- 파일 외부 변경 시 editor가 stale 상태를 감지

### 4.5 AI 계층

**해야 할 일**

- Markdown chunker를 만든다.
- frontmatter, heading, list, code block, quote를 고려해 chunk를 나눈다.
- `.synapsenote/index.sqlite` 또는 별도 vector store에 chunk, hash, embedding을 저장한다.
- 파일 변경 watcher가 embedding invalidation을 발생시킨다.
- Context Manager는 파일 path, heading anchor, chunk id를 참조한다.

**검증**

- 문서 수정 시 해당 문서 chunk만 재색인
- 삭제된 문서의 chunk가 검색 결과에서 제거됨
- AI 응답에 실제 참조 문서 path와 heading이 남음

### 4.6 Capture

**해야 할 일**

- AI 대화 내용을 Markdown 파일 또는 기존 문서 섹션으로 저장한다.
- 저장 위치 선택: 새 노트, 현재 노트에 append, 지정 폴더에 capture.
- 저장된 capture는 즉시 watcher/indexer를 통해 그래프와 검색에 반영된다.

**검증**

- 대화 선택 -> Markdown 파일 생성
- 생성된 파일이 graph에 표시
- 같은 제목 capture의 파일명 충돌이 안전하게 처리됨

### 4.7 AppFlowy 제거 또는 격리

**해야 할 일**

- `.worktrees/appflowy-web`에서 가져온 UI 변경과 실제로 필요한 컴포넌트를 분리한다.
- Yjs 문서 저장소, collab sync, workspace collab API 의존을 문서 원본 경로에서 제거한다.
- AppFlowy Cloud 의존 서비스를 배포 필수 구성에서 제외한다.
- 현재 배포된 SynapseNote UI를 Markdown API에 다시 연결한다.

**검증**

- Postgres `af_collab`에 문서를 저장하지 않아도 문서 작성/수정/그래프가 동작
- Docker compose에서 AppFlowy Cloud 계층을 내리고도 핵심 노트 기능이 동작
- 기존 `deploy/deploy.sh`로 web/api 배포 가능

## 5. 단계별 실행 계획

### Sprint 1: 기준 되돌리기와 실행 경로 확보

**목표**: Markdown vault 기반 레거시 SynapseNote API와 UI가 현재 저장소에서 실행되는지 확인한다.

**작업**

1. 현재 배포 기준과 레거시 `services/web` 실행 기준 비교
   - 검증: `docker compose ps`, `/api/health`, `/api/documents` 계열 응답 확인
2. `VAULT_ROOT` 실제 경로와 권한 확인
   - 검증: 컨테이너 내부 `/vault` 읽기/쓰기
3. AppFlowy Web 변경분과 레거시 SynapseNote 기능 경계를 문서화
   - 검증: 제거/유지/재작성 목록 확정

### Sprint 2: Vault API를 제품 기준으로 강화

**목표**: Markdown 파일 CRUD를 안전한 원본 저장소 API로 만든다.

**작업**

1. `VaultProvider` 인터페이스 정의
2. atomic write와 conflict detection 추가
3. attachment read/write API 추가
4. path validation 테스트 확대

**검증**

- backend document tests 통과
- 새 conflict/path traversal 테스트 통과
- 실제 vault에 파일 생성/수정/이동 확인

### Sprint 3: Graph/Search 인덱스 재정비

**목표**: Markdown vault에서 graph, backlinks, search가 안정적으로 파생되게 한다.

**작업**

1. `VaultIndexer` 파서 확장
2. edge type 확장: `directory`, `wikilink`, `markdown_link`, `tag`, `attachment`
3. watcher 이벤트 debounce와 이동 처리 보강
4. graph API 응답 계약 고정

**검증**

- `test_graph_service.py`, `test_backlinks.py` 통과
- 샘플 vault에서 directory/wikilink/tag edge 확인

### Sprint 4: Markdown Editor 연결

**목표**: 문서 화면이 Yjs가 아니라 vault API를 통해 Markdown 파일을 직접 편집한다.

**작업**

1. 현재 AppFlowy editor 화면에서 제거할 의존성 식별
2. Markdown editor route를 vault document API에 연결
3. wikilink autocomplete와 navigation 연결
4. 모바일 입력/저장 회귀 테스트

**검증**

- 새 문서 작성 후 실제 `.md` 파일 생성
- 파일 수정 후 graph/backlink 반영
- 모바일 Safari에서 키보드와 확대 문제 확인

### Sprint 5: AI용 인덱스와 Context Manager

**목표**: AI가 Markdown vault를 직접 읽는 것이 아니라 검증된 index/chunk 계층을 통해 참조하게 한다.

**작업**

1. Markdown chunker 구현
2. chunk hash 기반 재색인
3. 검색/임베딩 저장소 연결
4. Context Manager가 file path와 heading/chunk를 선택하도록 변경

**검증**

- 문서 1개 수정 시 해당 chunk만 재색인
- Context Manager 선택 문서만 AI 요청에 포함
- 응답 출처가 Markdown path 기준으로 표시

### Sprint 6: AppFlowy Cloud 의존 제거와 배포 단순화

**목표**: SynapseNote가 Markdown vault 기반 단일 web/api 서비스로 배포되게 한다.

**작업**

1. compose/deploy에서 불필요한 AppFlowy Cloud 서비스 제거
2. Postgres가 필요한 범위 재검토
3. 백업 정책을 vault + `.synapsenote` 기준으로 재정의
4. 운영 healthcheck 정리

**검증**

- `bash deploy/deploy.sh`
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/`
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/`
- 실제 vault 파일 백업 산출물 확인

## 6. 마이그레이션 전략

현재 AppFlowy/Yjs에 작성된 문서는 Markdown으로 1회 export해야 한다.

1. AppFlowy `Y.Doc`를 읽는다.
2. block tree를 Markdown으로 serialize한다.
3. database/grid/board는 Markdown으로 완전 보존하지 않고 CSV/JSON sidecar로 내보낸다.
4. 첨부파일은 `Attachments/`로 복사하고 Markdown 링크를 생성한다.
5. 원본 `viewId`는 migration log에 보관한다.

마이그레이션 결과물 예시는 다음과 같다.

```text
VAULT_ROOT/
  Migrated from AppFlowy/
    문서 제목.md
    프로젝트 DB.md
    프로젝트 DB.database.json
  .synapsenote/
    migrations/
      appflowy-2026-06-22.json
```

## 7. 버릴 것과 남길 것

### 버릴 것

- 문서 원본으로서의 Yjs/Collab 저장소
- 실시간 공동 편집을 전제로 한 sync outbox
- AppFlowy Cloud collab blob 저장 의존
- Markdown을 단순 import/export 포맷으로 취급하는 구조

### 남길 것

- SynapseNote 디자인 시스템
- Markdown editor 경험
- Knowledge Graph
- Context Manager
- Capture/Recall/Learn 제품 개념
- 서버 배포와 도메인 운영 구조
- vault 기반 백업 구조

## 8. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| AppFlowy Web에 이미 적용한 UI 작업이 손실될 수 있음 | 디자인 토큰과 컴포넌트 변경만 선별 이식 |
| Markdown parser가 Obsidian 문법을 충분히 못 읽음 | wikilink/frontmatter/tag/callout부터 단계적으로 지원 |
| 파일 동시 수정 충돌 | content hash 기반 저장, 충돌 응답, 수동 병합 UI |
| 대용량 vault 인덱싱 지연 | full rebuild와 incremental update 분리, debounce, chunk hash |
| AI가 stale index를 참조 | index status와 last indexed hash를 API에 노출 |
| DB/grid 기능 손실 | 1차는 Markdown/CSV/JSON snapshot으로 제한 |

## 9. 롤백 계획

- AppFlowy worktree와 기존 배포 컨테이너는 전환 완료 전까지 삭제하지 않는다.
- `VAULT_ROOT`는 항상 외부 볼륨으로 유지한다.
- migration은 원본 AppFlowy 데이터를 삭제하지 않고 Markdown export만 생성한다.
- `.synapsenote/` 인덱스는 파생 데이터로만 취급해 언제든 재생성 가능하게 한다.

## 10. 1차 성공 기준

1. `VAULT_ROOT` 아래 `.md` 파일을 생성/수정/삭제하면 앱에 즉시 반영된다.
2. `[[wikilink]]`가 그래프와 백링크에 반영된다.
3. 문서 편집 화면은 Yjs 없이 Markdown API만으로 동작한다.
4. AI Context Manager가 Markdown 문서/heading/chunk를 기준으로 작동한다.
5. 배포에서 AppFlowy Cloud collab 저장소가 필수 의존성이 아니다.
