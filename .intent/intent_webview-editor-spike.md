---
title: WKWebView 에디터 시제품
slug: webview-editor-spike
stage: intent
status: accepted
author: Dennis Park
date: 2026-10-18
---

# WKWebView 에디터 시제품

## 문제

SynapseNote-Native는 Morrow(Electron, React, TipTap)의 기능을 macOS, iPadOS, iOS용 SwiftUI 앱으로 옮기는 프로젝트이고, 완성되면 기존 SynapseNote를 계승한다.
포팅 방식은 A안으로 정했다. 블록 에디터는 Morrow의 TipTap 에디터를 `WKWebView`에 넣고, 나머지 화면과 데이터 계층은 SwiftUI와 Swift로 새로 만든다.

A안이 성립하는지가 아직 확인되지 않았다. Morrow 에디터는 Electron(Chromium)에서만 테스트됐고, `WKWebView`(WebKit)에서 한글 IME 조합 입력, 선택, 붙여넣기가 제대로 동작하는지는 모른다.
이 동작이 깨지면 A안 전체를 다시 검토해야 하므로, 다른 영역을 포팅하기 전에 먼저 확인해야 한다.

## 원하는 결과

- 저장소에 macOS, iPadOS, iOS 세 플랫폼으로 빌드되는 SwiftUI 앱 하나가 있다.
- Morrow의 에디터 코드(`src/app/editor`와 에디터가 쓰는 core 모듈)를 빌드한 웹 번들이 앱 안에 들어 있고, 앱이 이 번들을 `WKWebView`로 연다. 웹 번들은 네트워크에 접근하지 않는다.
- Swift와 에디터가 브리지로 연결된다. Swift가 `DocNode` JSON을 넘기면 에디터가 그 문서를 표시하고, 편집 결과는 `DocNode` JSON으로 Swift에 돌아온다.
- Morrow 첫 실행 가이드(`sample.ts`)의 문서를 열면, 에디터가 등록한 노드 종류가 모두 화면에 표시된다.
- 아래 항목을 macOS 앱과 iOS·iPadOS 시뮬레이터에서 확인한 결과가 문서로 남는다. 각 항목에는 통과 여부와 재현 절차를 적는다.
  - 한글 IME 조합 입력: 문단, 제목, 목록, 체크리스트, 표 셀, 콜아웃 안
  - 블록을 넘는 선택, 복사, 잘라내기, 붙여넣기, Markdown 붙여넣기
  - 실행 취소와 다시 실행
  - 슬래시 메뉴와 `[[` 링크 메뉴의 키보드 조작
- 앱을 시뮬레이터에서 키보드로 조작하기 어려운 항목은 사용자가 확인할 절차를 문서에 적는다.

## 영향 범위

- 새 저장소 `~/code/SynapseNote-Native`. 기존 SynapseNote 저장소는 건드리지 않는다.
- 결정 권한: Dennis Park

## 제약

- Morrow는 Apache-2.0이다. 가져온 코드의 출처, 기준 커밋(`a2daae1`), LICENSE를 저장소에 남기고, 바꾼 파일은 바꿨다고 표시한다.
- 앱 이름과 브랜드는 SynapseNote를 쓴다. Morrow 이름을 앱 화면에 노출하지 않는다.
- 에디터 웹 번들은 원격 리소스를 불러오지 않는다. 폰트, KaTeX, Mermaid는 번들에 포함한다.
- 검증 결과를 보고할 때 확인한 항목과 확인하지 못한 항목을 구분한다.

## 범위 밖

- vault 폴더 열기, Markdown 파일 읽기·쓰기, 저장(core와 storage의 Swift 포팅). 다음 변경에서 한다.
- 사이드바, 탭, 데이터베이스 뷰, 캔버스, 그래프, 동기화, 암호화 등 나머지 화면과 기능
- 에디터 안에 넣는 데이터베이스·캔버스 임베드의 표시 방식 결정
- 코드 서명, 실기기 배포, App Store 준비

## 열린 질문

- 최소 지원 OS: iOS·iPadOS·macOS 26으로 할지 27로 할지. 설치된 SDK는 27.0이다.
  - 답: 26 (2026-10-18, Dennis Park)
- 번들 ID
  - 답: `com.synapsenote.native` (2026-10-18, Dennis Park)
- Morrow 코드를 들여오는 방식(git submodule로 고정할지 필요한 파일만 복사할지)은 spec에서 정한다.
