# Markdown Vault AI 노트 앱 구현 체크리스트

**작성일**: 2026-06-22
**기준 브랜치**: `feature/markdown-vault-transition`
**목표**: 서버 로컬 Markdown vault를 원본으로 하는 SynapseNote를 완성하고, 각 항목을 현재 코드와 실행 증거로 검증한다.

## 상태 표기

- `[x]` 완료: 코드와 테스트 또는 런타임 증거가 있다.
- `[~]` 진행 중: 일부 구현은 있으나 검증이나 제품 흐름이 부족하다.
- `[ ]` 미완료: 구현이 없거나 증거가 부족하다.

## 1. 실행 기반

- [x] 격리 worktree에서 작업한다.
  - 증거: `.worktrees/markdown-vault-transition`, 브랜치 `feature/markdown-vault-transition`.
- [x] backend 베이스라인 테스트가 통과한다.
  - 검증: `pytest services/web/backend/tests services/web/tests -q`.
- [x] frontend 베이스라인 테스트가 통과한다.
  - 검증: `npm test` in `services/web/frontend`.
- [ ] 전환 완료 후 `deploy/deploy.sh`로 배포한다.
  - 검증: `bash deploy/deploy.sh`, localhost web/api healthcheck.

## 2. Vault 저장소

- [x] 문서 원본은 `VAULT_ROOT` 아래 `.md` 파일이다.
  - 증거: `services/web/backend/app/services/document_service.py`.
- [x] vault 밖 path traversal을 차단한다.
  - 증거: `services/web/backend/app/services/vault_paths.py`, document tests.
- [x] `.md` 외 문서 쓰기를 거부한다.
  - 증거: document service/router tests.
- [x] 파일 쓰기는 atomic write를 사용한다.
  - 증거: `document_service._atomic_write_text`.
- [x] 문서 revision hash를 read/write 응답에 포함한다.
  - 증거: `hash` 필드, document tests.
- [x] 오래된 `baseHash` 저장은 409 충돌로 거부한다.
  - 증거: `document_revision_conflict` tests.
- [x] 삭제는 즉시 삭제 대신 휴지통 정책을 제공한다.
  - 증거: `.synapsenote/trash/` 이동, document service/router tests.
- [x] attachment read/write/list API를 제공한다.
  - 증거: attachment create/list/read/delete API tests.

## 3. 준실시간 동기화

- [x] 서버가 vault 이벤트를 SSE로 방송한다.
  - 증거: `services/web/backend/app/routers/vault_events_router.py`.
- [x] API 저장/생성/삭제/이동이 문서 이벤트를 발행한다.
  - 증거: `document_router.py`.
- [x] watcher가 외부 파일 변경 이벤트를 발행한다.
  - 증거: `vault_watcher.py`.
- [x] 클라이언트가 현재 문서 이벤트를 감지한다.
  - 증거: `useFileContent.js`.
- [x] 편집 중 외부 변경은 충돌 상태로 표시한다.
  - 증거: `syncStatus`, hook tests.
- [x] Graph/Sidebar가 vault 이벤트를 구독해 자동 갱신된다.
  - 증거: `useVaultEvents`, `useGraph`, `useVaultTree`, hook tests.
- [x] conflict UI가 “내 변경 유지 / 서버 버전 불러오기”를 명확히 제공한다.
  - 증거: `EditorView` sync banner, `useFileContent` conflict action tests.

## 4. Markdown/Obsidian 호환

- [x] `[[wikilink]]`를 파싱한다.
  - 증거: `VaultIndexer.WIKILINK_PATTERN`, graph/backlink tests.
- [x] `#tag`를 파싱한다.
  - 증거: `VaultIndexer.TAG_PATTERN`, tag node/edge tests.
- [x] YAML frontmatter를 파싱하고 title/tags를 반영한다.
  - 증거: frontmatter title/tags graph test.
- [x] Markdown link를 `markdown_link` edge로 인덱싱한다.
  - 증거: `[Title](other.md)` graph edge test.
- [x] Obsidian embed `![[file]]`를 attachment edge로 인덱싱한다.
  - 증거: attachment node/edge graph test.
- [x] Obsidian callout `> [!note]`를 노드 summary에서 처리한다.
  - 증거: callout marker summary test. chunk 처리는 AI chunker 항목에서 별도 추적.
- [x] 중복 제목과 동일 stem wikilink 해석 정책을 문서화하고 테스트한다.
  - 증거: same-dir 우선, vault-relative path wikilink tests.

## 5. Graph/Search

