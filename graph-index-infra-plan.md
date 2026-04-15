# Plan: 그래프 인덱스 인프라 (SQLite + watchdog)

**Generated**: 2026-03-28
**Estimated Complexity**: Medium

## Overview

매 API 요청마다 vault 전체를 파일시스템 스캔하던 구조를 버리고,
**SQLite 인덱스 + watchdog 파일 감시** 기반으로 교체한다.

- 앱 시작 시 vault 전체를 한 번 인덱싱 → SQLite에 저장
- watchdog이 파일 변경을 감지 → 해당 노드만 증분 업데이트
- `/api/graph`는 SQLite 쿼리만으로 응답 (디스크 I/O 없음)
- 세만틱 엣지(Jaccard 태그 유사도) 완전 제거

### 변경 범위

```
backend/app/
├── db/                      ← NEW
│   ├── __init__.py
│   ├── connection.py        ← SQLite 연결 (WAL 모드)
│   └── schema.py            ← CREATE TABLE 문
├── indexer/                 ← NEW
│   ├── __init__.py
│   ├── vault_indexer.py     ← 전체 재색인 + 증분 업데이트
│   └── vault_watcher.py     ← watchdog Observer 래퍼
├── services/
│   ├── node_service.py      ← SQLite 조회로 교체
│   └── graph_service.py     ← SQLite 조회 + semantic 제거
└── main.py                  ← 시작 시 indexer/watcher 구동
requirements.txt             ← watchdog 추가
```

### SQLite 파일 위치

`/vault/.synapsenote/graph.db`
- `/vault`는 이미 docker volume 마운트 → 컨테이너 재시작 후에도 유지
- `.synapsenote/` 디렉터리를 IGNORED_DIRS에 추가해 vault 노드로 인식되지 않게 함

---

## Prerequisites

- Python 3.12 (현재 Dockerfile 기반)
- `watchdog` 패키지 (inotify 기반 파일 감시)
- `/vault` 마운트 유지 (docker-compose.yml 변경 불필요)

---

## Sprint 1: SQLite 레이어

**Goal**: 스키마 정의 + 연결 유틸 구현. 서비스 로직 변경 없음.

**Demo/Validation**:
- `python -c "from app.db.connection import get_db; print('ok')"` 성공
- DB 파일이 `/vault/.synapsenote/graph.db`에 생성됨

### Task 1.1: requirements.txt에 watchdog 추가
- **Location**: `services/web-editor/backend/requirements.txt`
- **Description**: `watchdog==6.0.0` 추가
- **Acceptance Criteria**: pip install 성공

### Task 1.2: db/connection.py 작성
- **Location**: `app/db/connection.py`
- **Description**:
  - `get_db()` — WAL 모드 SQLite 연결 반환 (thread_local)
  - DB 경로: `Path(os.environ.get("VAULT_ROOT", "/vault")) / ".synapsenote" / "graph.db"`
  - `.synapsenote/` 디렉터리 자동 생성
  - `row_factory = sqlite3.Row` 설정

### Task 1.3: db/schema.py 작성
- **Location**: `app/db/schema.py`
- **Description**: `init_schema(conn)` 함수
  ```sql
  CREATE TABLE IF NOT EXISTS nodes (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      type        TEXT NOT NULL,   -- 'Document' | 'Directory'
      summary     TEXT DEFAULT '',
      tags        TEXT DEFAULT '[]',  -- JSON
      updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS edges (
      source      TEXT NOT NULL,
      target      TEXT NOT NULL,
      edge_type   TEXT NOT NULL,   -- 'directory' | 'wikilink'
      weight      REAL DEFAULT 1.0,
      PRIMARY KEY (source, target, edge_type)
  );

  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
  ```

---

## Sprint 2: Vault Indexer

**Goal**: vault 전체 스캔 → SQLite 적재 로직 구현.

**Demo/Validation**:
- `VaultIndexer().full_rebuild()` 호출 후 SQLite에 노드/엣지 row 확인
- 600노드/1600엣지 기준 재빌드 시간 측정 (목표: 5초 이내)

### Task 2.1: vault_indexer.py — `_parse_file(path)` 구현
- **Location**: `app/indexer/vault_indexer.py`
- **Description**:
  - 파일 1개 읽어 `(title, summary, tags, wikilinks)` 반환
  - `wikilinks`: `[[target]]` 패턴에서 stem 추출
  - 기존 `node_service._read_markdown_metadata` 로직 흡수 (파일 읽기 1회만)
- **Acceptance Criteria**: 파일 하나에 대한 단위 테스트 통과

### Task 2.2: vault_indexer.py — `full_rebuild()` 구현
- **Location**: `app/indexer/vault_indexer.py`
- **Description**:
  1. vault rglob → 모든 `.md` 파일 + 디렉터리 파싱
  2. `nodes` 테이블 전체 교체 (DELETE + bulk INSERT)
  3. 디렉터리 엣지: `parent_dir → child` 관계 계산
  4. 위키링크 엣지: stem → id 해석 후 INSERT
  5. `edges` 테이블 전체 교체
- **Acceptance Criteria**: vault 600노드 기준 5초 이내 완료

### Task 2.3: vault_indexer.py — `update_node(path)` / `delete_node(path)` 구현
- **Location**: `app/indexer/vault_indexer.py`
- **Description**:
  - `update_node(path)`:
    1. 해당 node row upsert
    2. `edges WHERE source = id` 삭제 후 재계산
  - `delete_node(path)`:
    1. node row 삭제
    2. `edges WHERE source = id OR target = id` 삭제
  - 디렉터리 생성/삭제도 처리 (Directory 타입 upsert/delete)
