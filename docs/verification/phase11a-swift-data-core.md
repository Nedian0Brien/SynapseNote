# 11a단계 Swift 데이터 코어 검증 결과

- 날짜: 2026-10-19 ~ 2026-10-20
- 브랜치: `feat/swift-core`(기준 `feat/release`)
- 환경: Xcode 27.0, macOS 27.0, iOS 27.0 iPad Pro 13-inch (M5) 시뮬레이터, node(ICU 78.3, 로캘 en-US)
- 비교 기준: Morrow a2daae1의 TypeScript 코어. `npm --prefix web run core-fixtures`가 node에서 Morrow 코드로 결과를 만들어 `App/Tests/Fixtures/core/expected/`에 쓰고, Swift 테스트가 같은 입력으로 같은 결과를 내는지 본다. 시각·id·시간대(UTC)·`new Date()`·`crypto.randomUUID`를 고정해, 날짜가 바뀌어도 같은 자료가 나온다.
- 앱 동작은 바뀌지 않는다. 파일을 쓰는 쪽은 여전히 웹(Morrow 세션)이고, Swift 코어는 DEBUG 빌드에서 읽고 비교만 한다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 42개 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 106개(10단계 90개 + 새 16개) |
| `xcodebuild -scheme SynapseNote -destination 'platform=iOS Simulator,…' test` | 시작하지 못함(아래 참고사항). 이전 단계들도 단위 테스트는 macOS에서만 돌렸다 |

## Morrow 결과와의 비교

| 비교 자료 | 내용 | 결과 |
|---|---|---|
| `markdown.json` | 경계 사례 22개 + Morrow 테스트 입력 5개: `markdownToDoc` 트리, `docToMarkdown`, 다시 읽은 트리 | 27개 모두 같음 |
| `markdown-fuzz.json` | 까다로운 조각(강조 기호, 링크, 위키 링크, HTML, 엔티티, 수식, 표, 콜아웃, 한글, 이모지, CRLF 등)을 시드 고정 난수로 섞은 문서 1,500개 | 트리 1,500개, Markdown 1,500개 모두 같음 |
| `frontmatter.json` | 27개 파일의 `splitFrontmatter`·`joinFrontmatter` | 모두 같음(YAML 1.1 값 `yes`·`017`·`.inf`, 접힌 문자열 포함) |
| `frontmatter-fuzz.json` | 현실적인 머리말과 깨진 YAML을 섞은 1,500개(오류 585건, 값이 있는 머리말 562건, 키 1,254개) | 값, 머리말 원문, 본문, 오류 여부, 다시 쓴 글 모두 같음 |
| `yaml-stringify.json` | 따옴표·여러 줄·제어 문자·문서 표시(`---`)·숫자처럼 읽히는 글을 담은 값 1,500개의 yaml `stringify` | 모두 같음 |
| `collation.json` | 139개 이름의 모든 쌍(19,321쌍)을 en-US와 ko-KR에서 `localeCompare` 기본 / `{ numeric, sensitivity: 'base' }`로 비교 | 4가지 모두 같음 |
| `vaults.json` | 가이드 vault(19파일, 17페이지: 데이터베이스·캔버스·커버·태그), Obsidian vault, NFC/NFD 이름 vault의 `loadVault` 결과와 페이지마다 다시 쓴 파일 | 모두 같음 |
| `session.json` | 빈 vault에 가이드를 만드는 명령 19개와 9단계 편집(이름 바꾸기, 새 페이지·태그·커버·아이콘, 이동·복제, 본문 편집·체크, 데이터베이스 속성·정의, 휴지통·복원, 영구 삭제·비우기, 파일 이름에 못 쓰는 글자, 실패하는 명령 3개) | 명령 결과와 오류 문구, 저장마다 vault에 넘긴 파일 작업(쓰기·이름 바꾸기·지우기·빈 폴더 정리·레지스트리)이 순서까지 같음, 마지막 파일 19개도 같음 |
| `vaults.json` 다시 열기 | 세 vault를 편집 없이 열고 저장 | 파일 작업 0개 |
| `templates.json` | moment 토큰 날짜 형식 10개, 자리 채우기 5개, 문서 템플릿 적용 | 모두 같음 |

