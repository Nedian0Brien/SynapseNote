---
title: P4h live 원문 메모 표시·이동
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4h live 원문 메모 표시·이동

선택 막대의 Memo 버튼은 기존 메모 패널을 원문 앵커와 함께 연다. CodeMirror는 원문 앵커에 표시를 그리고, 메모 카드를 누르면 원문 범위로 이동한다. 원격 트랜잭션은 표시 범위를 이동시키며 저장소 변경·편집기 폐기에서 구독을 정리한다.

## 검증

- source 앵커의 위치·문맥·중복 문구 해석, 원격 범위 이동과 이동 이벤트.
- 메모 작성 요청이 원문 앵커를 전달함.
- 브라우저 작성·저장·표시·카드 이동과 관련 app 타입 검사.

기존 wysiwyg 앵커 변환·native highlight 표시·각주 삽입은 다음 구간에서 처리한다. P4 전체 완료를 뜻하지 않는다.
