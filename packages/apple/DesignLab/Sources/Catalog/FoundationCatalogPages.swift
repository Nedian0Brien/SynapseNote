import SwiftUI
import SynapseDesignSystem

@MainActor
struct ColorTokensCatalogPage: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast

  var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Semantic roles",
        description: "기능 화면은 색상 값이 아니라 역할 이름만 사용합니다."
      ) {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), spacing: 12)], spacing: 12) {
          ColorRoleSwatch(name: "canvas", purpose: "문서와 카탈로그의 기본 표면", color: colors.canvas)
          ColorRoleSwatch(name: "sidebar", purpose: "탐색과 보조 패널 표면", color: colors.sidebar)
          ColorRoleSwatch(
            name: "elevatedSurface",
            purpose: "메뉴와 독립 컨트롤 표면",
            color: colors.elevatedSurface
          )
          ColorRoleSwatch(
            name: "contentPrimary",
            purpose: "제목과 주요 본문",
            color: colors.contentPrimary
          )
          ColorRoleSwatch(
            name: "contentSecondary",
            purpose: "메타데이터와 보조 정보",
            color: colors.contentSecondary
          )
          ColorRoleSwatch(name: "separator", purpose: "구조를 나누는 가는 경계", color: colors.separator)
          ColorRoleSwatch(name: "accent", purpose: "선택과 핵심 동작", color: colors.accent)
          ColorRoleSwatch(
            name: "accentSurface",
            purpose: "선택된 행과 블록 표면",
            color: colors.accentSurface
          )
          ColorRoleSwatch(name: "warning", purpose: "오프라인과 주의 상태", color: colors.warning)
          ColorRoleSwatch(name: "destructive", purpose: "충돌과 파괴적 동작", color: colors.destructive)
        }
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "기능 코드에서는 canvas, contentPrimary 같은 의미 역할을 사용합니다.",
            "상태는 색상과 함께 아이콘 또는 텍스트로 전달합니다.",
            "라이트, 다크, 고대비에서 같은 정보 우선순위를 유지합니다.",
          ],
          avoid: [
            "기능 화면에 임의 RGB, opacity, systemGray 값을 추가하지 않습니다.",
            "강조색으로 장식 영역이나 넓은 배경을 채우지 않습니다.",
            "색상만으로 선택, 오류, 동기화 상태를 구분하지 않습니다.",
          ]
        )
      }
    }
  }
}

private struct ColorRoleSwatch: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast

  let name: String
  let purpose: String
  let color: Color

  var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    VStack(alignment: .leading, spacing: 10) {
      RoundedRectangle(cornerRadius: theme.controlRadius, style: .continuous)
        .fill(color)
        .frame(height: 68)
        .overlay {
          RoundedRectangle(cornerRadius: theme.controlRadius, style: .continuous)
            .stroke(colors.separator, lineWidth: 1)
        }

      Text(name)
        .font(.system(.callout, design: .monospaced, weight: .semibold))
      Text(purpose)
        .font(.caption)
        .foregroundStyle(colors.contentSecondary)
    }
  }
}

@MainActor
struct TypographyCatalogPage: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Type roles",
        description: "고정 크기 대신 Dynamic Type을 따르는 시스템 역할로 정의합니다."
      ) {
        VStack(alignment: .leading, spacing: 24) {
          TypographySample(
            token: "documentTitle",
            source: "Large Title · Semibold",
            text: "제품 설계 노트",
            font: SynapseTypography.documentTitle
          )
          TypographySample(
            token: "documentBody",
            source: "Body · Regular",
            text: "문서는 생각을 전개하는 중심 표면이며, 도구는 필요한 순간에만 나타납니다.",
            font: SynapseTypography.documentBody
          )
          TypographySample(
            token: "navigationEmphasized",
            source: "Body · Semibold",
            text: "선택된 문서",
            font: SynapseTypography.navigationEmphasized
          )
          TypographySample(
            token: "metadata",
            source: "Caption · Medium",
            text: "오늘 · Research/Design · 동기화됨",
            font: SynapseTypography.metadata
          )
          TypographySample(
            token: "code",
            source: "Callout · Monospaced",
            text: "@Environment(SynapseTheme.self) private var theme",
            font: SynapseTypography.code
          )
        }
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "문서 본문과 앱 크롬은 각자의 의미형 글자 역할을 사용합니다.",
            "한글과 영문이 섞인 실제 문장으로 줄 높이와 리듬을 검토합니다.",
            "Dynamic Type 확대에서도 제목, 본문, 메타데이터 계층을 유지합니다.",
          ],
          avoid: [
            "화면마다 임의의 point size와 weight 조합을 만들지 않습니다.",
            "메타데이터를 지나치게 작게 만들어 계층을 해결하지 않습니다.",
            "장식 목적으로 여러 글꼴을 섞지 않습니다.",
          ]
        )
      }
    }
  }
}

