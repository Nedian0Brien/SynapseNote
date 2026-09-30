---
title: P4h live 원문 메모 표시·이동
slug: web-source-editor
stage: plan
status: implemented
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

## 결과

- root live 선택 막대의 Memo 버튼이 selectionSnapshotFromSource를 기존 작성 패널로 전달한다. SourceEditor의 live·source 모드 모두 원문 메모 표시·이동 구독을 갖는다.
- 원문 앵커를 정확 위치와 prefix/suffix 문맥으로 찾고, 기존 표시 범위를 트랜잭션으로 이동시킨다. 저장소 갱신 때 다시 해석하며 입력마다 로컬 저장소를 쓰지 않는다.
- 원문 메모 카드 이동 버튼을 활성화했다. 표시 클릭은 기존 카드 reveal 이벤트를 보낸다. CSS도 source 화면에 적용했다.
- 메모 DOM 2개, 선택 막대 DOM 3개, MemoPanel DOM 12개, app 타입 검사·변경 파일 검사 통과.
- 브라우저에서 선택→Memo→작성·저장→표시, 카드 이동 후 word 선택, 새로고침 후 표시 복원을 확인했다. pageerror 없음. 메모는 기기 로컬 저장소에 있고 문서 원문은 바뀌지 않는다.
- 기존 wysiwyg 앵커 변환·중첩 위젯의 원문 좌표 연결·native highlight와 각주 삽입은 계속 남아 있다. R5 전체 완료를 뜻하지 않는다.
