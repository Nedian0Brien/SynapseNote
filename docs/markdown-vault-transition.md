# Markdown Vault 전환 기준

SynapseNote는 앞으로 파일 기반 노트 저장소를 우선한다. 단, 제품 기준 UI는 현재 배포된 SynapseNote UI다.

## 기준 원칙

1. 현재 배포 UI와 라우팅, 브랜딩, 사용자 흐름을 기준점으로 유지한다.
2. 문서 원본 저장소는 upstream collab 계층에서 Markdown vault로 옮긴다.
3. 레거시 `legacy/markdown-vault/`는 복귀 대상 UI가 아니라 재사용 가능한 backend, parser, indexer, test 자산이다.
4. 파일 기반 전환 전까지 운영 데이터 삭제, DB 초기화, 볼륨 재생성은 하지 않는다.
5. Agent는 Markdown vault 전환 뒤 실제 파일 내용을 읽는 구조로 다시 설계한다.

## 현재 상태

- 현재 운영 원본: upstream collab/Postgres/MinIO
- 목표 원본: 서버 파일시스템의 Markdown vault
- 목표 vault 예시:

```text
VAULT_ROOT/
  Notes/
  Attachments/
  .synapsenote/
    graph.db
    index.sqlite
    note-id-map.json
```

## 재사용 후보

`legacy/markdown-vault/`에서 우선 검토할 자산은 다음이다.

- `services/web/backend/app/services/document_service.py`: Markdown 파일 CRUD
- `services/web/backend/app/services/vault_paths.py`: vault 경로 검증
- `services/web/backend/app/indexer/vault_indexer.py`: graph, wikilink, tag, chunk indexing
- `services/web/backend/app/indexer/vault_watcher.py`: 파일 변경 감시
- `services/web/backend/app/services/agent_adapters/codex_cli.py`: Codex CLI adapter
- `services/web/backend/tests/`: document, graph, chunk 검증

## 1차 전환 범위

1차 작업은 UI 교체가 아니라 저장소 경계 만들기다.

- 현재 SynapseNote UI에서 문서 목록, 문서 열기, 문서 저장에 필요한 최소 API 계약을 정의한다.
- Markdown vault API를 현재 UI가 읽을 수 있는 형태로 맞춘다.
- 기존 upstream collab 저장소와 새 Markdown vault 저장소를 동시에 지우거나 병합하지 않는다.
- 기존 운영 데이터는 읽기 전용 참고 상태로 둔다.

## 이후 작업 순서

1. 현재 UI가 실제로 필요로 하는 view/document 데이터 계약을 정리한다.
2. Markdown vault API를 별도 서비스로 띄워 health, document read/write, graph read를 검증한다.
3. UI의 Library, Graph, Editor 경로를 vault API에 연결한다.
4. 저장/충돌/외부 파일 변경 감지를 붙인다.
5. Agent가 선택된 Markdown 파일과 검색 결과를 prompt context로 넣도록 다시 구현한다.

## 하지 않을 일

- 현재 배포 UI를 레거시 Vite UI로 되돌리지 않는다.
- 원본 upstream으로 푸시하지 않는다.
- 운영 DB, MinIO, volume을 정리 작업 중 삭제하지 않는다.
- Codex CLI가 repo 파일을 직접 훑는 방식으로 사용자 노트를 읽게 하지 않는다.
