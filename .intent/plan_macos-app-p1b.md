---
title: macOS 앱 첫 판 — P1b 기본 블록 표시
slug: macos-app
stage: plan
status: accepted
intent: .intent/intent_macos-app.md
spec: .intent/spec_macos-app.md
date: 2026-10-16
---

# P1b — 목록 기호·체크박스·인용 막대·수평선, 링크 이동, 칩 (R18)

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `native/macOS/App/Editor/Decorations.swift` (새) | 문단 장식 종류(글머리표, 번호, 체크박스, 인용 막대, 수평선)와 `NSAttributedString.Key` |
| `native/macOS/App/Editor/DecoratedLayoutFragment.swift` (새) | `NSTextLayoutFragment` 하위 클래스. 문단 첫 글자의 장식을 들여쓰기 영역에 그리고, 체크박스 위치를 클릭 판정에 돌려준다. `NSTextLayoutManagerDelegate`로 끼운다 |
| `native/macOS/App/Editor/LiveStyler.swift` | 목록 항목: 들여쓰기 공백과 기호 위젯을 숨기고 깊이만큼 문단 들여쓰기, 장식 속성. 인용: 막대 장식과 들여쓰기. 수평선: 원문을 숨기고 선 장식. 링크·위키 링크: 이동할 대상 속성. 태그: 칩 배경. 각주 참조: `[^`·`]`를 숨기고 위첨자 |
| `native/macOS/App/Editor/SourceTextView.swift` | 체크박스 클릭 → 원문 `[ ]`↔`[x]` 한 글자 교체(웹 live와 같은 방식). ⌘클릭 → 링크 열기. 목록 들여쓰기·기호·수평선 안에 커서가 놓이면 내용 시작으로 옮긴다 |
| `native/macOS/App/Editor/EditorView.swift` | 레이아웃 관리자 delegate 연결 |
| `native/macOS/App/Editor/DocumentController.swift`, `AppModel.swift`, `Views/DocumentPane.swift` | 문서 링크 이동: 위키 링크·상대 `.md` 링크를 문서 이름으로 풀어 사이드바 선택을 바꾼다 |
| `native/SynapseKit/Sources/ServerAPI/ServerClient.swift` | `GET /api/pages`(문서 이름 목록)로 위키 링크 대상을 푼다 |
| `.intent/spec_macos-app.md` | 동등성 목록의 P1 행 상태 갱신, 체크박스 행은 "웹 live처럼 원문 한 글자 교체"로 고친다 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 장식 그리기(글머리표·번호·체크박스·인용 막대·수평선)와 목록 들여쓰기 — 시험 문서에서 직접 본다. 들여쓴 하위 목록, 줄이 넘치는 긴 항목, 번호 목록.
2. 커서 위치 보정 — 목록 줄 맨 앞을 클릭하면 커서가 내용 시작에 온다. Backspace·Enter가 SPEC대로 동작한다(edit fixture는 이미 통과).
3. 체크박스 클릭 — 원문 `- [ ]`가 `- [x]`로 바뀌고 서버 파일과 웹에 반영된다.
4. ⌘클릭 링크 — 외부 URL은 기본 브라우저, 위키 링크·`.md` 링크는 앱 안에서 그 문서를 연다.
5. 태그·각주 칩.
6. R3 재측정, 한글 IME 조합을 화면에서 입력해 확인(화면 제어 승인이 필요하다), 설치.

## 가장 위험한 단계

1번. AppKit의 TextKit 2가 문단 들여쓰기를 프래그먼트 원점에 반영하는 방식이 UIKit(스파이크)과 다를 수 있다. 장식이 글자와 겹치거나 잘리면 프래그먼트
`renderingSurfaceBounds`를 들여쓰기 영역까지 넓히고 좌표를 다시 잡는다. 되돌림: 장식은 그리기와 속성만 바꾸고 원문·동기화는 건드리지 않는다.

## 검증

```
swift test --package-path native/SynapseKit
(cd native/macOS && xcodegen generate) && xcodebuild -project native/macOS/SynapseNote.xcodeproj -scheme SynapseNote -configuration Release build
SynapseNote -perfSeconds 60 -caretLine 2500   # R3
```

화면: `sample`·`notes/daily/2026-10-16`·`projects/memo`에서 목록·체크박스·인용·수평선·링크·태그를 웹 live와 나란히 비교한다.

## 결과 (2026-10-16)

- 화면에서 확인한 것(실제 마우스·특수 키 입력):
  - 글머리표·하위 목록 들여쓰기·긴 항목 줄바꿈 정렬, 번호 목록, 체크박스, 인용 막대, 수평선, 링크 색, 각주 위첨자.
  - 체크박스 클릭 → 원문 `- [ ]`가 `- [x]`로 바뀌어 서버 파일에 들어간다. 편집 메뉴 실행 취소로 되돌아간다(다른 쪽 편집은 되돌리지 않는다).
  - ⌘클릭: `[메모](projects/memo.md)` → `projects/memo`, `[[sample]]` → `sample`이 열리고 사이드바도 그 문서를 연다.
  - 목록 끝에서 Enter → 새 글머리표 항목, 빈 항목에서 Backspace → SPEC대로 문단으로 바뀐다.
- 확인하지 못한 것:
  - 한글 IME 조합: 자동 입력 도구가 한글 입력 소스에서 글자 키를 모두 같은 키(ㅁ)로 보낸다. ⌘Z도 ⌘A로 들어갔다. 서식 단축키·찾기 막대도 같은 이유로 직접 누르지 못했다.
  - `#태그`처럼 한글로 된 태그는 core 파서가 태그로 읽지 않는다(`#tag`는 읽는다). 웹 live도 같다.
- 성능(R3): 장식을 넣은 뒤 p95 16.67·16.86ms로 기준(16ms)을 넘었다. 단계별로 나누어 재니 TextKit의 편집 처리(2.4ms)와 다시 칠하기(1.2–2.1ms)가 컸다.
  그래서 속성을 따로 만든 뒤 바뀐 문단만 저장소에 쓰도록 바꿨다(`LiveStyler.restyle`). 바꾼 뒤 잰 값은 P1a 빌드도 같은 시점에 p95 48.89ms가 나와
  기기 상태가 달라진 것으로 보여 판단에 쓰지 않았다. 그 직후 화면 캡처도 실패해 이 변경의 화면 확인을 못 했다. 다시 재고 확인한다.
