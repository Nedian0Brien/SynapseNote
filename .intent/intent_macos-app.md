---
title: macOS 앱 첫 판 — 서버 원본 위의 문서 편집과 에이전트
slug: macos-app
stage: intent
status: accepted
author: Dennis Park
date: 2026-10-16
---

# macOS 앱 첫 판 — 서버 원본 위의 문서 편집과 에이전트

## 문제

SynapseNote를 Craft 수준의 Apple 네이티브 앱으로 옮긴다. macOS 앱을 먼저 만들고 iPadOS·iOS로 넓힌다.
두 가지를 함께 만족해야 한다.

1. 서버가 문서의 원본이고, 맥·아이패드·아이폰에서 같은 내용을 본다.
2. Claude Code·Codex 에이전트가 문서를 고치고, 앱에서 에이전트에게 도움을 받는다.

지금은 둘 다 네이티브 앱에서 되지 않는다.

- 네이티브 코드는 스파이크(`codex/native-editor-spike`)뿐이다. UIKit iOS 앱이고, 문서 하나만 열고,
  기기에 저장하지 않는다. 스파이크 코드는 제품 코드로 그대로 쓰지 않기로 했다.
- 에이전트 채팅은 Electron 메인 프로세스(`packages/desktop/src/main/cli-chat-command.ts`)에서만 돈다.
  서버에는 에이전트 대화를 실행하고 스트리밍하는 API가 없다(handoff API는 외부 앱을 여는 것뿐이다).
- 서버는 재시작하면 Markdown에서 문서를 다시 만들고 lineage epoch를 새로 발급한다. 그래서 재시작 전후의
  오프라인 편집은 합쳐지지 못하고 버려진다(웹 클라이언트도 같다).

## 원하는 결과

1. 맥에 설치하는 macOS 앱이 있다. SwiftUI 앱 구조에 AppKit `NSTextView`(TextKit 2) 편집기다. Catalyst가 아니다.
2. 사이드바에 서버의 폴더·문서 목록이 보이고, 문서를 골라 열고, 새 문서를 만든다. 다른 기기나 에이전트가
   만든 문서가 목록에 나타난다.
3. 편집기는 core `SPEC.md`(web-source-editor)를 따른다. 편집 화면에서는 커서가 있는 문단·표에서도 기호를
   숨기고, 원문은 원문 보기에서만 보인다. core `fixtures/*.json`을 같은 결과로 통과한다.
4. 입력은 `Y.Text('source')`로 서버에 가고, 다른 기기·웹·에이전트의 편집이 앱에 실시간으로 보인다.
5. 앱의 채팅 패널에서 서버에서 도는 Claude Code·Codex에게 현재 문서를 문맥으로 요청한다. 응답이 스트리밍되고,
   중단할 수 있고, 이전 대화를 이어 간다. 에이전트가 문서를 고치면 편집기에 바로 보인다.
6. 서버가 재시작해도 문서의 CRDT 상태가 이어진다. 한 번 연 문서는 서버 없이 바로 열리고, 오프라인 편집은
   다시 연결되면 CRDT로 합쳐진다. 편집이 사라지지 않는다.
7. 오프라인일 때 서버가 필요한 기능(새 문서, 에이전트)은 쓸 수 없다고 화면에 표시한다.
8. 메뉴 막대와 단축키(새 문서, 실행 취소·다시 실행, 찾기, 원문 보기, 채팅 패널)가 macOS 기본 동작을 따른다.

## 영향 범위

- 새 macOS 앱과, iOS가 함께 쓸 Swift·Rust 공유 모듈(yrs 바인딩, 동기화, 기기 저장, core 실행).
- 서버(`packages/server`): 에이전트 실행·스트리밍 API, 재시작을 넘는 CRDT 상태 보존. 문서 목록·생성 API와
  `__system__` 변경 알림, 현재 문서 채널은 있는 것을 쓴다.
- core(`packages/core`): web-source-editor의 편집 규칙과 파서를 앱에서 실행할 번들.
- 웹 앱·Electron 앱: 동작을 바꾸지 않는다. Electron 채팅을 서버 API로 옮길지는 spec에서 정한다.
- 사용자: 운영자 한 명. 결정 권한: Dennis Park.

## 제약

- 이 브랜치는 `codex/web-source-editor` 위에 있다. 그 브랜치가 main에 들어간 뒤 main 위로 옮긴다.
- 동기화는 `Y.Text('source')`만 쓴다. Swift 쪽은 yrs 0.28 위 자체 UniFFI 바인딩(스파이크 결론)을 쓴다.
- Markdown 구조는 core의 파서와 `computeLayout`을 JavaScriptCore로 실행해 얻는다. Swift로 다시 짜지 않는다.
- 5,000줄 문서에서 키 입력 → 화면 반영 p95 16ms(web-source-editor 목표와 같다).
- 에이전트는 서버에서 공식 CLI(`claude`, `codex`) 바이너리로 실행한다. 앱이 Claude 구독 OAuth를 직접 쓰지 않는다.
- 기기 사본은 앱 샌드박스 안에만 둔다.
- 데이터베이스, 검색, 백링크, MCP 도구, 패스키 로그인 등 기존 서버 기능을 깨지 않는다.
- 공개 저장소에 비밀값·로컬 경로를 넣지 않는다. 저장소를 받은 사람이 앱을 빌드할 수 있어야 한다.

## 범위 밖

- iPadOS·iOS 앱(공유 모듈은 iOS에서 쓸 수 있게 만들되 앱은 만들지 않는다).
- 원격 서버(synapse.lawdigest.kr) 로그인. 이번에는 맥의 로컬 서버에 붙는다.
- 웹 편집기와의 동시 편집 품질: Tiptap 계층 제거(web-source-editor P6), 세 작성자 중복
  (`codex/concurrent-edit-duplication`), 긴 문서 부하(`codex/large-doc-concurrent-load`).
- 앱 안의 데이터베이스 뷰 실제 데이터, 검색, 그래프, 메모, 첨부 업로드.
- 오프라인 새 문서 만들기, 오프라인 검색, 오프라인 에이전트.
- App Store 배포, 공증.

## 열린 질문

1. **단계.** 서버 에이전트 API → macOS 앱(목록·편집기·채팅) → 서버 CRDT 상태 보존과 앱 오프라인 사본 순서로
   나눈다. 단계별 범위는 spec에서 정한다.
2. **CRDT 상태 보존 방식.** update 로그를 어디에 어떤 형식으로 둘지, 재시작 뒤 디스크 파일과 다를 때 어떻게
   맞출지, lineage epoch를 어떻게 유지할지 spec에서 정한다.
3. **JavaScriptCore 성능.** core 번들을 블록 단위로 돌렸을 때 p95 16ms를 지키는지 첫 단계에서 측정한다.
   못 지키면 사용자에게 선택지를 가져온다.

수정 이력: 2026-10-15판(커밋 `cae9bebd`)은 기호 표시를 스파이크 방식(커서 문단에서만 표시)으로, 오프라인 병합
방식과 서버 상태 보존을 정하지 않은 채 수락됐다. 2026-10-16에 위 내용으로 다시 쓴다.
