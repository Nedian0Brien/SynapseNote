# Plan: 11d-1 화면이 쓰는 core 이식

spec: `spec_phase11d-native-screens.md`. 브랜치 `feat/swift-ports`(기준 `feat/swift-writer`), 워크트리 `.worktree/swift-ports`, PR 기준 `feat/swift-writer`. 앱 동작은 바뀌지 않는다.

1. **비교 자료** (`web/scripts/screen-fixtures.ts`, `npm run screen-fixtures`): 고정 시계·id로 Morrow core를 돌린 결과를 `App/Tests/Fixtures/core/expected/`에 쓴다.
   - `database.json`: 가이드 vault의 Reading list와 속성 종류마다 값을 넣은 표에서 `valueOf`·`formulaResult`·`formatValue`, 필터 연산 전부, 정렬 조합, `visibleRows`, `groupRows`(선택·다중선택·체크박스·없음), `convertValue`(모든 종류 쌍), `parseCellValue`, `inferType`, `databaseFromTable`, `defaultDatabase`, `newView`.
   - `formula.json`: 함수 전부와 연산자 우선순위, 오류(문법, 모르는 함수·속성, 0으로 나누기, 순환), 날짜 함수.
   - `diff.json`: `diffLines` 사례(같음, 추가, 삭제, 교체, 긴 문서).
   - `site.json`: 가이드 vault와 11a 비교 문서들로 `buildSite`(파일 목록과 HTML), `docToHtml`의 노드·표시마다.
   - `portability.json`: `createBackup`(고정 시각), `parseBackup`(정상·다른 형식·깨진 JSON·이전 버전), `planRestore`, `planMarkdownImport`, `pageMarkdown`, `workspaceMarkdownFiles`, `attachmentNames`, `safeFileName`.
   - `importer.json`: `planArchiveImport`(Obsidian·Notion 내보내기 형태, CSV 데이터베이스, 첨부 파일), `parseCsv`(따옴표·줄바꿈·BOM).
2. **이식** (`App/Sources/Core/`): `Database/Database.swift`, `Database/Formula.swift`, `Model/Diff.swift`, `Export/Site.swift`, `Export/Portability.swift`, `Export/Importer.swift`, `Model/Migrations.swift`에 `readWorkspace`·`migrate`.
3. **테스트**: 비교 자료마다 하나(`DatabaseTests`, `FormulaTests`, `DiffTests`, `SiteTests`, `PortabilityTests`, `ImporterTests`). 일부러 틀리게 해서 실패하는지 확인.
4. **문서·PR**: `docs/verification/phase11d1-core-ports.md`, 로드맵 11d 행을 11d-1~11d-5로, PR(번호는 `gh pr create` 결과로).

참고: 11c-2에서 동기화로 받은 파일도 외부 편집 두 단계 경로를 지나게 됐지만 iPad에서 동기화로는 확인하지 않았다. 11e에서 동기화를 손볼 때 기기 두 대로 한 번 확인한다.
