---
title: P3e 이미지와 파일 임베드 위젯
slug: web-source-editor
stage: plan
status: implemented
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

## 결과 (2026-09-29)

- Markdown·위키·MDX 미디어의 `src`와 대체 텍스트·이름 범위를 core 파서 기준으로 구해 해당 범위만 바꾼다.
- 기존 Image·File·Embed 렌더러를 `live` 블록·인라인 위젯에서 쓴다. 문서 상대 경로와 위키 자산 경로를 해석하고 URL을 렌더링 전에 검사한다.
- core 관련 테스트 79개, app live DOM 테스트 121개, 미디어 경로 테스트가 통과했다. core·app 타입 검사와 Biome 검사도 통과했다.
- 브라우저에서 네 이미지가 같은 공개 자산으로 렌더링됐고, Markdown·위키·MDX 속성을 편집한 뒤 새로고침해 원문 유지를 확인했다. 위험한 URL은 iframe을 만들지 않았고 파일 링크를 `#`으로 제한했다.
- 다음 P3 대상: 일반 MDX 컴포넌트, 인라인 데이터베이스, 들여쓴 코드, 레거시 HTML details, 참조 이미지와 명시적 PDF 뷰어.