private struct TypographySample: View {
  let token: String
  let source: String
  let text: String
  let font: Font

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack {
        Text(token)
          .font(.system(.caption, design: .monospaced, weight: .semibold))
        Spacer()
        Text(source)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Text(text)
        .font(font)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

@MainActor
struct SpacingCatalogPage: View {
  @Environment(SynapseTheme.self) private var theme

  var body: some View {
    let spacing = theme.spacing
    let tokens = [
      TokenDefinition(name: "xSmall", value: point(spacing.xSmall), purpose: "아이콘과 인라인 요소 사이"),
      TokenDefinition(name: "small", value: point(spacing.small), purpose: "컨트롤 내부와 가까운 형제 사이"),
      TokenDefinition(name: "medium", value: point(spacing.medium), purpose: "기본 컴포넌트 패딩"),
      TokenDefinition(name: "large", value: point(spacing.large), purpose: "콘텐츠 그룹 사이"),
      TokenDefinition(name: "xLarge", value: point(spacing.xLarge), purpose: "주요 섹션과 문서 여백"),
      TokenDefinition(
        name: "rowHeight", value: point(spacing.rowHeight), purpose: "탐색 행과 버튼 최소 높이"),
    ]

    return VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Spacing scale",
        description: "오른쪽 패널의 Density와 Spacing scale을 바꾸면 모든 정의와 컴포넌트가 함께 갱신됩니다."
      ) {
        VStack(alignment: .leading, spacing: 12) {
          ForEach(tokens) { token in
            SpacingRuler(token: token)
          }
        }
      }

      CatalogSectionView("Token definitions") {
        TokenDefinitionTable(tokens: tokens)
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "인접 관계는 작은 토큰, 섹션 관계는 큰 토큰으로 표현합니다.",
            "Compact 모드에서도 터치와 선택 가능한 최소 높이를 보존합니다.",
          ],
          avoid: [
            "레이아웃을 맞추기 위해 13, 19처럼 새로운 간격을 즉석에서 만들지 않습니다.",
            "빈 공간을 카드와 경계선으로 대신하지 않습니다.",
          ]
        )
      }
    }
  }

  private func point(_ value: CGFloat) -> String {
    "\(Double(value).formatted(.number.precision(.fractionLength(0...1)))) pt"
  }
}

private struct SpacingRuler: View {
  @Environment(SynapseTheme.self) private var theme
  let token: TokenDefinition

  var body: some View {
    HStack(spacing: 14) {
      Text(token.name)
        .font(.system(.caption, design: .monospaced, weight: .semibold))
        .frame(width: 74, alignment: .leading)
      Capsule()
        .fill(theme.accent.color)
        .frame(width: rulerWidth, height: 8)
      Text(token.value)
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
    }
  }

  private var rulerWidth: CGFloat {
    let numeric = Double(token.value.split(separator: " ").first ?? "0") ?? 0
    return max(8, numeric * 3)
  }
}

@MainActor
struct ShapeCatalogPage: View {
  @Environment(SynapseTheme.self) private var theme

