# 네이티브 연속 텍스트 편집기 스파이크 — 결과 보고서

`Y.Text('source')` 하나만 동기화하는 네이티브 편집기는 성립한다. iPad 앱이 웹 편집기·에이전트와 같은 문서를 편집해도 입력이 사라지지 않았고, TextKit 2 텍스트 뷰 하나로 라이브 프리뷰, 네이티브 뷰 삽입, 접기를 구현했다. 네이티브 앱 개발에 들어가기 전에 서버 쪽 문제 두 가지를 먼저 고쳐야 한다. 서버는 5,000줄 문서의 편집을 초당 1.5회밖에 처리하지 못해 입력 도중 멈추고, 웹 편집기 경로(`Y.XmlFragment`)는 이미 반영된 입력을 지운다.

- intent·spec·plan: `.intent/*_native-editor-spike.md`
- 측정 환경: Mac(Apple Silicon)의 iPad Pro 13-inch(M5) 시뮬레이터 iOS 27.0·26.5, 로컬 dev 서버(`OK_TEST_CONTENT_DIR` 임시 폴더, `OK_TEST_GIT_ENABLED=1`). 실기기에서는 측정하지 않았다.

## 요구사항별 결과

| 요구사항 | 결과 | 근거 |
|---|---|---|
| R1 동기화 | 성립 | Hocuspocus 인증 → SyncStep1/2로 617 단위 문서 동기화 |
| R2 동시 편집 | `Y.Text` 전용 작성자 조합에서 성립. 세 작성자 전체 조합은 서버 문제로 실패 | 아래 "동시 편집 측정" |
| R3 라이브 프리뷰 | 성립 | UI 테스트: 탭한 문단에서만 기호 표시, 체크박스 탭이 서버 텍스트의 한 글자만 바꿈 |
| R4 네이티브 뷰 | 성립 | UI 테스트: 커서가 `<DatabaseView … />` 줄 안에 멈추지 않음, 주변 편집 뒤 그 줄의 바이트 동일, 가로 드래그로 뷰가 스크롤되고 텍스트 뷰는 움직이지 않음 |
| R5 접기 | 성립 | UI 테스트: 접으면 본문 줄이 레이아웃에서 빠짐, 서버 텍스트 불변, 접힌 동안 agent-patch로 본문을 바꾼 뒤 앱 해시 = 서버 해시, 펼치면 본문 복귀 |
| R6 입력 성능 | Release 빌드에서 성립(p95 14.79ms). Debug 빌드는 17.84ms | 아래 "입력 성능" |
| R7 보고서 | 이 문서 | |
| R8 서버·웹·core 불변 | 성립 | `git diff main -- packages` 0줄 |

최종 실행: Rust 테스트 6개, Swift 단위 테스트 15개, UI 테스트 6개(R3–R5 다섯 개와 드래그 대조 테스트 하나)가 모두 통과했다. 가로 스크롤 테스트는 처음에 실패했는데, 앱이 안쪽 스크롤 때 테스트용 상태를 다시 내보내지 않아 테스트가 드래그 전 값을 읽은 것이었다. 앱 로그로 드래그 종료 시 오프셋 561.5pt를 확인한 뒤 상태 갱신을 고쳤다.

## 동시 편집 측정

`scripts/soak.ts`가 세 작성자를 동시에 돌린다. **a**는 iPad 앱(키보드와 같은 `UITextInput` 경로로 입력), **f**는 `Y.XmlFragment` 문단 안에 글자를 넣는 Yjs 클라이언트(웹 편집기가 만드는 편집 형태), **p**는 `/api/agent-patch`다. 각 작성자가 넣은 마커 `⟦출처:시각⟧`로 전달 지연을 재고, 삽입 전용 모드에서는 삭제가 없으므로 최종 텍스트에서 빠진 마커는 유실이다.

