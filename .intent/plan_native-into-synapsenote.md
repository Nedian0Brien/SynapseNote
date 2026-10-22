# Plan: SynapseNote 저장소를 네이티브 앱으로 교체

1. intent·spec·plan 커밋.
2. `refactor:` 기존 추적 파일 전부를 `references/legacy/`로 `git mv`(intent·spec·plan 제외). 확인: 요구사항 1을 스크립트로 검사.
3. `merge:` SynapseNote-Native `feat/swift-session-owner`를 원격으로 받아 `--allow-unrelated-histories`로 병합. 확인: 루트 트리를 Native 끝과 비교(요구사항 2, 3).
4. `docs:` README(저장소 소개, `references/legacy/` 안내, clone 주소), roadmap(PR 번호 출처).
5. 확인: 이 브랜치를 새로 clone해 submodule 없이, PATH에서 node를 뺀 채 macOS·iOS 시뮬레이터 빌드. submodule을 받은 checkout에서 macOS 시험.
6. push, SynapseNote에 PR(기준 `main`). 병합하지 않는다.
