---
title: 네이티브 연속 텍스트 편집기 스파이크
slug: native-editor-spike
stage: spec
status: accepted
intent: .intent/intent_native-editor-spike.md
date: 2026-09-28
---

# 네이티브 연속 텍스트 편집기 스파이크 — 명세

## 요구사항

- [ ] R1 동기화: iPadOS 시뮬레이터 앱이 로컬 dev 서버 `/collab`에 Hocuspocus 프로토콜로
      붙어 문서 하나의 `Y.Text('source')`를 받고, 로컬 편집을 update로 보낸다.
- [ ] R2 동시 편집: 앱 자동 입력 + 웹 편집기 경로(XmlFragment 편집) + `agent-patch`를
      10분 동시에 돌린 뒤, 디스크 파일·서버 `Y.Text`·앱 텍스트의 SHA-256이 같다.
      서버 로그에 bridge invariant 위반과 conflict 상태가 없다. 각 쪽 변경이 다른 쪽에
      1초 안에 반영된다(soak 스크립트가 지연을 기록).
- [ ] R3 라이브 프리뷰: 제목·굵게·기울임·인라인 코드·링크·목록·체크박스·인용·코드 블록이
      서식으로 보이고, 커서가 있는 문단에서만 문법 기호가 보인다. 체크박스 탭은
      `Y.Text`에서 `[ ]`↔`[x]` 한 글자만 바꾼다.
- [ ] R4 네이티브 뷰: `<DatabaseView … />` 한 줄이 자리 표시 네이티브 뷰(가로 스크롤
      목록)로 그려진다. 커서는 그 줄을 한 단위로 건너뛴다. 주변 편집 후에도 그 줄의
      바이트가 같다. 뷰의 가로 스크롤이 텍스트 뷰 세로 스크롤을 가로채지 않는다.
- [ ] R5 접기: `<Accordion …>` 줄의 표시를 탭하면 `</Accordion>`까지의 본문이 사라지고
      다시 탭하면 돌아온다. `Y.Text`는 바뀌지 않는다. 접힌 동안 원격에서 본문이
      바뀌어도 펼쳤을 때 서버 텍스트와 같다.
- [ ] R6 성능: 5,000줄 문서에서 키 입력 1회 처리(텍스트 저장소 편집 → yrs 트랜잭션 →
      프리뷰 속성 갱신 → 레이아웃)의 p95가 16ms 이하. p50·p95·최대값을 기록한다.
- [ ] R7 보고서 `native/editor-spike/REPORT.md`: R1–R6 성립 여부와 측정값, 바인딩
      선택과 근거, 다음 설계에서 바꿀 지점.
- [ ] R8 서버·웹 앱·core 코드는 바뀌지 않는다(`git diff main -- packages` 비어 있음).

## 설계

**위치.** `native/editor-spike/` (bun 워크스페이스 `packages/*` 밖).

1. **`yrs-ffi/` — Rust 크레이트.** crates.io의 `yrs` 0.28과 `uniffi` 0.32로 필요한
   표면만 묶는다: 문서 생성(`OffsetKind::Utf16` — JS 문자열과 `NSString`이 같은
   UTF-16 오프셋을 쓴다), `Y.Text('source')` 읽기·삽입·삭제, state vector,
   update 인코딩·적용, 원격 변경의 delta 콜백. 스크립트가 iOS 시뮬레이터용
   xcframework와 Swift 바인딩을 만든다(생성물은 커밋하지 않는다).
2. **Hocuspocus 클라이언트(Swift).** `URLSessionWebSocketTask`로 `ws://localhost:<port>/collab`.
   서버와 같은 `@hocuspocus/*` 4.0.0-rc.1 프로토콜을 직접 구현한다: 모든 메시지 앞에
   문서 이름(varString)과 타입(varUint) — Sync 0, Awareness 1, Auth 2, SyncStatus 8,
   Ping 9/Pong 10. 연결 직후 Auth(토큰 `{}` — 서버는 principal 없는 토큰을
   서비스 작성자로 받는다, `server-factory.ts:1670`), 이어서 SyncStep1. y-protocols의
   SyncStep1/2·Update는 lib0 varint 인코딩으로 Swift에서 만든다. 문서 이름은 확장자를
   뺀 경로다(`filePathToDocName`, `app/src/lib/doc-hash.ts:82`).
