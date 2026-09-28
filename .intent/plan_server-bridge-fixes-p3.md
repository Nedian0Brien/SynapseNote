---
title: 서버 문서 동기화 결함 수정 — P3 유실·크기 검증
slug: server-bridge-fixes
stage: plan
status: accepted
intent: .intent/intent_server-bridge-fixes.md
spec: .intent/spec_server-bridge-fixes.md
date: 2026-09-28
---

# P3 유실·크기 검증 — 구현 계획

P1·P2·P4 뒤 R6(유실 0)과 R7(크기 안정)을 스파이크의 `soak.ts`로 잰다. 코드 수정은 측정 도구에만 한다.

## 측정 도구 보완 (스파이크 브랜치)

P4c 뒤 서버는 fragment 편집을 `Y.Text`에 공통 앞·뒤를 뺀 가운데만 쓴다. 관찰자가 마커를 삽입 문자열 하나에서만
찾으면 앞부분이 이웃 마커와 겹치는 마커를 못 보고, 유실 검사는 관찰자가 본 마커만 대상으로 하므로 그 마커의
유실을 놓친다.

| 파일 | 무엇을 |
|---|---|
| `native/editor-spike/scripts/soak.ts` | 유실 검사 대상 = 관찰자가 본 마커 ∪ fragment·patch 작성자가 쓴 마커. 관찰자는 전체 텍스트에서 처음 보인 마커를 기록. 작성자별 삽입 글자 수(UTF-16)를 세고, 삽입 전용이면 최종 길이 ≤ 초기 길이 + 삽입 글자 수 × 2를 검사해 종료 코드에 반영 |
| `native/editor-spike/App/Soak/SoakTyper.swift`, `SoakRecorder.swift`, `EditorViewController.swift` | 앱이 삽입한 UTF-16 단위 수를 `soak-inserted.txt`에 기록 |

크기는 UTF-16 단위로 잰다. spec R7의 "삽입 글자 수 × 2바이트"는 삽입 글자마다 이스케이프 `\` 하나까지를
허용한다는 뜻이고, 한글·이모지의 UTF-8 바이트 수와 무관하게 같은 뜻을 UTF-16 단위로 확인한다.

## 실행 조합

모두 `--insert-only`, dev 서버(:5181, 이 브랜치 빌드).

| # | 문서 | 작성자 | 시간 | 확인 |
|---|---|---|---|---|
| 1 | 38줄 | fragment(합성)만 | 3분 | R6 |
| 2 | 38줄 | fragment(ProseMirror)만 | 3분 | R6 |
| 3 | 38줄 | 앱 + fragment(ProseMirror) + patch | 10분 | R6, R7 |
| 4 | 5,000줄 | fragment(합성)만 | 3분 | R6 |
| 5 | 5,000줄 | fragment(ProseMirror)만 | 3분 | R6 |
| 6 | 5,000줄 | 앱 + fragment(ProseMirror) + patch | 10분 | R6, R7 |

## 가장 위험한 단계

유실이 나오는 경우. 그때는 측정을 멈추고 원인을 조사해 spec에 수정 방법을 추가한다(spec의 P3 규칙).

## 검증

```
bun native/editor-spike/scripts/soak.ts --port 5181 --content-dir <dir> --insert-only --no-app --no-patch --minutes 3 [--fragment-writer prosemirror] [--doc <5,000줄>]
bun native/editor-spike/scripts/soak.ts --port 5181 --content-dir <dir> --udid <sim> --insert-only --fragment-writer prosemirror --minutes 10 [--doc <5,000줄>]
```