| 실행 | 작성자 | 해시(디스크·서버·앱) | 유실(삽입 전용) | 앱 쪽 지연 p95 |
|---|---|---|---|---|
| 10분, 삭제 포함 | a + p | 일치(197ms 안에 수렴) | — | p 22ms |
| 5분, 삽입 전용 | a + p | 일치 | 0 / 318 | p 21ms |
| 2분, 삽입 전용(2회) | a(단어만) + p | 1회차는 비교 시점에 불일치, 사후 확인에서 디스크·서버 일치(앱 값은 덮어써져 확인 불가). 2회차 일치 | 0 / 150, 0 / 139 | — |
| 2분, 삽입 전용 | f 혼자, 앱 없음 | 일치 | **21 / 100** | — |
| 2분, 삽입 전용 | f 혼자, 앱은 연결만 | 일치 | **14 / 100** | — |
| 2분, 삽입 전용 | a + f | 일치 | **8 / 168** | — |
| 3분, 삽입 전용 | a + f + p | 일치 | **84 / 342** | — |
| 10분, 삭제 포함 | a + f + p | **불일치**, 서버 문서 8,374,327 단위 | — | — |

앱 → 서버 `Y.Text` 지연은 모든 실행에서 p95 12ms 이하였다. `Y.Text` 전용 조합에서 서버가 블록을 다시 쓴 횟수는 0이었다.

## 입력 성능

5,000줄(237,462 UTF-16 단위) 문서의 2,500번째 줄에서 초당 10회, 60초 입력.

| 단계 | Debug p50 / p95 / 최대 | Release p50 / p95 / 최대 |
|---|---|---|
| sync: 저장소 편집 → yrs 트랜잭션 → 전송 | 0.30 / 0.42 / 19.0ms | 0.32 / 0.43 / 4.9ms |
| style: 스캐너 증분 갱신 + 속성 | 4.35 / 6.86 / 50.1ms | 2.22 / 3.28 / 6.4ms |
| full: `replace` + 동기 레이아웃 | 13.11 / 17.84 / 271.6ms | 11.74 / **14.79** / 80.8ms |

한 번 입력에 드는 시간 가운데 약 9ms는 UIKit 레이아웃이다. style 단계의 대부분은 편집 뒤 5,000개 줄 레코드의 위치를 옮기는 O(n) 작업이다.

## 발견 사항

### 1. 서버가 큰 문서의 편집을 따라가지 못한다

`scripts/server-load.ts`로 같은 서버에 초당 10회 편집을 30초 넣었다.

| 문서 | 편집 경로 | 반영된 편집 | 반영 지연 p50 | `GET /api/config` |
|---|---|---|---|---|
| 38줄 | `Y.Text` | 294 / 294 | 1ms | p95 5ms |
| 5,000줄 | `Y.Text` | 53 / 294 | 14.4초 | 30초 동안 응답 없음 |
| 5,000줄 | `Y.XmlFragment` | 24 / 294 | 15.9초 | 30초 동안 응답 없음 |

서버는 편집마다 문서 전체를 동기로 처리하는 것으로 보이며, 237k 글자 문서에서 초당 약 1.5회(`Y.Text`), 0.7회(fragment)만 처리했다. 그동안 HTTP 요청도 처리하지 못했고, 다른 문서의 로드(`onLoadDocument`)도 큰 문서를 편집한 연결이 끊길 때까지 시작되지 않았다. 웹 편집기에도 같은 한계가 있다. 네이티브 앱은 사용자가 입력하는 모든 글자를 이 경로로 보내므로, 서버가 `Y.Text` 편집을 바뀐 블록 단위로 처리하게 만드는 것이 네이티브 앱의 선행 조건이다.

### 2. fragment 경로는 이미 반영된 입력을 지운다

삽입 전용 실행에서 사라진 마커는 모두 검증 클라이언트가 `Y.Text`에서 이미 본 것이다. 서버가 한 번 통합한 내용을 나중에 지웠다는 뜻이다. 앱도 agent-patch도 없이 fragment 작성자 하나만 있어도 100개 중 21개가 사라졌다. 이때 서버 로그에 `bridge-invariant-violation`(fragment가 `Y.Text`보다 1~9자 김)이 남았다. f 작성자는 y-prosemirror를 거치지 않고 `Y.XmlText`를 직접 고치므로, 실제 웹 편집에서 얼마나 자주 일어나는지는 측정하지 않았다. 원인 조사는 별도 작업으로 넘겼다.

### 3. fragment 경로에서 이스케이프가 누적되어 문서가 폭증한다

