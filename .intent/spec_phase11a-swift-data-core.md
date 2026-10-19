# Spec: 11단계 Swift 전환 — 11a 데이터 코어

상위 intent: `intent_morrow-full-port.md` (수락됨). 사용자 결정(2026-10-19): 11단계를 진행해 최종 전환까지 간다(편집기 포함).

## 11단계 전체 구조

- **쓰는 쪽은 언제나 하나.** 웹(`saveQueue`)과 Swift가 같은 vault 파일을 함께 쓰면 상태가 깨진다. 그래서 순서를 이렇게 한다.
  1. Swift 코어를 만들어 Morrow TS와 결과가 같은지 테스트로 맞춘다.
  2. DEBUG 빌드에서 두 코어를 함께 돌려 차이를 기록한다.
  3. 쓰기 권한을 한 번에 Swift로 넘긴다.
- **단계별 PR이 각각 앱을 완전히 동작하는 상태로 둔다.**

| 하위 단계 | 내용 | 쓰는 쪽 |
|---|---|---|
| 11a (이 spec) | 데이터 코어 읽기·쓰기 Swift 구현, Morrow 결과와 일치 테스트, DEBUG 동시 실행 비교 | 웹 |
| 11b | 조회(검색·백링크·태그·작업·그래프·홈)를 Swift `WorkspaceService`로, DEBUG에서 웹 조회와 비교 | 웹 |
| 11c | 쓰기 권한 전환: Swift 세션이 유일한 writer, 웹은 `vaultChanges`로 받는 복제본. 데이터베이스·캔버스·히스토리·암호화·플래시카드 코어 | Swift |
| 11d | 네이티브 편집기(TipTap 대체) | Swift |
| 11e | 웹 편집기·번들·node 빌드 제거 | Swift |

11b 이후는 각자 spec을 쓴다.

## 11a 범위

Morrow a2daae1의 다음을 Swift로 옮긴다(`App/Sources/Core/`).

- `core/model.ts`, `doc.ts`, `tree.ts`, `daily.ts`, `templates.ts`(모델, 문서 트리)
- `core/markdown/parse.ts`, `serialize.ts`(Markdown ↔ 문서 트리)
- `core/vault/frontmatter.ts`, `paths.ts`, `layout.ts`, `pageFile.ts`, `load.ts`, `plan.ts`(vault 파일 ↔ 페이지)
- `core/commands.ts`(페이지 명령), `storage/session.ts`·`saveQueue.ts`·`vaultRepository.ts`의 읽기·쓰기 계획(실제 파일 쓰기는 연결하지 않는다)
- `load.ts`·`commands.ts`가 가져다 쓰는 것: `core/canvas.ts`(JSON Canvas 읽기·쓰기), `crypto.ts`의 `isEncryptedText`, `search.ts`의 `foldText`, `migrations.ts`의 `normalizeDatabase`, `tasks.ts`의 `setTaskChecked`

11a에서는 Swift 코어가 파일을 쓰지 않는다. 앱 동작은 바뀌지 않는다.

## 외부 라이브러리 동작

- **markdown-it 15.0.2**(`parse.ts`가 쓴다. CommonMark 모드, `html: true`, `table`·`strikethrough`, Morrow 규칙 4개 추가): Morrow가 쓰는 규칙만 Swift로 옮긴다. cmark-gfm(swift-markdown)은 CommonMark 판과 GFM 확장이 달라 경계 사례에서 결과가 갈리므로 쓰지 않는다. MIT 라이선스, NOTICE에 적는다.
- **yaml 2.9.1**(`frontmatter.ts`의 `parse`·`stringify`):
  - 읽기: [Yams](https://github.com/jpsim/yams)에 들어 있는 libyaml(CYaml)의 이벤트로 트리를 직접 만든다(Yams의 `compose`는 겹치는 키를 오류로 본다). 값은 yaml 2.x의 YAML 1.2 core 규칙으로 해석하고, 키 순서와 겹치는 키의 JS 동작(첫 자리, 마지막 값)을 지킨다.
  - 쓰기: Morrow의 옵션(`lineWidth: 0`, `defaultStringType: PLAIN`, `defaultKeyType: PLAIN`)으로 yaml이 내는 글자를 그대로 내도록 옮긴다. 읽기 오류 문구는 libyaml의 것이라 Morrow와 다를 수 있다(파일은 그대로 두는 동작은 같다).

## 지켜야 할 규칙(JS와 Swift의 차이)

1. **문자열 비교와 정렬은 UTF-16 코드 단위로.** Swift `String ==`·`Dictionary` 키는 정규화 동등(NFC/NFD)을 같게 본다. Morrow에서 다른 두 파일 이름이 Swift에서 합쳐지면 안 된다. `SyncPlan`과 같은 방식을 공용으로 쓴다.
2. **숫자 → 글자는 JS `Number.prototype.toString`대로.** `1`은 `"1"`이고, `-0`, `1e21`, 소수 표기도 JS를 따른다.
3. **JSON은 Morrow의 키 순서와 들여쓰기 그대로.** `.morrow/workspace.json`, `.canvas` 등 `JSON.stringify(…, null, n)`의 결과를 순서 있는 작성기로 낸다.
4. **모르는 노드와 속성은 그대로 보존.** 문서 트리는 모르는 `type`·`attrs`를 원래 JSON으로 들고 있다가 그대로 쓴다.
5. **정규식은 하나씩 옮기고 테스트한다.** JS의 `\b`, `\s`, `u` 플래그, `\p{…}`, lookbehind 1곳은 Swift에서 뜻이 다를 수 있다.
6. **id·날짜:** `newId`는 `crypto.randomUUID()`(소문자 UUID), 날짜 키는 로컬 시간대 `yyyy-mm-dd`.

## 받아들이는 기준

- **비교 자료** `npm run core-fixtures`: node에서 Morrow TS로 다음 입력을 처리해 결과를 JSON으로 쓴다.
  - 첫 실행 가이드 vault(`sampleCommands`가 모든 블록·속성·캔버스·커버·태그를 쓴다)
  - Morrow `*.test.ts`의 입력
  - 경계 사례 모음(한글·NFD 파일 이름, Obsidian 문법, 잘못된 머리말, 모르는 블록)
- **Swift 테스트:** 같은 입력에서 다음 두 가지가 Morrow와 같다.
  - 읽기 결과(문서 트리 JSON)
  - 쓰기 결과: `serialize(parse(x))`를 Morrow 출력과 바이트 단위로 비교한다(원본 파일과 비교하지 않는다).
- **바꾸지 않고 다시 쓰기:** vault를 열어 아무것도 바꾸지 않고 다시 쓰면 바뀌는 바이트가 0이다(동기화·히스토리가 가짜 변경을 보지 않게).
- **DEBUG 동시 실행:** 앱이 vault를 열 때 Swift 코어도 같은 vault를 읽고, 웹이 보고하는 페이지와 문서를 비교해 차이를 로그에 남긴다. iPad 시뮬레이터 시험 vault 두 개(일상 vault, 가이드 vault)에서 차이 0을 `docs/verification/phase11a-swift-data-core.md`에 적는다.
- PR #12(기준 `feat/release`). 앱 동작은 바뀌지 않는다.

## 범위 밖

- 파일 쓰기 연결(11c), 조회(11b), 데이터베이스 수식·캔버스·히스토리·암호화·플래시카드(11c), 게시·가져오기·백업(`site.ts`, `importer.ts`, `portability.ts`, `migrations.ts`, 11c 이후), 편집기(11d)
- 서명 설정(Personal Team 적용은 `feat/release`에서 사용자 확인 뒤)
