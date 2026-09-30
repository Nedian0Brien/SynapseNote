---
title: P4i live 각주 삽입
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4i live 각주 삽입

core 원문 명령으로 참조·정의를 한 트랜잭션에 넣는다. 번호는 기존 helper를 공유하고 기존 정의 뒤에 새 정의를 모은다. 선택 막대는 한 줄의 선택을 각주 본문으로 이동하고 슬래시 메뉴는 빈 정의를 만든다. 기존 참조를 다시 각주로 감싸는 것을 막는다. 정의는 문서 전체를 기준으로 삽입한다.

## 검증

- 번호·정의 위치·원문 보존 fixture와 전체/부분 편집 경로 일치.
- 실제 CodeMirror 메뉴·선택 막대 삽입·한 번의 Undo.
- 브라우저 참조·정의 표시·편집·저장과 core·app 타입 검사.

중첩 위젯은 전체 문서 좌표 연결 뒤 각주 삽입을 연결한다. 기존 메모 앵커 변환·기타 P4·P5~P6는 계속 남아 있다.
