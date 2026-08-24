import Observation
import SwiftUI

/// The restrained accent families available to SynapseNote surfaces.
public enum SynapseAccent: String, CaseIterable, Identifiable, Sendable {
  case system
  case teal
  case indigo
  case orange

  public var id: String { rawValue }

  /// A user-facing name for design-lab controls.
  public var title: String {
    switch self {
    case .system: "System"
    case .teal: "Teal"
    case .indigo: "Indigo"
    case .orange: "Orange"
    }
  }

  /// The resolved accent color used by the current theme.
  public var color: Color {
    switch self {
    case .system: .accentColor
    case .teal: .teal
    case .indigo: .indigo
    case .orange: .orange
    }
  }
}

/// The two supported information-density contracts.
public enum SynapseDensity: String, CaseIterable, Identifiable, Sendable {
  case comfortable
  case compact

  public var id: String { rawValue }

  /// A user-facing name for design-lab controls.
  public var title: String {
    switch self {
    case .comfortable: "Comfortable"
    case .compact: "Compact"
    }
  }
}

/// Semantic colors used by every SynapseNote component.
public struct SynapseColorRoles {
  public let canvas: Color
  public let sidebar: Color
  public let elevatedSurface: Color
  public let contentPrimary: Color
  public let contentSecondary: Color
  public let separator: Color
  public let accent: Color
  public let accentSurface: Color
  public let warning: Color
  public let destructive: Color
}

/// Semantic spacing values that vary together with interface density.
public struct SynapseSpacing: Sendable {
  public let xSmall: CGFloat
  public let small: CGFloat
  public let medium: CGFloat
  public let large: CGFloat
  public let xLarge: CGFloat
  public let rowHeight: CGFloat
}

/// Mutable design-lab settings injected once at the application root.
@MainActor
@Observable
public final class SynapseTheme {
  public var accent: SynapseAccent
  public var density: SynapseDensity
  public var documentWidth: CGFloat
  public var spacingScale: CGFloat
  public var cornerScale: CGFloat
  public var increasedContrastOverride: Bool

  public init(
    accent: SynapseAccent = .system,
    density: SynapseDensity = .compact,
    documentWidth: CGFloat = 720,
    spacingScale: CGFloat = 1,
    cornerScale: CGFloat = 1,
    increasedContrastOverride: Bool = false
  ) {
    self.accent = accent
    self.density = density
    self.documentWidth = documentWidth
    self.spacingScale = spacingScale
    self.cornerScale = cornerScale
    self.increasedContrastOverride = increasedContrastOverride
  }

  /// Resolves semantic colors for the current system appearance and contrast.
  public func colors(
    for colorScheme: ColorScheme,
    contrast: ColorSchemeContrast
  ) -> SynapseColorRoles {
    let highContrast = contrast == .increased || increasedContrastOverride
    let accentColor = accent.color

    return SynapseColorRoles(
      canvas: SynapsePlatformColor.canvas,
      sidebar: SynapsePlatformColor.sidebar,
      elevatedSurface: SynapsePlatformColor.elevatedSurface,
      contentPrimary: .primary,
      contentSecondary: .secondary,
      separator: SynapsePlatformColor.separator.opacity(highContrast ? 1 : 0.72),
      accent: accentColor,
      accentSurface: accentColor.opacity(highContrast ? 0.22 : 0.14),
      warning: .orange,
      destructive: .red
    )
  }

  /// Resolves the spacing scale for the current density.
  public var spacing: SynapseSpacing {
    let base =
      switch density {
      case .comfortable:
        SynapseSpacing(
          xSmall: 5,
          small: 8,
          medium: 14,
          large: 20,
          xLarge: 30,
          rowHeight: 36
        )
      case .compact:
        SynapseSpacing(
          xSmall: 3,
          small: 6,
          medium: 10,
          large: 16,
          xLarge: 24,
          rowHeight: 28
        )
      }

    return SynapseSpacing(
      xSmall: base.xSmall * spacingScale,
      small: base.small * spacingScale,
      medium: base.medium * spacingScale,
      large: base.large * spacingScale,
      xLarge: base.xLarge * spacingScale,
      rowHeight: base.rowHeight * spacingScale
    )
  }

  /// The resolved corner radius for compact controls.
  public var controlRadius: CGFloat { SynapseCorner.control * cornerScale }

  /// The resolved corner radius for contained panels.
  public var panelRadius: CGFloat { SynapseCorner.panel * cornerScale }

  /// The resolved corner radius for selection outlines.
  public var selectionRadius: CGFloat { SynapseCorner.selection * cornerScale }
}

extension View {
  /// Installs a SynapseNote theme without tinting system materials globally.
  ///
  /// Accent is applied locally to selection, focus, links, and status. Keeping it
  /// out of the root environment prevents neutral Liquid Glass controls from
  /// becoming stained glass as an accidental side effect of theme selection.
  public func synapseTheme(_ theme: SynapseTheme) -> some View {
    environment(theme)
  }
}
