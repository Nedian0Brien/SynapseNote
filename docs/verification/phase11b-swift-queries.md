# 11b단계 Swift 조회 검증 결과

- 날짜: 2026-10-20
- 브랜치: `feat/swift-queries`(기준 `feat/swift-core`)
- 환경: Xcode 27.0, macOS 27.0, iOS 27.0 iPad Pro 13-inch (M5) 시뮬레이터, node(ICU 78.3, 로캘 en-US)
- 비교 기준: Morrow a2daae1의 TypeScript 코어와 `web/src/main.tsx`의 `query`. 11a와 같이 `npm --prefix web run core-fixtures`가 node에서 답을 만들어 `App/Tests/Fixtures/core/expected/`에 쓰고, Swift 테스트가 같은 입력으로 같은 JSON 값을 내는지 본다.
- 바뀐 동작: 네이티브 화면의 조회 13종(search, recent, home, backlinks, mentions, outline, tags, tagPages, tasks, templates, counts, review, graph)을 Swift가 계산한다. 웹은 상태가 바뀔 때마다 변화분(`state` 메시지)을 보내고, Swift는 그것으로 거울 상태(`StateMirror`)를 만든다. 파일을 쓰는 쪽은 여전히 웹이다. 거울이 아직 없으면(vault를 연 직후 첫 메시지 전) 예전처럼 편집기 페이지에 묻는다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 43개(11a 42개 + `stateDelta` 1개) |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 109개(11a 106개 + 조회·거울·브리지 3개) |
| `xcodebuild -scheme SynapseNote -destination 'platform=iOS Simulator,…' test` | 시작하지 못함. iPhone 17 Pro Max에서도 `The test runner hung before establishing connection.`(11a와 같은 문제, 아래 참고사항) |

## Morrow 결과와의 비교

| 비교 자료 | 내용 | 결과 |
|---|---|---|
| `queries.json` | 상태 4개(가이드 vault 17페이지, 11a 세션 편집 뒤 상태, Obsidian vault, 한글·악센트·저널·복습 기록이 든 일상 상태)에서 조회 13종을 여러 인자로 부른 답 447개. search 144(태그 조건, 악센트 접기, 여러 단어), graph 64(태그·하위 페이지·고립 페이지·초점·깊이 조합), backlinks·mentions·outline 각 55, tagPages 34 등 | 447개 모두 JSON 값으로 같음 |
| `mirror.json` | 11a 세션 10단계마다 `web/src/stateDelta.ts`가 만든 변화분과 그때의 웹 상태 | 변화분을 차례로 적용한 거울이 단계마다 웹 상태와 같음(페이지 키, 페이지, 문서) |
| `collation.json` 추가분 | `{ sensitivity: 'base' }`만 준 비교(태그 정렬) | 같음 |

순번이 낮거나 같은 변화분은 버리고, 첫 메시지가 전체 상태가 아니면 받지 않는 것도 `StateMirrorTests.oldDeltasAreRefused`로 확인했다.

## DEBUG 비교 (iPad 시뮬레이터)

DEBUG 빌드는 Swift 답으로 화면을 그리면서 같은 조회를 편집기 페이지에도 물어 JSON 값을 비교하고 로그(`com.synapsenote.native`, category `core`)에 `same as the page` 또는 `differs`를 남긴다.

| vault | 쓴 화면과 동작 | 결과 |
|---|---|---|
| 일상 vault(앱 문서 폴더, 20페이지) | Home, 팔레트(최근·검색), 페이지 열기(개요·백링크·연결 안 된 언급), Tasks에서 체크와 해제(순번 3~6), Tags와 태그별 페이지, Graph 옵션 바꾸기, Review에서 카드 평가(순번 7, 복습 기록 변화분), 템플릿 목록 | 13종 모두 `same as the page` |
| 가이드 vault(Files의 `untitled folder`, 17페이지) | 동시 실행 `17 pages, 17 docs, 0 differences`, 검색 `links tags`, 백링크·언급, Tasks 체크와 해제, Graph 하위 페이지 켜고 끄기, Tags와 `#getting-started`, Review, Home | templates를 뺀 12종 38건 모두 같음, 차이 0 |

### 검증 중 고친 결함

처음 빌드에서 페이지를 휴지통으로 옮긴 직후 Home 질의가 `differs`로 두 번 기록됐다. Swift 답의 페이지 수가 웹보다 1 많았고, 바로 다음 순번에서는 같았다.

- 원인: `report()`가 `workspace` 메시지를 먼저 보내고 `state` 변화분을 뒤에 보냈다. `workspace`를 처리하면 `revision`이 올라 화면이 곧바로 다시 질의하는데, 그때 거울은 아직 이전 상태였다.
- 수정(1bcd299): 변화분을 `workspace`보다 먼저 보낸다. 두 메시지는 보낸 순서대로 main actor에서 처리되므로, 화면이 질의할 때 거울은 이미 최신이다.
- 확인: 수정한 빌드에서 새 페이지를 만들고 바로 휴지통으로 옮겼을 때 Home 질의 두 번이 모두 `same as the page`였다.

## 알려진 차이

- **연결 안 된 언급의 대소문자 무시**: Morrow는 JavaScript 정규식의 `iu`(유니코드 단순 대소문자 접기)를 쓰고, Swift는 `NSRegularExpression`의 `.caseInsensitive`(ICU)를 쓴다. 비교 자료와 두 vault에서는 차이가 없었다. 두 방식의 대소문자 규칙이 모든 문자에서 같은지는 확인하지 않았다.
- **거울이 준비되기 전의 조회**: vault를 연 직후 첫 `state` 메시지가 오기 전에는 예전처럼 편집기 페이지에 묻는다. 비교 로그에는 남지 않는다.
- 11a의 알려진 차이(YAML 특수 태그, 컬렉션 별칭 등)는 그대로다.

## 참고사항

- iOS 시뮬레이터 단위 테스트가 시작되지 않는 문제는 11a와 같다. 기준 브랜치에서도 같아 이번 변경 때문은 아니며, 원인 조사는 따로 한다.
- 시뮬레이터 조작 중 일상 vault에 빈 `Untitled` 페이지를 실수로 세 번 만들었다. 모두 앱의 `Move Page to Trash`로 휴지통에 옮겼다(휴지통 3개). 페이지 수는 원래대로 20개다.
- 다음 단계 11c에서 이 거울 상태가 Swift 세션이 되고, 쓰는 쪽이 Swift로 바뀐다.
