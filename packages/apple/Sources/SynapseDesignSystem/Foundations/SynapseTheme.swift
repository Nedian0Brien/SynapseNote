import Observation
import SwiftUI

/// The restrained accent families available to SynapseNote surfaces.
public enum SynapseAccent: String, CaseIterable, Identifiable, Sendable {
  case iris
  case teal
  case copper

  public var id: String { rawValue }

  /// A user-facing name for design-lab controls.
  public var title: String {
    switch self {
    case .iris: "Iris"
    case .teal: "Teal"
    case .copper: "Copper"
    }
  }

  var color: Color {
    switch self {
    case .iris: Color(red: 0.35, green: 0.31, blue: 0.82)
    case .teal: Color(red: 0.10, green: 0.52, blue: 0.48)
    case .copper: Color(red: 0.72, green: 0.34, blue: 0.18)
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

  public init(
    accent: SynapseAccent = .iris,
    density: SynapseDensity = .comfortable,
    documentWidth: CGFloat = 680
  ) {
    self.accent = accent
    self.density = density
    self.documentWidth = documentWidth
  }

  /// Resolves semantic colors for the current system appearance and contrast.
  public func colors(
    for colorScheme: ColorScheme,
    contrast: ColorSchemeContrast
  ) -> SynapseColorRoles {
    let highContrast = contrast == .increased
    let accentColor = accent.color

    if colorScheme == .dark {
      return SynapseColorRoles(
        canvas: Color(red: 0.075, green: 0.075, blue: 0.07),
        sidebar: Color(red: 0.105, green: 0.105, blue: 0.10),
        elevatedSurface: Color(red: 0.145, green: 0.145, blue: 0.14),
        contentPrimary: .white.opacity(highContrast ? 1 : 0.94),
        contentSecondary: .white.opacity(highContrast ? 0.78 : 0.60),
        separator: .white.opacity(highContrast ? 0.22 : 0.10),
        accent: accentColor,
        accentSurface: accentColor.opacity(highContrast ? 0.28 : 0.18),
        warning: Color(red: 0.95, green: 0.65, blue: 0.22),
        destructive: Color(red: 0.96, green: 0.37, blue: 0.34)
      )
    }

    return SynapseColorRoles(
      canvas: Color(red: 0.985, green: 0.983, blue: 0.975),
      sidebar: Color(red: 0.955, green: 0.952, blue: 0.94),
      elevatedSurface: .white,
      contentPrimary: .black.opacity(highContrast ? 1 : 0.88),
      contentSecondary: .black.opacity(highContrast ? 0.72 : 0.52),
      separator: .black.opacity(highContrast ? 0.20 : 0.08),
      accent: accentColor,
      accentSurface: accentColor.opacity(highContrast ? 0.18 : 0.11),
      warning: Color(red: 0.72, green: 0.42, blue: 0.05),
      destructive: Color(red: 0.76, green: 0.16, blue: 0.14)
    )
  }

  /// Resolves the spacing scale for the current density.
  public var spacing: SynapseSpacing {
    switch density {
    case .comfortable:
      SynapseSpacing(
        xSmall: 6,
        small: 10,
        medium: 16,
        large: 24,
        xLarge: 36,
        rowHeight: 42
      )
    case .compact:
      SynapseSpacing(
        xSmall: 4,
        small: 8,
        medium: 12,
        large: 18,
        xLarge: 28,
        rowHeight: 34
      )
    }
  }
}

extension View {
  /// Installs a SynapseNote theme and its tint for a complete view subtree.
  public func synapseTheme(_ theme: SynapseTheme) -> some View {
    environment(theme)
      .tint(theme.accent.color)
  }
}
