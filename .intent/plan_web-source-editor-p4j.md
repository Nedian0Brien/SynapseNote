---
title: P4j 기존 메모 앵커를 원문으로 변환
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4j 기존 메모 앵커를 원문으로 변환

core 파서의 원문 위치로 기존 화면의 문단·인라인 글을 원문에 대응시킨다. 저장된 quote의 exact/prefix/suffix로 찾고 변환한 앵커를 기기 로컬 저장소에 저장한다. 기존 앵커는 legacyAnchor로 보존해 기존 편집기도 사용한다. 찾지 못한 메모는 기존 데이터를 보존한다. 변환은 초기 로딩·메모 저장소 갱신에서만 수행하며 입력마다 전체 문서를 파싱하지 않는다.

## 검증

- 서식·링크·이스케이프·문단·인용·코드·반복 문구의 위치와 문맥 대응.
- 원래 앵커 보존, 재실행 멱등성, unmatched 보존.
- 로컬 저장·원문 표시·이동·새로고침과 기존 편집기의 보존 앵커 해석.

## 결과

- core 파서의 위치로 문단·제목·표 칸·인용·코드와 인라인 서식·링크·이스케이프를 대응시킨다. 기존 렌더러처럼 textblock 사이를 한 줄바꿈으로 연결해 quote 문맥을 해석한다.
- 변환한 source 앵커는 원문 범위의 exact/prefix/suffix와 줄 번호를 가진다. 원래 앵커는 legacyAnchor에 보존해 기존 편집기에서도 표시·이동할 수 있다. 본문·ID·시각과 원래 quote Markdown은 보존한다.
- 초기 로딩·저장소 갱신에서 변환·저장한다. 지연 저장 전에 새 저장소 상태가 들어오거나 편집기가 폐기되면 이전 변환 결과를 저장하지 않는다. 원문 입력은 표시 범위 매핑을 사용한다.
- 문구를 찾지 못한 메모는 기존 레코드를 보존하며 unmatched 목록으로 반환한다. 기존 source 앵커와 줄 번호만 가진 기존 source quote는 바꾸지 않는다.
- 변환 unit 4개, source 메모 DOM 4개, 기존 메모 해석 7개, 저장소 5개, MemoPanel DOM 12개와 core·app 타입 검사 통과. 변경 파일 검사 통과.
- 브라우저 기존 편집기에서 실제 굵은 글이 포함된 메모 생성→live 전환→source 앵커 저장·표시·원문 이동→새로고침 유지→기존 편집기 표시 복귀를 확인했다. legacyAnchor가 원래 앵커와 같고 pageerror가 없었다.
- 일반 HTML·중첩 위젯 좌표 연결·native highlight·밑줄·기타 P4·P5~P6는 남아 있다.