세 작성자 10분 실행에서 서버 문서가 8,374,327 UTF-16 단위(8.4MB)가 됐다. 내용은 `\\\\\\⟦\\f\\:\\1…`처럼 백슬래시가 겹겹이 쌓인 형태였다. fragment → Markdown 직렬화가 같은 입력에 같은 출력을 내지 않아, 왕복할 때마다 이스케이프가 한 겹씩 더해진 것으로 보인다. 이 실행에서 앱은 서버와 연결은 유지했지만 텍스트가 갈라졌고(11,990 단위), 길이 불일치 경고가 1,062건 났다.

### 4. 서로게이트 쌍이 쪼개지면 Yjs와 yrs가 다른 텍스트를 만든다

JS Yjs에서 `a😀b`의 앞쪽 서로게이트 한 단위만 지우는 update를 두 구현에 적용한 결과:

| 구현 | 결과 | 길이 |
|---|---|---|
| Yjs(JS) | `a\uDE00b` | 3 |
| yrs(Rust) | `ab` | 2 |

같은 update로 두 쪽의 텍스트와 이후 모든 오프셋이 한 칸씩 어긋난다. 초기 soak의 합성 작성자가 이모지 중간을 잘라서 이 문제가 드러났다(10분 실행에서 앱 11,954 대 서버 11,952 단위, 서버 문서에 U+FFFD 2개). 서로게이트를 피하도록 작성자를 고친 뒤에는 재현되지 않았다. ProseMirror는 서로게이트 쌍을 쪼개지 않지만, 서버는 쪼개는 편집(`agent-patch`의 `offset`, `Y.Text` 직접 편집)을 막지 않는다. 서버가 그런 update를 거부하거나, 네이티브 클라이언트가 서버 해시와 주기적으로 비교해 어긋나면 전체를 다시 동기화해야 한다.

### 5. 원문대로 왕복하지 않는 Markdown에서 서버의 두 사본이 갈라진다

`Y.Text` 전용 실행에서도 `bridge-invariant-violation`이 났다(3분 실행 기준 단어만 입력 2건, 기호 포함 입력 6건). 원본 테스트 문서를 한 글자만 고친 편집에서는 0건이었다. 기존 문법 한가운데에 글자가 끼어든 상태(예: `**bo어ld**`)를 서버의 파싱 → 직렬화가 원문대로 되돌리지 못한 것이다. 원본인 `Y.Text`와 디스크, 앱은 계속 일치했다. 달라지는 것은 웹 편집기용 fragment 사본이고, 그 상태에서 웹 편집기가 같은 블록을 고치면 2번과 3번의 경로로 이어진다. 웹 소스 모드와 에이전트 쓰기도 같은 상태를 만든다.

### 6. 편집기 구현에서 남은 문제

- 접기 삼각형을 탭하면 커서도 그 줄로 옮겨져 `<Accordion title=…>` 원문이 드러난다. 탭 처리와 커서 이동을 분리해야 한다.
- 한 번의 `processEditing`에 편집 여러 개가 묶이면 바인딩은 합쳐진 범위 전체를 지우고 다시 넣는다. 결과 텍스트는 맞지만, 그 범위에 들어온 원격 편집과 충돌할 여지가 커진다.
- 한글 조합 입력(marked text) 중에 원격 편집이 들어오는 경우는 검증하지 않았다. 모든 자동 입력은 `UITextInput.replace`로 넣었다.
- UITextView는 문단의 head indent를 레이아웃 조각의 원점에 반영한다. 장식은 조각 왼쪽 바깥(음수 x)에 그리고 `renderingSurfaceBounds`를 넓혀야 한다.

## Swift용 yrs 바인딩 선택

**자체 UniFFI 바인딩을 쓴다**(`yrs-ffi/src/lib.rs`, 222줄). 근거는 이렇다.

- 필요한 표면이 작다. `Y.Text` 편집, update 적용·인코딩, y-protocols 동기화 메시지면 충분했고, Hocuspocus 머리글·인증·keepalive·재연결은 Swift 315줄(`App/Sync/`)로 구현했다.
- crates.io의 `yrs` 0.28.0과 `uniffi` 0.32.2를 소스에서 빌드한다. 외부 바이너리를 내려받지 않는다.
- `OffsetKind::Utf16`으로 `NSString`과 오프셋 단위가 같다.

