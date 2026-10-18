# SynapseNote-Native

macOS, iPadOS, iOS용 SwiftUI 노트 앱. [Morrow](https://github.com/Aarav2709/Morrow)의 기능을 옮기며, 완성되면 기존 SynapseNote를 계승한다.

블록 에디터는 Morrow의 TipTap 에디터를 그대로 쓰고 SwiftUI `WebView`(iOS·macOS 26 이상) 안에서 띄운다. 나머지 화면과 데이터 계층은 Swift로 작성한다.

현재 상태: 에디터 시제품. 앱에 들어 있는 시험용 페이지를 열고 편집할 수 있으며, 편집 내용은 저장하지 않는다. 검증 결과는 [docs/verification/webview-editor-spike.md](docs/verification/webview-editor-spike.md)에 있다.

## 필요한 것

- Xcode 27 이상 (iOS·macOS 26 SDK 포함)
- Node.js 20.19 이상
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)

## 빌드

```sh
git clone --recurse-submodules <저장소 주소>
cd SynapseNote-Native
npm --prefix web ci
xcodegen generate
open SynapseNote.xcodeproj
```

이미 클론했다면 `git submodule update --init`으로 Morrow를 받는다.

Xcode 빌드의 첫 단계(`scripts/build-editor.sh`)가 `web/`을 빌드해 `App/Resources/Editor/`에 에디터 번들과 시험용 페이지(`sample-guide.json`)를 만든다. `web/`이나 Morrow 소스가 바뀌었을 때만 다시 빌드한다.

## 검사

```sh
npm --prefix web run typecheck
npm --prefix web test
xcodebuild -scheme SynapseNote -destination 'platform=macOS' test
```

## 구조

| 경로 | 내용 |
|---|---|
| `App/Sources` | SwiftUI 앱, `WebPage` 브리지, 번들 전용 URL 스킴 핸들러 |
| `App/Tests` | Swift 단위 테스트 |
| `web/vendor/morrow` | Morrow, git submodule, `a2daae1` 고정, 수정하지 않음 |
| `web/src` | 에디터 진입점과 JS 쪽 브리지 |
| `web/src/host` | Morrow 앱 모듈 중 Electron·Morrow 상태에 묶인 것을 대신하는 모듈. `web/vite.config.ts`가 빌드할 때 바꿔 끼운다 |
| `.intent` | 변경마다 남기는 intent, spec, plan |

## 보안 설정

- 에디터 페이지는 `synapse-editor://app/`에서 앱 번들 안의 파일만 읽는다. Content-Security-Policy와 navigation decider가 원격 요청과 다른 주소로의 이동을 막는다.
- macOS App Sandbox에서 WebKit 콘텐츠 프로세스는 network client 권한 없이 시작되지 않아 이 권한을 켰다. 에디터 페이지는 이 권한으로 원격 리소스를 읽지 않는다.
- 코드 서명은 개발 팀을 정하기 전까지 로컬 실행용(`-`)이다.

## 라이선스

이 저장소는 Apache License 2.0인 Morrow 코드를 포함한다. 출처와 바꾼 파일은 [NOTICE](NOTICE)에, Morrow 라이선스 전문은 [LICENSES/Morrow-Apache-2.0.txt](LICENSES/Morrow-Apache-2.0.txt)에 있다. 이 저장소 자체의 라이선스는 아직 정하지 않았다.
