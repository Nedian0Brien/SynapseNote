import Testing

@testable import SynapseDesignSystem

@MainActor
struct ThemeContractTests {
  @Test
  func comfortableDensityIsStrictlyMoreSpaciousThanCompact() {
    let theme = SynapseTheme(density: .comfortable)
    let comfortable = theme.spacing
    theme.density = .compact
    let compact = theme.spacing

    #expect(comfortable.medium > compact.medium)
    #expect(comfortable.large > compact.large)
    #expect(comfortable.rowHeight > compact.rowHeight)
  }

  @Test
  func documentWidthStartsInsideTheSupportedLabRange() {
    let theme = SynapseTheme()
    #expect((560...800).contains(theme.documentWidth))
  }

  @Test
  func tokenScalesResolveAcrossComponents() {
    let theme = SynapseTheme(spacingScale: 1.25, cornerScale: 0.75)

    #expect(theme.spacing.medium == 20)
    #expect(abs(theme.controlRadius - SynapseCorner.control * 0.75) < 0.001)
    #expect(abs(theme.panelRadius - SynapseCorner.panel * 0.75) < 0.001)
  }
}
