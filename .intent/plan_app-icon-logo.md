---
title: 데스크톱 앱 아이콘 적용
slug: app-icon-logo
stage: plan
status: accepted
intent: .intent/intent-app-icon-logo.md
spec: .intent/spec_app-icon-logo.md
date: 2026-09-22
---

# 데스크톱 앱 아이콘 적용 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `.gitignore` | 저장소 안의 `worktree/`를 추적 대상에서 제외 |
| `packages/desktop/build/icon.png` | 개발 모드 Dock용 1024×1024 PNG 교체 |
| `packages/desktop/build/synapsenote.icon/Assets/synapsenote-logo.png` | Icon Composer용 새 원본 PNG |
| `packages/desktop/build/synapsenote.icon/icon.json` | 새 전경 레이어를 불투명하게 렌더링하고 자동 파란 배경 제거 |
| `packages/desktop/build/synapsenote.icon/Assets/Frame 10 (10) 1.svg` | 더 이상 참조하지 않는 이전 전경 SVG 제거 |
| `.changeset/<name>.md` | 사용자가 볼 앱 아이콘 변경 기록 |

구현 중 이 표에서 벗어나면 같은 커밋에서 이 파일을 고친다.

## 작업 순서

1. 이전 SVG 참조가 `icon.json`뿐인지 확인하고 제공 PNG를 1024×1024로 생성한다 — `sips` 크기로 확인한다.
2. Icon Composer의 전경 레이어를 새 PNG로 바꾸고 1.0 배율로 설정한 뒤 이전 SVG를 제거한다 — `rg`로 잔여 참조가 없는지 확인한다.
3. Icon Composer의 자동 그라데이션을 제거하고 전경 레이어의 반투명도를 끈다 — Finder 미리보기에서 제공 이미지의 흰 배경이 유지되는지 확인한다.
4. 변경 안내와 `worktree/` 제외 규칙을 추가한다 — staged diff로 대상 파일만 확인한다.
5. 데스크톱 정적 검증과 로컬 macOS 번들 생성을 실행한다 — `check:desktop:local`, `build:desktop:local` 성공을 확인한다.

## 가장 위험한 단계

Icon Composer 입력 형식이 맞지 않으면 `actool`이 패키징에서 실패한다. 새 PNG를 제거하고 `icon.json`을 이전 SVG로 되돌리면 이전 아이콘 구성으로 복구할 수 있다.

## 검증

```sh
sips -g pixelWidth -g pixelHeight packages/desktop/build/icon.png packages/desktop/build/synapsenote.icon/Assets/synapsenote-logo.png
bun run check:desktop:local
bun run build:desktop:local
test -f packages/desktop/dist-desktop-local/mac-arm64/SynapseNote.app/Contents/Resources/Assets.car
```

Finder에서 로컬 번들의 `SynapseNote.app`을 선택하고 아이콘 미리보기를 확인한다. 앱을 실행해 Dock 타일에도 같은 로고가 표시되는지 확인한다.