SwiftYrs는 `YXmlFragment`와 Hocuspocus 동기화 모듈까지 갖췄다. 하지만 2026-06에 만들어졌고 스타 0개, 관리자 1명이며, 기본 설치 경로가 릴리스에 올린 xcframework 바이너리를 받는 방식이다. `Y.Text` 전용 설계에서는 그 추가 기능이 필요 없다.

## 다음 설계에서 바꿀 지점

1. **서버: `Y.Text` 편집의 증분 처리.** 바뀐 블록만 다시 파싱해 fragment에 반영한다. 발견 1이 해결되기 전에는 네이티브 앱을 긴 문서에 쓸 수 없다.
2. **서버: fragment 경로의 유실과 이스케이프 누적.** 웹 편집기가 남아 있는 동안 필요하다(발견 2, 3).
3. **서로게이트 보호.** 서버가 쌍을 쪼개는 update를 거부하고, 네이티브 클라이언트는 해시를 비교해 어긋나면 다시 동기화한다(발견 4).
4. **편집기 자료구조.** 줄 레코드의 위치를 매번 옮기지 않도록 상대 오프셋을 쓰는 구조로 바꾼다. 레이아웃 9ms가 실기기에서 몇 ms인지 측정한다.
5. **파서 일치.** 스파이크 스캐너는 문법 일부만 인식한다. core의 TS 파서 결과를 기준으로 Swift 파서를 비교하는 테스트 체계가 다음 intent다.
6. **Mac 전략.** 스파이크는 UIKit만 검증했다. macOS를 AppKit으로 따로 둘지 Catalyst로 합칠지는 정하지 않았다.

## 실행 방법

```bash
rustup target add aarch64-apple-ios-sim
native/editor-spike/scripts/build-xcframework.sh
(cd native/editor-spike && xcodegen generate)
cargo test --manifest-path native/editor-spike/yrs-ffi/Cargo.toml
```

dev 서버는 임시 폴더를 내용 폴더로 써서 띄운다. 스파이크 문서와 5,000줄 문서는 생성 스크립트로 만든다.

```bash
bun native/editor-spike/scripts/gen-fixture.ts --out <content-dir>
OK_TEST_CONTENT_DIR=<content-dir> OK_TEST_GIT_ENABLED=1 bun run --cwd packages/app dev -- --port 5180
```

단위 테스트와 UI 테스트. UI 테스트는 `<prefix>-caret`, `-checkbox`, `-component`, `-scroll`, `-fold` 문서를 내용 폴더에 미리 복사해 두어야 한다.

```bash
TEST_RUNNER_SPIKE_UI_DOC_PREFIX=<prefix> xcodebuild test -project native/editor-spike/EditorSpike.xcodeproj \
  -scheme EditorSpike -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=26.5'
```

동시 편집과 서버 부하:

```bash
bun native/editor-spike/scripts/soak.ts --minutes 10 --no-fragment --content-dir <content-dir> --udid <simulator>
bun native/editor-spike/scripts/soak.ts --minutes 2 --insert-only --no-app --no-patch --content-dir <content-dir>
bun native/editor-spike/scripts/server-load.ts --doc <5,000줄 문서> --seconds 30
```

입력 성능은 앱을 `-docName <5,000줄 문서> -perfSeconds 60 -caretLine 2500`으로 실행한 뒤 앱 Documents의 `soak-keystroke.txt`에서 읽는다. Release 빌드는 `ARCHS=arm64 ONLY_ACTIVE_ARCH=YES`가 필요하다(xcframework가 arm64 시뮬레이터만 담는다).

## 한계

- 모든 측정은 Mac의 시뮬레이터에서 했다. 실제 iPad의 레이아웃 시간과 네트워크는 다르다.
- f 작성자는 y-prosemirror가 아니라 `Y.XmlText`를 직접 고친다. 발견 2의 비율은 실제 웹 편집의 비율이 아니다.
- 데이터베이스 뷰는 자리 표시 뷰다. 실제 데이터와 스크롤 성능은 검증하지 않았다.
- 서버 로그는 dev 서버를 다시 띄운 뒤부터 파일로 남겼다. 그 이전 실행의 bridge invariant 위반 건수는 셀 수 없었다.
- 스파이크 코드는 제품 코드가 아니다. 설계를 확인한 뒤 다시 작성한다.
