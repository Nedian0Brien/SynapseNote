import SwiftUI
import SynapseDesignSystem

@MainActor
struct MaterialsCatalogPage: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Liquid Glass variants",
        description: "유리는 콘텐츠가 아니라 탐색과 조작 계층을 분리하는 시스템 재질입니다."
      ) {
        MaterialComparisonStage()
      }

      CatalogSectionView(
        "Native actions",
        description: "중요도는 커스텀 배경색이 아니라 시스템 glass button style로 표현합니다."
      ) {
        GlassEffectContainer(spacing: 18) {
          HStack(spacing: 18) {
            SynapseButton("Primary action", role: .primary) {}
            SynapseButton("Secondary", role: .secondary) {}
            SynapseIconButton(symbol: "slider.horizontal.3", accessibilityLabel: "조정") {}
          }
        }
      }

      CatalogSectionView("Material contract") {
        TokenDefinitionTable(tokens: [
          TokenDefinition(name: "regular", value: "Glass.regular", purpose: "표준 탐색과 문맥 컨트롤"),
          TokenDefinition(name: "clear", value: "Glass.clear", purpose: "이미지와 미디어 위의 낮은 가림 컨트롤"),
          TokenDefinition(name: "identity", value: "Glass.identity", purpose: "접근성 또는 조건부 비활성 상태"),
          TokenDefinition(name: "glass", value: "GlassButtonStyle", purpose: "보조 동작"),
          TokenDefinition(
            name: "glassProminent", value: "GlassProminentButtonStyle", purpose: "한 화면의 핵심 동작"),
        ])
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "사이드바, 툴바, 인스펙터, 문맥 도구처럼 콘텐츠 위에 놓이는 조작 계층에 사용합니다.",
            "여러 유리 요소는 GlassEffectContainer 안에서 함께 렌더링합니다.",
            "탭과 포인터에 반응하는 커스텀 유리만 interactive로 설정합니다.",
            "Reduce Transparency에서는 시스템이 제공하는 대체 표현을 유지합니다.",
          ],
          avoid: [
            "문서 본문, 목록, 상태표, 전체 배경을 유리로 만들지 않습니다.",
            "유리 위에 유리를 중첩하거나 별도 shadow와 stroke를 덧칠하지 않습니다.",
            "강조를 위해 모든 버튼을 glassProminent로 만들지 않습니다.",
          ]
        )
      }
    }
  }
}

private struct MaterialComparisonStage: View {
  var body: some View {
    ZStack {
      HStack(spacing: 0) {
        Color.indigo.opacity(0.72)
        Color.teal.opacity(0.62)
        Color.orange.opacity(0.58)
      }
      .overlay {
        VStack(spacing: 8) {
          Text("Knowledge beneath the controls")
            .font(.title2.weight(.semibold))
          Text("Liquid Glass samples the content behind it while keeping actions legible.")
            .font(.callout)
        }
        .foregroundStyle(.white)
      }

      GlassEffectContainer(spacing: 22) {
        HStack(spacing: 22) {
          MaterialSample(title: "Regular", glass: .regular)
          MaterialSample(title: "Clear", glass: .clear)
          MaterialSample(title: "Identity", glass: .identity)
        }
      }
    }
    .frame(height: 220)
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
  }
}

private struct MaterialSample: View {
  let title: String
  let glass: Glass

  var body: some View {
    VStack(spacing: 10) {
      Image(systemName: "circle.hexagongrid")
        .font(.title2)
      Text(title)
        .font(.caption.weight(.semibold))
    }
    .foregroundStyle(.primary)
    .frame(width: 132, height: 92)
    .glassEffect(glass, in: .rect(cornerRadius: 18))
  }
}
