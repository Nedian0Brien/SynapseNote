---
title: P3m 수평선·각주·주석 위젯
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3m 수평선·각주·주석 위젯

core 파서가 이미 구분하는 수평선, 각주 참조·정의, 인라인 주석을 `live` 위젯으로 그린다. 각주 본문과 주석 본문은 원문 구분자를 숨긴 채 편집하고 해당 원문 범위만 바꾼다. 블록 주석 생성 단계에서 누락된 mdast 위치를 보존해 위젯 범위를 만들 수 있게 한다.

## 검증

- 수평선·각주·인라인/블록 주석 fixture와 원문 범위 편집 사례를 확인한다.
- 앱 DOM에서 기호가 숨겨지고 본문 편집이 원문에 반영되는지 확인한다.
- core·app 타입 검사, 변경 파일 Biome 검사, 실제 브라우저 화면을 확인한다.

## 결과

- 블록 주석의 mdast 위치를 보존해 원문 범위가 만들어지게 했다. 수평선, 각주 참조·정의, 인라인·블록 주석을 `live` 위젯으로 그린다.
- 각주 정의는 `[^id]:`와 이어지는 줄 들여쓰기를 감춘 채 본문을 편집한다. 주석은 구분자 안의 본문만 고친다.
- 브라우저 확인 문서 `http://localhost:5183/#/notes/p3m-block-review-1790696400000`에서 각 위젯의 표시, 각주·주석 편집, 디스크 저장과 새로고침을 확인했다. 페이지 오류는 없었다.
- core layout·fixture·widget 테스트 112개, 앱 live DOM 128개, core·app 타입 검사가 통과했다.
- 일반 raw HTML(`div`, `script` 등)은 현재 core 파서가 문단 텍스트로 취급한다. SPEC의 HTML 블록 요구와의 차이는 다음 P3 점검에서 해결한다.
