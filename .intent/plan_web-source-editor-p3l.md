---
title: P3l PDFium 워커 URL과 PDF 내용 검증
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3l PDFium 워커 URL과 PDF 내용 검증

`<Pdf>` 위젯이 실제 PDF 페이지를 보여 주는지 검증한다. 현재 PDFium Blob 워커는 Vite가 준 루트 상대 WASM 경로를 `fetch`할 때 URL을 해석하지 못하고 `wasmError`를 보낸다. 엔진 생성 전에 WASM 경로를 절대 URL로 바꾼다.

## 검증

- `pdfinfo`를 통과한 실제 PDF를 임시 콘텐츠 폴더에 두고 브라우저에서 페이지 내용·캔버스·오류 상태를 확인한다.
- 기존 PDF 컴포넌트 테스트와 app 타입 검사, 변경 파일 Biome 검사를 실행한다.
- 이전 P3f QA 파일은 xref·트레일러가 없는 잘못된 PDF였음을 인계 문서에 기록한다.
