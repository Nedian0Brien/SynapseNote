# Intent: SynapseNote 저장소를 네이티브 앱으로 교체

## 무엇을

- 기존 SynapseNote 저장소(open-knowledge 포크, 웹 편집기·CLI·서버·macOS 데스크톱 앱)의 추적 파일을 모두 `references/legacy/` 아래로 옮긴다.
- SynapseNote-Native에서 한 작업(Morrow 이식 SwiftUI 앱, 11e-2까지)을 저장소 루트에 들인다.

## 왜

Morrow 이식이 끝나(11a~11e-2, PR #1~#26) 네이티브 앱이 SynapseNote를 계승할 준비가 되었다. 앞으로는 SynapseNote 저장소 하나에서 이어 가고, 기존 코드는 참고용으로 같은 저장소에 남긴다.

## 범위

- 대상: `Nedian0Brien/SynapseNote`의 `main`(ddabafa6). 새 브랜치 `feat/native-migration`에서 하고 PR로 낸다. `main`에 바로 올리지 않는다.
- 들일 내용: SynapseNote-Native의 `feat/swift-session-owner` 끝(PR #26, 그 아래 #1~#25를 모두 포함). Native 쪽 PR은 병합되지 않은 상태다.
- 기존 파일은 `git mv`로 옮겨 각 파일의 기록이 이어지게 한다.
- Morrow submodule(`web/vendor/morrow`)과 앱 빌드는 Native와 똑같이 동작해야 한다(node 없이 빌드, macOS 시험 통과).

## 범위 밖

- SynapseNote-Native 저장소의 보관·삭제, 그쪽 PR 정리.
- SynapseNote의 다른 브랜치(`codex/*` 등)와 열린 PR #1, #2. 옮긴 뒤에는 이 브랜치들이 `main`과 크게 충돌한다.
- `main` 체크아웃에 커밋되지 않은 `README.md` 변경과 `.skill-archive/`. 손대지 않는다.
- 저장소 라이선스 결정.

## 결정 (2026-10-22, 사용자)

- Native의 커밋 기록을 함께 들인다(관련 없는 기록 병합).
- 루트 `LICENSE`(GPL-3.0)는 기존 코드와 함께 `references/legacy/`로 옮긴다. 루트 라이선스는 Native처럼 정하지 않은 상태로 둔다.
- 기존 `.github/workflows`는 `references/legacy/` 아래로 가며 GitHub에서 실행되지 않는다.
- 수락: 2026-10-22.
