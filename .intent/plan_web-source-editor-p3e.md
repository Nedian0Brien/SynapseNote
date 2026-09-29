---
title: P3e 이미지와 파일 임베드 위젯
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P3e 이미지와 파일 임베드 위젯

Markdown 이미지, 위키 이미지·파일 임베드, MDX `img`·`File`·`Embed`를 `live`에서 원문 기호 없이 그린다.

## 구현

1. core 파서가 인식한 미디어 노드에서 `src`·대체 텍스트·표시 이름의 원문 범위를 구한다. 속성 변경은 그 범위만 바꾼다.
2. 기존 Image·File·Embed 렌더러를 사용한다. 앱의 URL 안전 검사, 문서 상대 경로 해석, 위키 자산 경로 해석을 같은 순서로 적용한다.
3. 블록 위젯은 속성 입력과 미리보기를, 인라인 위젯은 미리보기와 편집 진입점을 제공한다.
4. core fixture, DOM 테스트, 실제 앱에서 렌더링·수정·저장을 확인한다.

## 검증

- core 위젯·레이아웃·fixture 테스트와 app live DOM 테스트를 실행한다.
- core·app 타입 검사, 변경 파일 Biome 검사, 브라우저 편집·새로고침을 확인한다.
