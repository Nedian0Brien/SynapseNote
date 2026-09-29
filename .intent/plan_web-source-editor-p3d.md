---
title: P3d 콜아웃과 아코디언 위젯
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P3d 콜아웃과 아코디언 위젯

기존 React 콜아웃·아코디언 렌더러를 `live` 블록 위젯에서 사용한다. 내부 본문은 같은 live 편집 규칙을 쓰고, 원문에 해당하는 범위만 바꾼다.

## 구현

1. core 파서가 인식하는 GFM `> [!TYPE]`, `<Callout>` 및 `<Accordion>`의 제목·종류·본문 원문 범위를 구한다.
2. GFM 인용 접두어를 숨긴 본문 위치를 원문 오프셋으로 매핑한다. 삽입·삭제·줄바꿈은 해당 줄의 `>` 기호만 다룬다.
3. 기존 콜아웃·아코디언 컴포넌트를 위젯에 렌더링하고 내부에 live 편집기를 넣는다. 제목·종류 수정은 해당 속성 범위만 바꾼다.
4. 원문 충실도 fixture, DOM 테스트, 실제 앱 편집·새로고침으로 확인한다.

## 검증

- core 위젯·fixture 테스트와 app live DOM 테스트, 두 패키지 타입 검사, 변경 파일 Biome 검사를 실행한다.
- GFM과 MDX 양쪽에서 인접 원문이 유지되는지 확인한다.

## 결과 (2026-09-29)

- GFM `> [!TYPE]`과 MDX `<Callout>`·`<Accordion>`의 제목·종류·본문 범위를 core 파서로 찾는다.
- GFM 본문의 `>` 접두어를 건너뛰는 오프셋 매핑으로 입력·줄바꿈·줄 합치기를 원문에 적용한다. 속성은 해당 값 범위만 수정한다.
- 기존 Callout·Accordion 컴포넌트의 제목 자리에 입력 칸을 두고, 본문 안에 작은 live 편집기를 렌더링한다. 본문 수정 중에는 위젯 DOM을 유지한다.
- core 관련 테스트 66개, app live DOM 테스트 118개와 기존 컴포넌트 테스트 10개 통과. core·app 타입 검사와 Biome 검사 통과.
- 브라우저에서 세 위젯의 표시와 제목·종류·본문 수정, 새로고침 후 원문 유지를 확인했다.
- 남은 P3 대상: 이미지·파일 임베드, 일반 MDX 컴포넌트, 인라인 데이터베이스, 들여쓴 코드, 레거시 HTML details.
