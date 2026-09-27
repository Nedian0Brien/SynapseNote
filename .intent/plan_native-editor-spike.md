---
title: 네이티브 연속 텍스트 편집기 스파이크
slug: native-editor-spike
stage: plan
status: accepted
intent: .intent/intent_native-editor-spike.md
spec: .intent/spec_native-editor-spike.md
date: 2026-09-28
---

# 네이티브 연속 텍스트 편집기 스파이크 — 구현 계획

## 바뀌는 파일

모두 새 파일이다. `packages/` 아래는 건드리지 않는다.

| 파일 | 무엇을 |
|---|---|
| `native/editor-spike/.gitignore` | `target/`, `*.xcframework`, `Generated/`, `*.xcodeproj`, `build/` |
| `native/editor-spike/yrs-ffi/Cargo.toml` | `yrs` 0.28, `uniffi` 0.32, `uniffi-bindgen` bin |
| `native/editor-spike/yrs-ffi/src/lib.rs` | `SpikeDoc`(Utf16 텍스트 편집, update 적용·인코딩, 원격 delta 콜백), `yrs::sync` 메시지 인코딩·수신 |
| `native/editor-spike/yrs-ffi/src/bin/uniffi-bindgen.rs` | 바인딩 생성기 |
| `native/editor-spike/scripts/build-xcframework.sh` | 시뮬레이터용 정적 라이브러리 → xcframework + Swift 바인딩 |
| `native/editor-spike/project.yml` | xcodegen: iPad 앱 `EditorSpike` + 단위 테스트 타깃 |
| `native/editor-spike/App/*.swift` | 앱 진입, 편집 화면 |
| `native/editor-spike/App/Sync/*.swift` | Hocuspocus 프레이밍·WebSocket 클라이언트, yrs 래퍼 |
| `native/editor-spike/App/Editor/*.swift` | 텍스트 바인딩, 스캐너, 프리뷰, 컴포넌트 조각, 접기 |
| `native/editor-spike/App/Soak/*.swift` | 자동 입력 모드, 해시 파일 기록 |
| `native/editor-spike/Tests/*.swift` | 프레이밍, 바인딩, 스캐너 단위 테스트 |
| `native/editor-spike/scripts/soak.ts` | XmlFragment 편집자, agent-patch 반복, 해시 비교 |
| `native/editor-spike/scripts/gen-fixture.ts` | 스파이크 문서와 5,000줄 문서 생성 |
| `native/editor-spike/REPORT.md` | 결과 보고서와 실행 방법 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

### 단계 A — 동기화 (R1, R2). 통과해야 단계 B로 간다

0. 도구: `rustup target add aarch64-apple-ios-sim`. 확인: `rustup target list --installed`.
1. `yrs-ffi` 작성. `Options { offset_kind: Utf16 }`. y-protocols 메시지는 `yrs::sync`로
   인코딩·수신하고, Swift는 Hocuspocus 접두어(문서 이름 varString + 타입 varUint)와
   Auth 메시지만 만든다. 확인: `cargo test`(한글·이모지 오프셋, 두 문서 간 update 교환).
2. `build-xcframework.sh`. 확인: xcframework와 `Generated/yrs_ffi.swift` 생성.
3. 앱 골격 + Hocuspocus 클라이언트 + 평범한 TextKit 2 `UITextView` 바인딩.
   로컬 편집은 `NSTextStorageDelegate`에서 `deleted = editedRange.length - delta`로
   remove + insert. 원격 delta는 에코 방지 플래그 아래 적용하고 선택 범위를 옮긴다.
   Ping에는 Pong. 확인: 시뮬레이터에서 웹 편집기와 양방향 편집이 보인다.
4. 단위 테스트(프레이밍, 바인딩의 편집→delta 변환). 확인: `xcodebuild test` 통과.
5. 자동 입력 모드: 실행 인자 `-soak`로 켠다. 일반 문장 외에 `*`, `**`, `**bo`, `- `,
   `#`, `[ ]`, `[x`처럼 입력 중간의 깨진 Markdown 상태를 섞어 넣고 지운다. 몇 초마다
   `Y.Text`의 SHA-256을 앱 Documents의 `soak-hash.txt`에 쓴다.
6. `soak.ts`: dev 서버를 `OK_TEST_CONTENT_DIR=<임시폴더> OK_TEST_GIT_ENABLED=1`로 띄운
   상태에서 XmlFragment 문단 삽입자와 `agent-patch` 반복을 돌리고, 각자 넣은 표식이
   다른 클라이언트에 보이기까지의 지연을 잰다. 끝나면 15초 기다린 뒤 디스크 파일,
   새로 붙은 클라이언트의 `Y.Text`, `xcrun simctl get_app_container booted <id> data`로
   읽은 앱 해시를 비교하고 서버 로그에서 invariant·conflict를 찾는다.
7. **게이트**: 10분 soak에서 세 해시 일치, 로그 깨끗함, 지연 p95 < 1s. 실패하면
   단계 B로 가지 않고 원인을 조사해 REPORT.md에 적는다.

### 단계 B — 편집기 (R3–R6)

8. 줄 단위 스캐너와 프리뷰 속성(커서 문단만 기호 표시). 확인: 스캐너 단위 테스트, 스크린샷.
9. 체크박스 탭 → 한 글자 교체. 확인: 서버 `Y.Text` diff가 한 글자.
10. `<DatabaseView` 사용자 레이아웃 조각 + 자리 표시 뷰 + 선택 스냅. 확인: 스크린샷, 바이트 비교.
11. `shouldEnumerate` 접기. 확인: 접은 채 soak 편집자가 본문을 바꾼 뒤 펼쳐 해시 비교.
12. 5,000줄 문서로 키 입력 측정(p50·p95·최대). 확인: 측정 로그.
13. REPORT.md 작성.

각 단계가 끝나면 커밋한다(`feat:`/`test:`/`docs:` 태그).

## 가장 위험한 단계

3번 텍스트 바인딩. 로컬 편집과 원격 delta가 겹치면 오프셋이 어긋나거나 에코가 돌아
문서가 부풀 수 있고, 이것이 서버 원본까지 오염시킨다. 대응: soak은 항상 임시 폴더에서만
돌리고, 이상이 보이면 앱을 멈추고 임시 폴더를 버린다. 코드는 `native/` 아래에만 있으므로
되돌리기는 디렉터리 삭제로 끝난다.

## 검증

```
rustup target list --installed | grep ios-sim
cargo test --manifest-path native/editor-spike/yrs-ffi/Cargo.toml
native/editor-spike/scripts/build-xcframework.sh
(cd native/editor-spike && xcodegen generate)
xcodebuild test -project native/editor-spike/EditorSpike.xcodeproj -scheme EditorSpike \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=27.0'
bun native/editor-spike/scripts/soak.ts --minutes 10
git diff main --stat -- packages
```

화면 확인(시뮬레이터 스크린샷): 라이브 프리뷰에서 커서 문단만 기호 표시, 체크박스 탭,
`DatabaseView` 자리 표시 뷰와 커서 건너뛰기, accordion 접기·펼치기.
