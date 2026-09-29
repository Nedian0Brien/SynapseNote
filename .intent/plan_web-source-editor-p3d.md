---
title: P3d 콜아웃과 아코디언 위젯
slug: web-source-editor
stage: plan
status: active
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
