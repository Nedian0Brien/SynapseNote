---
title: P3l PDFium 워커 URL과 PDF 내용 검증
slug: web-source-editor
stage: plan
status: implemented
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

## 결과

- PDFium Blob 워커에 WASM의 절대 URL을 전달한다. 변경 전 브라우저 워커는 상대 URL 파싱 실패 `wasmError`를 보냈고, 변경 후 `ready`·`result`를 보냈다.
- 기존 `real-draft.pdf` QA 파일은 헤더와 0 바이트 패딩만 가진 파일로 xref·트레일러가 없어 `pdfinfo`가 읽지 못했다. 별도로 만든 유효한 1페이지 PDF는 `pdfinfo` 검사를 통과했다.
- 브라우저 확인 문서 `http://localhost:5183/#/notes/p3l-valid-pdf-review-1790696300000`에서 `live`와 기존 시각 편집기 모두 PDF 1페이지를 렌더링했다. `live` 화면에는 실제 페이지 이미지가 표시됐고 스크린샷에서도 `SynapseNote PDF QA` 텍스트를 확인했다.
- PDF DOM 테스트 11개, app 타입 검사와 변경 파일 Biome 검사가 통과했다.
