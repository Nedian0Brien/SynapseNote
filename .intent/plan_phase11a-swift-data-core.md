# Plan: 11a Swift 데이터 코어

spec: `spec_phase11a-swift-data-core.md`. 브랜치 `feat/swift-core`(기준 `feat/release`), 워크트리 `.worktree/swift-core`.

## 순서

1. **비교 자료 먼저** (`web/scripts/core-fixtures.ts`, `npm run core-fixtures` → `App/Tests/Fixtures/core/`)
   - 입력: Morrow `MemoryVault`에 `sampleCommands`(id는 순번 생성기)로 만든 가이드 vault, 경계 사례 파일 모음(`App/Tests/Fixtures/core/input/`), Morrow `*.test.ts`의 Markdown 입력.
   - 출력: 파일마다 `markdownToDoc` 결과, `docToMarkdown(markdownToDoc(x))`, `readPageText`, `splitFrontmatter`·`joinFrontmatter`. vault마다 `loadVault` 결과와 다시 쓴 파일들.
2. **JS 호환 기반** (`App/Sources/Core/JS/`): UTF-16 문자열 키, JS 숫자 → 글자, 순서 있는 JSON 값과 `JSON.stringify(…, null, n)` 작성기, JS 정규식 차이를 메우는 도우미.
3. **모델·문서** (`Core/Model/`): `model`, `doc`(모르는 노드 보존), `tree`, `daily`, `templates`, `canvas`, `isEncryptedText`, `foldText`, `normalizeDatabase`, `setTaskChecked`.
4. **Markdown** (`Core/Markdown/`): markdown-it 15.0.2에서 CommonMark 모드·`html`·`table`·`strikethrough`에 쓰이는 블록·인라인 규칙과 Morrow 규칙 4개(wikilink, math_inline, highlight, math_block)를 옮긴 토크나이저, 그 위에 `parse.ts`·`serialize.ts`.
5. **Vault** (`Core/Vault/`): `frontmatter`(Yams 노드 읽기 + yaml 2.9.1 PLAIN 출력 작성기), `paths`, `layout`, `pageFile`, `load`, `plan`.
6. **명령·세션 계획** (`Core/Session/`): `applyCommand`, 저장할 파일 계산(`vaultRepository`의 쓰기 계획). 파일 쓰기는 연결하지 않는다.
7. **Swift 테스트** (`App/Tests/Core/`): 각 층을 비교 자료와 맞춘다. 바꾸지 않고 다시 쓰면 0바이트 변화.
8. **DEBUG 동시 실행**: `EditorController`가 vault를 열면 Swift 코어도 읽고, `workspace` 이벤트마다 웹이 보고한 페이지와 비교해 차이를 로그로 남긴다.
9. **검증**: iPad 시뮬레이터 시험 vault 둘에서 차이 0, 검증 문서, 로드맵, NOTICE(markdown-it MIT, Yams MIT), 푸시, PR #12(기준 `feat/release`).

Yams는 `project.yml` packages로 더한다(6.1.0 이상).
