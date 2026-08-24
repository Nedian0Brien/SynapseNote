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
}
