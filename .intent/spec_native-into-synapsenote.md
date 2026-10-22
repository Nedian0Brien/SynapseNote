# Spec: SynapseNote 저장소를 네이티브 앱으로 교체

상위: `intent_native-into-synapsenote.md`(수락됨).

## 요구사항

1. `main`(ddabafa6)의 추적 파일은 모두 같은 상대 경로로 `references/legacy/` 아래에 있다. 내용은 바이트까지 같다(`git diff ddabafa6:<p> HEAD:references/legacy/<p>`가 비어 있음).
2. 저장소 루트는 SynapseNote-Native `feat/swift-session-owner`(PR #26 끝)의 트리와 같다. 다만 이 변경의 intent·spec·plan, `references/`, 그리고 아래 4의 문서 수정은 예외다.
3. Native의 커밋 181개가 기록에 들어온다(두 번째 부모로 병합).
4. 문서: 루트 `README.md`가 이 저장소(SynapseNote)를 설명하고 `references/legacy/`가 무엇인지 적는다. `docs/roadmap.md`의 PR 번호가 SynapseNote-Native 저장소 번호라는 것을 적는다.
5. `web/vendor/morrow` submodule이 그대로 동작한다(`git submodule update --init`).
6. 앱 빌드: node가 없고 submodule도 받지 않은 새 clone에서 macOS·iOS 시뮬레이터 빌드가 성공한다. macOS 시험이 Native와 같은 186개로 통과한다.

## 설계

- 옮기기는 ddabafa6의 `git ls-tree --name-only` 최상위 항목마다 `git mv`로 한다. `.intent`는 기존 파일만 하나씩 옮긴다. 이 변경의 intent·spec·plan은 루트 `.intent`에 남는다.
- 병합은 `git merge --allow-unrelated-histories`로 한다. 옮긴 뒤 루트에는 `references/`와 이 변경의 `.intent` 파일 세 개만 남는다. Native의 `.intent`에는 같은 이름의 파일이 없어 충돌이 나지 않는다.
- 기존 `.gitignore`는 `references/legacy/.gitignore`가 되어 그 아래에만 적용된다. 루트 `.gitignore`는 Native 것을 쓴다.

## 범위 밖

intent와 같다. SynapseNote-Native 저장소와 그 PR, `codex/*` 브랜치, 열린 PR #1·#2, 라이선스 결정.
