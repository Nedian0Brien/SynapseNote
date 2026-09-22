---
title: 데스크톱 앱 아이콘 적용
slug: app-icon-logo
stage: spec
status: accepted
intent: .intent/intent-app-icon-logo.md
date: 2026-09-22
---

# 데스크톱 앱 아이콘 적용 — 명세

## 요구사항

- [ ] 제공한 정사각 PNG를 1024×1024 PNG로 변환해 `packages/desktop/build/icon.png`에 둔다.
- [ ] Icon Composer 번들이 동일한 PNG를 전경 레이어로 사용해 패키지된 macOS 앱의 아이콘을 생성한다.
- [ ] `bun run check:desktop:local`과 로컬 macOS 번들 생성이 성공한다.

## 설계

Electron 개발 모드는 `src/main/index.ts`의 `ICON_PNG_PATH`를 통해 `build/icon.png`을 Dock에 적용한다. `electron-builder.yml`은 `build/synapsenote.icon`을 macOS 아이콘 입력으로 사용한다. 원본을 두 경로에 각각 맞게 두고 Icon Composer 레이어 이름만 새 PNG로 바꾼다.

## 버린 대안

기존 SVG 위에 로고를 재작성하지 않는다. 사용자가 제공한 원본의 노드 그래프와 여백을 그대로 보존할 수 없기 때문이다.

## 함정

Icon Composer의 전경 레이어가 기본 0.8 배율이면 원본의 둥근 카드 바깥에 별도 배경이 보일 수 있다. 원본 전체가 앱 아이콘 표면을 차지하도록 배율을 1.0으로 둔다.

## 완료 기준

`sips`가 두 PNG의 1024×1024 크기를 확인하고, `check:desktop:local`과 `build:desktop:local`이 성공한다. 생성한 `SynapseNote.app`의 `Assets.car`와 PNG가 존재하는지 확인한다.
