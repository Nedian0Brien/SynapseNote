---
title: P4i live 각주 삽입
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4i live 각주 삽입

core 원문 명령으로 참조·정의를 한 트랜잭션에 넣는다. 번호는 기존 helper를 공유하고 기존 정의 뒤에 새 정의를 모은다. 선택 막대는 한 문단 안의 선택을 각주 본문으로 이동하고 슬래시 메뉴는 빈 정의를 만든다. 기존 참조를 다시 각주로 감싸는 것을 막는다. 정의는 문서 전체를 기준으로 삽입한다.

## 검증

- 번호·정의 위치·원문 보존 fixture와 전체/부분 편집 경로 일치.
- 실제 CodeMirror 메뉴·선택 막대 삽입·한 번의 Undo.
- 브라우저 참조·정의 표시·편집·저장과 core·app 타입 검사.

중첩 위젯은 전체 문서 좌표 연결 뒤 각주 삽입을 연결한다. 기존 메모 앵커 변환·기타 P4·P5~P6는 계속 남아 있다.

## 결과

- core footnote 명령이 선택 또는 빈 커서에 참조와 정의를 함께 삽입한다. 기존 정의 뒤에 새 정의를 모으고 기존 번호 helper를 공유한다. 줄바꿈은 들여쓴 정의 본문으로 보존한다.
- 참조를 포함한 선택·여러 문단 선택을 거절한다. 번호·정의 위치는 문서 전체를 확인해야 하므로 window 경로는 이 명령에 전체 문서 처리를 사용한다.
- root 슬래시 Footnote와 선택 막대 Footnote가 연결됐으며 참조·정의는 한 번의 Undo로 되돌아간다.
- core edit 125개·window 3개·fixture 8개, 막대 DOM 4개·슬래시 DOM 10개, core·app 타입 검사 통과. 변경 파일 검사 통과.
- 브라우저에서 선택→각주 이동, 슬래시 두 번째 각주 삽입, 빈 정의 본문 편집, 새로고침 후 두 정의 유지·표시를 확인했다. pageerror 없음.
- 중첩 위젯 각주 삽입은 전체 문서 좌표 연결 뒤 처리한다. 기존 메모 앵커 변환·native highlight·밑줄·일반 HTML·기타 P4·P5~P6가 남아 있다.