- [x] directory edge와 wikilink edge를 생성한다.
  - 증거: `VaultIndexer.full_rebuild`, graph tests.
- [x] tag metadata를 node에 저장한다.
  - 증거: `nodes.tags`, frontmatter/body tag tests.
- [x] edge type을 `directory`, `wikilink`, `markdown_link`, `tag`, `attachment`로 확장한다.
  - 증거: 각 edge type 구현, graph tests.
- [x] 깨진 링크와 미해결 wikilink를 별도 상태로 표시한다.
  - 증거: `unresolved_links` index table, `/api/graph/diagnostics`, diagnostics tests.
- [x] full rebuild와 incremental update가 같은 graph 결과를 만든다.
  - 증거: changed document fixture parity test.
- [x] 1,000개 문서 규모 인덱싱 시간을 측정한다.
  - 증거: `/usr/bin/python3 services/web/backend/tools/benchmark_vault_indexer.py` → `docs=1000 nodes=1002 edges=3001 elapsed_seconds=18.748`.

## 6. Markdown Editor

- [x] editor 저장은 Markdown document API를 사용한다.
  - 증거: `useFileContent.js`, `EditorView.jsx`.
- [x] wikilink autocomplete와 navigation이 있다.
  - 증거: `wikilinkPlugin.js`, editor hook.
- [x] 저장 상태와 동기화 상태를 표시한다.
  - 증거: `editor-sync-banner`.
- [ ] source/preview 모드 정책을 확정한다.
  - 검증: 모드 전환 UI와 markdown round trip 테스트.
- [ ] 모바일 Safari 입력/확대/커서 회귀를 실제 브라우저로 확인한다.
  - 검증: 모바일 viewport 또는 실제 Safari 확인 기록.

## 7. AI/Context

- [ ] Markdown chunker를 구현한다.
  - 검증: heading/list/code/frontmatter fixture별 chunk 테스트.
- [ ] chunk hash 기반 재색인을 구현한다.
  - 검증: 문서 일부 수정 시 해당 문서 chunk만 갱신.
- [ ] 검색/임베딩 저장소를 `.synapsenote/` 아래에 둔다.
  - 검증: index file 생성과 재생성 가능성 테스트.
- [ ] Context Manager가 file path, heading, chunk id를 참조한다.
  - 검증: 선택한 문서/chunk만 AI 요청에 포함.
- [ ] AI 응답에 Markdown path 기준 출처가 남는다.
  - 검증: chat run 결과에 source path/heading 포함.

## 8. Capture

- [~] AI 대화 capture가 Markdown 문서를 생성한다.
  - 증거: `capture_service.py`; 새 동기화/인덱스 계약과 통합 검증 필요.
- [ ] capture 저장 위치를 새 노트/현재 노트 append/지정 폴더 중 선택할 수 있다.
  - 검증: 각 저장 방식별 API/UI 테스트.
- [ ] capture 결과가 graph/search/context에 즉시 반영된다.
  - 검증: capture 후 watcher/indexer/event 확인.

## 9. AppFlowy 의존 정리

- [ ] 현재 배포 런타임이 AppFlowy Web인지 레거시 `services/web`인지 확정한다.
  - 검증: 실행 중 컨테이너, route, image, deploy script 확인.
- [ ] AppFlowy Cloud collab 저장소가 필수 의존성이 아니게 한다.
  - 검증: AppFlowy Cloud 서비스를 내려도 core note 기능 통과.
- [ ] AppFlowy Web에서 가져온 UI 변경 중 필요한 디자인 자산만 선별한다.
  - 검증: 디자인 토큰/컴포넌트 목록.
- [ ] 배포 compose/deploy를 Markdown vault web/api 기준으로 단순화한다.
  - 검증: `deploy/deploy.sh`와 healthcheck.

## 10. 백업/운영

- [ ] `VAULT_ROOT`와 `.synapsenote/` 백업 정책을 정한다.
  - 검증: 백업 산출물에 Markdown/attachment/index 정책 반영.
- [ ] index DB는 파생 데이터로 재생성 가능해야 한다.
  - 검증: `.synapsenote/*.db` 삭제 후 rebuild 통과.
- [ ] 운영 healthcheck가 vault read/write 가능성을 확인한다.
  - 검증: `/health` 또는 별도 diagnostics endpoint.
- [ ] 배포 후 `synapse.lawdigest.kr`에서 문서 생성/수정/동기화 smoke를 통과한다.
  - 검증: live URL 수동/자동 smoke 결과.