- **Acceptance Criteria**: 파일 수정 후 SQLite 내용 검증

---

## Sprint 3: Watchdog Watcher

**Goal**: 파일 이벤트 → 증분 인덱싱 자동화.

**Demo/Validation**:
- vault에 파일 추가 → 2초 내 SQLite 반영 확인
- vault 파일 수정 → 위키링크 엣지 업데이트 확인
- vault 파일 삭제 → 노드/엣지 제거 확인

### Task 3.1: vault_watcher.py 구현
- **Location**: `app/indexer/vault_watcher.py`
- **Description**:
  ```python
  class VaultEventHandler(FileSystemEventHandler):
      def on_created(self, event): indexer.update_node(path)
      def on_modified(self, event): indexer.update_node(path)
      def on_deleted(self, event): indexer.delete_node(path)
      def on_moved(self, event):
          indexer.delete_node(src_path)
          indexer.update_node(dest_path)

  class VaultWatcher:
      def start(self): Observer().schedule(...).start()
      def stop(self): observer.stop()
  ```
  - `.md` 파일과 디렉터리만 처리
  - `.synapsenote/` 경로 이벤트 무시
  - 이벤트 디바운싱: 동일 경로 300ms 내 중복 이벤트 무시

---

## Sprint 4: 서비스 레이어 교체 + 세만틱 제거

**Goal**: node_service / graph_service를 SQLite 조회 기반으로 교체.

**Demo/Validation**:
- `GET /api/graph` 응답 시간 측정 (목표: 200ms 이내)
- 응답 JSON 구조 기존과 동일 확인 (프론트엔드 변경 불필요)

### Task 4.1: node_service.py — SQLite 조회로 교체
- **Location**: `app/services/node_service.py`
- **Description**:
  - `list_nodes()`: `SELECT * FROM nodes` (+ query 필터)
  - `get_node(id)`: `SELECT * FROM nodes WHERE id = ?`
  - `KnowledgeNode.to_dict()` 유지
  - TTL 캐시 제거 (SQLite 자체가 캐시 역할)
  - `invalidate_node_cache()` 제거 (불필요)

### Task 4.2: graph_service.py — SQLite 조회 + 세만틱 제거
- **Location**: `app/services/graph_service.py`
- **Description**:
  - `build_graph()`:
    1. `SELECT * FROM nodes`
    2. `SELECT * FROM edges`
    3. stats 계산 (쿼리 기반)
  - `_compute_semantic_edges` 완전 삭제
  - `_compute_structural_edges` 완전 삭제 (이제 indexer 담당)
  - TTL 캐시 제거
  - `invalidate_graph_cache()` 제거
- **Acceptance Criteria**:
  - semantic 엣지 없음
  - 응답 nodes/edges 구조 기존과 동일

### Task 4.3: graph_router.py — sync → async 전환
- **Location**: `app/routers/graph_router.py`
- **Description**:
  - `build_graph()`가 SQLite 조회(동기)이므로 `run_in_executor` 필요 없음
  - 하지만 `await asyncio.to_thread(build_graph, ...)` 패턴 적용으로 이벤트루프 보호

---

## Sprint 5: 앱 시작 시 연결

**Goal**: FastAPI 시작 → 인덱서 + 감시자 자동 구동.

**Demo/Validation**:
- 컨테이너 재시작 후 `/api/graph` 즉시 응답 확인
- 로그에 `[indexer] full_rebuild completed: N nodes, M edges` 출력

### Task 5.1: main.py — lifespan 이벤트 추가
- **Location**: `app/main.py`
- **Description**:
  ```python
  @asynccontextmanager
  async def lifespan(app):
      init_schema(get_db())
      indexer = VaultIndexer()
      indexer.full_rebuild()       # 동기 → thread pool에서 실행
      watcher = VaultWatcher(indexer)
      watcher.start()
      yield
      watcher.stop()
  ```
  - `FastAPI(lifespan=lifespan)` 사용

### Task 5.2: 프론트엔드 `showEdges.semantic` UI 제거
- **Location**: `GraphTab.jsx`
- **Description**:
  - GraphSettings의 "Semantic" 필터 pill 제거
  - `showEdges` state에서 `semantic` 키 제거
  - GraphCanvas에서 semantic 엣지 색상 렌더링 코드 제거

---

## Testing Strategy

| 단계 | 검증 방법 |
|------|-----------|
| Sprint 1 | `python -c "from app.db.connection import get_db"` |
| Sprint 2 | `full_rebuild()` 후 sqlite3 CLI로 row count 확인 |
| Sprint 3 | vault 파일 편집 후 watch log 확인 |
| Sprint 4 | `curl http://localhost:8000/api/graph` 응답 시간 |
| Sprint 5 | 컨테이너 재시작 → `curl` 즉시 응답 |

## Potential Risks & Gotchas

1. **watchdog 이벤트 폭풍**: Obsidian이 저장 시 여러 이벤트 발생 가능 → 디바운싱 필수 (Task 3.1)
2. **위키링크 stem 해석**: 동일 stem의 파일이 여러 디렉터리에 존재할 때 기존 로직과 동일하게 처리해야 함
3. **SQLite WAL 모드 + Docker volume**: `/vault`가 NFS 마운트라면 WAL 모드가 동작 안 할 수 있음 (로컬 볼트라면 문제없음)
4. **cold start**: 컨테이너 첫 시작 시 600노드 재빌드 동안 API가 준비 중 상태 → health check에서 indexer 준비 완료 여부 포함 고려

## Rollback Plan

- `graph_service.py`, `node_service.py`의 이전 코드는 git history에 보존
- SQLite DB 파일만 삭제하면 next startup에 재빌드