  var body: some View {
    let tokens = [
      TokenDefinition(
        name: "controlRadius", value: point(theme.controlRadius), purpose: "버튼, 검색, 행 선택"),
      TokenDefinition(
        name: "panelRadius", value: point(theme.panelRadius), purpose: "메뉴, 코드, 독립 패널"),
      TokenDefinition(
        name: "selectionRadius", value: point(theme.selectionRadius), purpose: "편집 블록 선택 경계"),
    ]

    return VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Shape roles",
        description: "모서리는 장식이 아니라 크기와 상호작용 범위를 설명합니다."
      ) {
        HStack(spacing: 24) {
          ShapeSample(title: "Control", radius: theme.controlRadius)
          ShapeSample(title: "Panel", radius: theme.panelRadius)
          ShapeSample(title: "Selection", radius: theme.selectionRadius)
        }
      }

      CatalogSectionView("Token definitions") {
        TokenDefinitionTable(tokens: tokens)
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "컴포넌트의 크기와 포함 관계에 맞는 의미형 radius를 사용합니다.",
            "선택 경계는 콘텐츠 형태를 가리지 않는 최소 곡률을 사용합니다.",
          ],
          avoid: [
            "모든 표면을 둥근 카드로 만들지 않습니다.",
            "한 컴포넌트 안에서 서로 다른 임의 radius를 섞지 않습니다.",
          ]
        )
      }
    }
  }

  private func point(_ value: CGFloat) -> String {
    "\(Double(value).formatted(.number.precision(.fractionLength(0...1)))) pt"
  }
}

private struct ShapeSample: View {
  @Environment(SynapseTheme.self) private var theme
  let title: String
  let radius: CGFloat

  var body: some View {
    VStack(spacing: 10) {
      RoundedRectangle(cornerRadius: radius, style: .continuous)
        .fill(theme.accent.color.opacity(0.14))
        .overlay {
          RoundedRectangle(cornerRadius: radius, style: .continuous)
            .stroke(theme.accent.color, lineWidth: 1)
        }
        .frame(height: 92)
      Text(title).font(.caption.weight(.semibold))
      Text("\(Double(radius).formatted(.number.precision(.fractionLength(0...1)))) pt")
        .font(.caption2.monospacedDigit())
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity)
  }
}

@MainActor
struct MotionCatalogPage: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var revealed = false

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Motion tokens",
        description: "모션은 계층과 상태 변화를 설명하며, Reduce Motion에서는 색상과 배치 피드백을 유지합니다."
      ) {
        VStack(alignment: .leading, spacing: 18) {
          Button("Play reveal", action: toggleReveal)
            .buttonStyle(.borderedProminent)

          HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 8)
              .fill(.tint.opacity(0.18))
              .frame(width: revealed ? 220 : 72, height: 48)
            Text(revealed ? "Inspector revealed" : "Collapsed")
              .foregroundStyle(.secondary)
          }
          .animation(reduceMotion ? nil : SynapseMotion.reveal, value: revealed)
        }
      }

      CatalogSectionView("Token definitions") {
        TokenDefinitionTable(tokens: [
          TokenDefinition(
            name: "reveal",
            value: "\(SynapseMotion.revealDuration.formatted()) s · spring",
            purpose: "패널과 문맥 표면 출현"
          ),
          TokenDefinition(
            name: "selection",
            value: "\(SynapseMotion.selectionDuration.formatted()) s · easeOut",
            purpose: "선택과 눌림 피드백"
          ),
        ])
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "사용자의 입력과 직접 연결된 상태 변화에만 모션을 사용합니다.",
            "열기와 닫기의 목적에 맞는 범위와 시간을 선택합니다.",
            "Reduce Motion에서도 선택과 완료 상태를 색상과 배치로 전달합니다.",
          ],
          avoid: [
            "모든 재렌더링과 숫자 변화에 애니메이션을 붙이지 않습니다.",
            "장거리 이동, 과한 bounce, 연속 blur로 집중을 끊지 않습니다.",
          ]
        )
      }
    }
  }

  private func toggleReveal() {
    revealed.toggle()
  }
}
