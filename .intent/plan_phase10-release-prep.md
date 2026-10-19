# Plan: 10단계 배포 준비 (개발자 팀 없이 할 수 있는 것)

spec: `spec_phase10-release-prep.md`. 브랜치 `feat/release`(기준 `feat/settings`), 워크트리 `.worktree/release`.

## 순서

1. **버전과 번들 빌드**: `project.yml` info properties에 `CFBundleShortVersionString: $(MARKETING_VERSION)`, `CFBundleVersion: $(CURRENT_PROJECT_VERSION)`. `vite.config.ts`의 `__APP_VERSION__`은 `project.yml`의 `MARKETING_VERSION`을 읽는다. `build-editor.sh` 감시 목록에 `web/sampleRenames.ts`.
2. **개인정보 매니페스트**: `App/PrivacyInfo.xcprivacy`, `project.yml` resources.
3. **아이콘**: `scripts/make-icon.swift`(CoreGraphics, iOS 1024 정사각형·macOS 크기별 둥근 사각형), `App/Assets.xcassets`(AppIcon, AccentColor), `ASSETCATALOG_COMPILER_APPICON_NAME`.
4. **경고**: `PDFExporter.swift`의 `UIWindow(frame:)`를 `UIWindow(windowScene:)`로.
5. **Release 검증**: macOS·iOS Release archive(서명 끔), archive 안의 Info.plist·아이콘·매니페스트·리소스·`Metadata.appintents` 확인.
6. **iPhone 점검**: iPhone 17 Pro Max 시뮬레이터에서 도구 막대, 설정, Quick Note, 커버, 가이드. 고칠 것이 있으면 고친다.
7. **문서**: `docs/release/checklist.md`(팀 이후 절차, 수출 규정 판단 자료), `docs/release/app-store.md`(설명·키워드·개인정보 라벨·Review 메모 초안), `docs/verification/phase10-release-prep.md`, 로드맵, 푸시, PR #11(기준 `feat/settings`).