비교가 실제로 일어나는지 보려고 일부러 틀리게 해서 실패하는 것도 확인했다: `hr` 처리를 빼면 Markdown 비교가, 시각을 1ms 바꾸면 vault 비교가, 레지스트리 들여쓰기를 바꾸면 세션 비교가 실패한다.

## DEBUG 동시 실행 (iPad 시뮬레이터)

vault가 열리면(`workspace` 첫 보고) Swift 코어가 같은 vault를 다시 스캔해 `loadVault`를 돌리고, 편집기 페이지의 `state` 질의 결과(페이지, 문서, 읽지 못한 페이지, 문제 목록)와 비교한다. 결과는 로그(`com.synapsenote.native`, category `core`)에 남는다.

| vault | 결과 |
|---|---|
| 가이드 vault (Files의 `untitled folder`, 9단계 첫 실행 가이드) | `17 pages, 17 docs, 0 differences, 1 opened since` |
| 일상 vault (앱 문서 폴더, 1~9단계 시험 기록: 저널·데이터베이스·캔버스·템플릿·한글 할 일·복원한 백업) | `20 pages, 20 docs, 0 differences, 0 opened since` |

`opened since`는 웹이 vault를 읽은 뒤 첫 화면 페이지를 띄우며 `page.markOpened`로 `lastOpenedAt`을 바꾼 페이지 수다. 읽기 결과의 차이가 아니므로 따로 센다. 처음 실행에서는 이 값이 차이 1건으로 잡혀 그렇게 고쳤다.

## 알려진 차이

모두 Morrow가 쓰는 파일이나 보통의 머리말에서는 나오지 않는 경우다.

- **YAML 오류 문구**: libyaml의 문구다. 오류인지 아닌지는 비교 자료 1,500개에서 모두 같다.
- **YAML의 특수 태그**: `!!binary`, `!!timestamp`, `!!set`, `!!omap`, `!!pairs`는 Morrow(JS)에서 바이트 배열·Date·Set·Map이 되지만 Swift는 글자나 보통 컬렉션으로 읽는다. `%YAML 1.1` 지시어로 1.1 스키마로 바꾸는 것, 별칭 수 제한(`maxAliasCount`)도 하지 않는다.
- **컬렉션 별칭**: 같은 목록을 별칭(`*a`)으로 두 번 쓰면 Morrow는 다시 쓸 때 앵커를 붙이고, Swift는 펼쳐 쓴다(머리말이 바뀐 경우에만 다시 쓴다).
- **컬렉션을 키로 쓴 경우**(`? a: b`, `[a, b]: c`): Morrow는 원문 표기와 주석까지 살려 키 글자를 만든다. Swift는 원문 표기를 갖고 있지 않다.
- **콜아웃 종류가 `constructor`·`toString` 같은 이름일 때**: Morrow는 일반 객체에서 찾아 함수가 나오고, JSON과 파일에는 빠진다. Swift는 `note`로 둔다.
- **`[[0050-01-01]]` 같은 두 자리 연도의 날짜 언급을 콜아웃 제목에 쓴 경우**: Morrow의 `readableDate`는 1950년으로 읽는다.
- **저장 계획에서 11c로 넘긴 것**: 페이지 기록(스냅숏 파일), 암호화된 페이지 쓰기(키 필요), 다른 앱의 편집 반영, 저장 시점 예약(300ms, 재시도). 디스크 충돌이면 Morrow는 디스크 판을 기록에 남긴 뒤 다시 쓰고, Swift는 다시 쓰기만 한다.

## 참고사항

- iOS 시뮬레이터 단위 테스트: iPad Pro 13-inch (M5)와 iPhone 17 Pro Max 모두 `The test runner hung before establishing connection.`으로 테스트가 시작되지 않았다. 시뮬레이터를 다시 켜도 같고, 기준 브랜치 `feat/release`(f270657)에서도 같아서 11a 변경 때문은 아니다. 같은 시뮬레이터에서 앱 빌드·실행과 DEBUG 동시 실행은 됐다. 코어 테스트는 플랫폼에 기대는 코드가 없고 macOS에서 모두 통과했다.
- 시뮬레이터 자동 조작에서 세로 방향 iPad의 사이드바 버튼을 눌러도 사이드바가 열리지 않았고, 왼쪽 가장자리에서 밀면 열렸다. 11a에서 바꾸지 않은 화면이라 원인은 보지 않았다.
