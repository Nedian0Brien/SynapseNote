import SwiftUI
import SynapseDesignSystem

@MainActor
struct CatalogCanvasView: View {
  let catalog: CatalogModel

  var body: some View {
    CatalogPreviewSurface(catalog: catalog)
      .preferredColorScheme(catalog.appearance.colorScheme)
      .dynamicTypeSize(catalog.typeScale.dynamicTypeSize)
  }
}

@MainActor
private struct CatalogPreviewSurface: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast

  let catalog: CatalogModel

  var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    Group {
      if catalog.selection == .workspace {
        WorkspaceCatalogPage(catalog: catalog)
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 28) {
            CatalogHeaderView(item: catalog.selection)
            selectedPage
          }
          .frame(maxWidth: 960, alignment: .leading)
          .padding(.horizontal, 38)
          .padding(.vertical, 32)
          .frame(maxWidth: .infinity, alignment: .topLeading)
        }
      }
    }
    .background(colors.canvas)
    .foregroundStyle(colors.contentPrimary)
  }

  @ViewBuilder
  private var selectedPage: some View {
    switch catalog.selection {
    case .colors:
      ColorTokensCatalogPage()
    case .typography:
      TypographyCatalogPage()
    case .spacing:
      SpacingCatalogPage()
    case .shape:
      ShapeCatalogPage()
    case .materials:
      MaterialsCatalogPage()
    case .motion:
      MotionCatalogPage()
    case .buttons:
      ButtonsCatalogPage(catalog: catalog)
    case .iconButtons:
      IconButtonsCatalogPage(catalog: catalog)
    case .documentRows:
      DocumentRowsCatalogPage(catalog: catalog)
    case .statusBadges:
      StatusBadgesCatalogPage(catalog: catalog)
    case .workspace:
      EmptyView()
    }
  }
}

struct CatalogHeaderView: View {
  let item: CatalogItem

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(item.group.rawValue.uppercased())
        .font(.caption.weight(.semibold))
        .tracking(0.8)
        .foregroundStyle(.secondary)

      Text(item.title)
        .font(.system(.title, design: .default, weight: .semibold))

      Text(item.summary)
        .font(.title3)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

struct CatalogSectionView<Content: View>: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast

  let title: String
  let description: String?
  @ViewBuilder let content: Content

  init(
    _ title: String,
    description: String? = nil,
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self.description = description
    self.content = content()
  }

  var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.title2.weight(.semibold))
        if let description {
          Text(description)
            .font(.body)
            .foregroundStyle(colors.contentSecondary)
        }
      }

      content
        .frame(maxWidth: .infinity, alignment: .leading)

      Divider()
    }
    .padding(.vertical, 4)
  }
}

struct TokenDefinition: Identifiable {
  let name: String
  let value: String
  let purpose: String

  var id: String { name }
}

struct TokenDefinitionTable: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast

  let tokens: [TokenDefinition]

  var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 0) {
      GridRow {
        Text("Token")
        Text("Value")
        Text("Purpose")
      }
      .font(.caption.weight(.semibold))
      .foregroundStyle(colors.contentSecondary)
      .padding(.bottom, 8)

      Divider().gridCellColumns(3)

      ForEach(tokens) { token in
        GridRow {
          Text(token.name)
            .font(.system(.callout, design: .monospaced, weight: .medium))
          Text(token.value)
            .font(.callout.monospacedDigit())
            .foregroundStyle(colors.contentSecondary)
          Text(token.purpose)
            .font(.callout)
            .foregroundStyle(colors.contentSecondary)
        }
        .padding(.vertical, 9)

        Divider().gridCellColumns(3)
      }
    }
  }
}

struct UsageRulesView: View {
  let use: [String]
  let avoid: [String]

  var body: some View {
    HStack(alignment: .top, spacing: 28) {
      RuleColumn(title: "Use", symbol: "checkmark.circle.fill", rules: `use`, color: .green)
      RuleColumn(title: "Avoid", symbol: "xmark.circle.fill", rules: avoid, color: .orange)
    }
  }
}

private struct RuleColumn: View {
  let title: String
  let symbol: String
  let rules: [String]
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label(title, systemImage: symbol)
        .font(.headline)
        .foregroundStyle(color)

      ForEach(rules, id: \.self) { rule in
        Text("• \(rule)")
          .font(.callout)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