3. **텍스트 바인딩.** TextKit 2 `UITextView`의 텍스트 저장소가 곧 Markdown 원문이다.
   로컬 편집은 `NSTextStorageDelegate`의 edited range로 yrs delete+insert를 만들고,
   원격 delta는 편집 중 플래그를 세운 채 저장소에 반영하며 선택 범위를 delta로 옮긴다.
4. **프리뷰.** 줄 단위 스캐너가 스파이크 범위의 문법만 인식해 블록·인라인 범위를 낸다.
   서식은 속성으로 입히고, 커서 밖 문법 기호는 폭이 거의 0인 글꼴과 투명색으로
   접는다. 편집된 문단과 커서가 드나든 문단만 다시 칠한다.
5. **네이티브 뷰.** `NSTextLayoutManagerDelegate`가 `<DatabaseView` 문단에 사용자
   `NSTextLayoutFragment`를 돌려준다. 이 조각은 글자를 그리지 않고 뷰 높이를 보고하며,
   텍스트 뷰가 조각 위치에 UIView를 올린다. 선택이 그 문단 안으로 들어오면 가장자리로 옮긴다.
6. **접기.** `NSTextContentManagerDelegate.textContentManager(_:shouldEnumerate:options:)`가
   접힌 범위의 문단을 건너뛴다(WWDC21 "Meet TextKit 2"의 접기 예시와 같은 방법).
   접힘 상태는 여는 줄의 위치로 들고, 원격 delta마다 옮긴다.
7. **측정.** 앱이 `os_signpost`와 자체 타이머로 R6 구간을 잰다. 5,000줄 문서는 생성
   스크립트로 만든다.
8. **soak 스크립트(Bun, TS).** 저장소의 `yjs`·`@hocuspocus/provider`를 써서 (a) 문단
   안에 글자를 넣는 XmlFragment 편집자, (b) `/api/agent-patch` 반복 호출, (c) 끝난 뒤
   디스크·서버 `Y.Text` 해시를 낸다. dev 서버는 `OK_TEST_CONTENT_DIR`로 임시 폴더를 쓴다.

## 버린 대안

- **SwiftYrs 채택.** 필요한 기능은 다 있지만 2026-06 생성·관리자 1명이고, 기본 경로가
  릴리스에 올린 바이너리 xcframework를 받는 방식이다. 소스를 참고만 하고 직접 묶는다.
- **yswift.** Swift 계층에 `XmlFragment`가 없고 2024-07 이후 커밋이 없다. `Y.Text`만
  쓰면 문제는 없지만 유지 상태 때문에 제외.
- **표시용 문자열 치환(`textContentStorage(_:textParagraphWith:)`로 기호를 뺀 문단).**
  표시 길이와 원문 길이가 달라져 커서·선택 위치 대응을 직접 해야 한다. 속성 접기가
  실패할 때만 다시 본다.
- **WKWebView 에디터.** 사용자가 완전 네이티브로 결정했다.

## 함정

- yrs 기본 오프셋은 UTF-8 바이트다. Utf16을 지정하지 않으면 한글·이모지에서 위치가 어긋난다.
- 서버의 `Y.Text`→fragment 반영(관찰자 B)과 저장 debounce(2s, 최대 10s) 때문에 디스크
  비교는 soak 종료 후 최소 10초 기다린 뒤 한다.
- 원격 delta를 저장소에 넣을 때 로컬 편집 경로가 다시 yrs로 보내면 무한 반복된다.
- Hocuspocus 4 rc는 Ping에 Pong을 보내지 않으면 연결을 끊을 수 있다.
- iOS 시뮬레이터는 Mac의 `localhost`에 붙는다. dev 서버 Host 허용 목록은 루프백만 받는다.
- `.ok/` 아래 파일과 frontmatter도 `Y.Text` 안에 있다. 스캐너는 frontmatter를 건너뛴다.

## 완료 기준

```
cargo test --manifest-path native/editor-spike/yrs-ffi/Cargo.toml   # 통과
native/editor-spike/scripts/build-xcframework.sh                     # xcframework 생성
xcodebuild test -project native/editor-spike/EditorSpike.xcodeproj -scheme EditorSpike \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5)'    # 단위 테스트 통과
bun native/editor-spike/scripts/soak.ts --minutes 10                  # 세 해시 일치, 지연 p95 < 1s
git diff main --stat -- packages                                      # 출력 없음
```

시뮬레이터 스크린샷으로 R3–R5를 확인하고, REPORT.md에 R6 측정값을 적는다.
