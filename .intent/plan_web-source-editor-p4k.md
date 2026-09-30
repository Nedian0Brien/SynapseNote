---
title: P4k 중첩 편집기의 원문 좌표·메모 연결
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4k 중첩 편집기의 원문 좌표·메모 연결

표 칸·콜아웃·아코디언·Tabs/Tab·MDX 본문·각주·주석 본문의 로컬 CodeMirror 위치를 부모와 문서 전체 원문 위치로 대응시킨다. 변환은 현재 core 위젯 모델의 범위·경계 배열을 사용한다. 중첩 메모 생성·표시·이동과 선택 문맥 전달에 적용하고, 비활성 탭·접힌 컨테이너는 메모 이동 때 표시한다.

## 검증

- 여러 깊이의 위치 합성, GFM 인용 접두사와 원격 이동 후 좌표.
- 표·컨테이너·탭의 메모 생성·표시·이동, 편집기 폐기 시 등록 해제.
- 브라우저 메모 작성·저장·비활성 탭 이동 및 관련 타입 검사.

중첩 각주 삽입은 문서 전체 정의를 본문에서도 해석하도록 연결하는 후속 구간에 포함한다. 일반 HTML·native highlight·기타 P4·P5~P6는 남아 있다.
