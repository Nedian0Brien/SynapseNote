---
title: 데스크톱 앱 아이콘 적용
slug: app-icon-logo
stage: intent
status: accepted
author: minjaepark
date: 2026-09-22
---

# 데스크톱 앱 아이콘 적용

## 문제

SynapseNote는 현재 제공된 시냅스노트 로고를 Dock, Finder, 패키지된 앱에서 사용하지 않는다. 사용자가 앱을 식별할 때 제품의 시각 자산이 일관되게 드러나야 한다.

## 원하는 결과

제공한 1254×1254 PNG 기반 아이콘이 개발 모드 Dock과 로컬로 패키지한 macOS 앱에서 표시된다.

## 영향 범위

macOS를 사용하는 SynapseNote 데스크톱 앱 사용자와 `packages/desktop/build`의 아이콘 자산에 영향이 있다. 적용 범위는 사용자가 결정한다.

## 제약

기존 Electron 개발 모드의 `build/icon.png` 경로와 macOS Icon Composer의 `build/synapsenote.icon` 경로를 함께 유지한다. 웹 파비콘과 앱 내부 UI는 건드리지 않는다.

## 범위 밖

웹 파비콘, 제품명, 배포 서명 정책, 앱 내부 UI 변경은 이번 작업에 포함하지 않는다.

## 열린 질문

없음.
