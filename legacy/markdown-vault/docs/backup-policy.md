# SynapseNote Markdown Vault 백업 정책

## 원칙

`VAULT_ROOT` 아래 Markdown 파일과 첨부파일이 원본이다. `.synapsenote/` 아래 데이터는 성격에 따라 나눈다.

- 백업 대상: Markdown 문서, 첨부파일, `.synapsenote/trash/`, 향후 migration log와 id map
- 백업 제외: `.synapsenote/graph.db`, `graph.db-wal`, `graph.db-shm`, `healthcheck.tmp`

Graph, chunk, unresolved link, embedding status는 `graph.db` 안의 파생 인덱스다. 손실되면 앱 시작 시 또는 `VaultIndexer.full_rebuild()`로 재생성한다.

## 현재 스크립트

`services/backup/backup.sh`는 `/vault`를 tar.gz로 묶어 `${RUNTIME_ROOT}/backups`에 저장한다. 아카이브에는 원본 문서와 첨부파일이 들어가고, 재생성 가능한 SQLite 인덱스 파일은 제외된다.

## 복구

1. 백업 아카이브를 `VAULT_ROOT`에 해제한다.
2. 앱을 시작하거나 backend에서 full rebuild를 실행한다.
3. `/health`에서 vault read/write 상태를 확인한다.
4. `/api/graph`, `/api/chunks`, `/api/graph/diagnostics`로 파생 인덱스가 다시 만들어졌는지 확인한다.
