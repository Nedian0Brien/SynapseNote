import SwiftUI

/// Visual emphasis roles for SynapseNote buttons.
public enum SynapseButtonRole: String, CaseIterable, Identifiable, Sendable {
  case primary
  case secondary
  case quiet

  public var id: String { rawValue }

  /// A user-facing role name for catalog controls.
  public var title: String { rawValue.capitalized }
}

/// A semantic button style that preserves native button behavior and accessibility.
@MainActor
public struct SynapseButtonStyle: ButtonStyle {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast
  @Environment(\.isEnabled) private var isEnabled

  private let role: SynapseButtonRole

  public init(role: SynapseButtonRole) {
    self.role = role
  }

  public func makeBody(configuration: Configuration) -> some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    configuration.label
      .font(.system(.body, design: .default, weight: .semibold))
      .foregroundStyle(foreground(colors: colors))
      .padding(.horizontal, theme.spacing.medium)
      .frame(minHeight: theme.spacing.rowHeight)
      .background(background(colors: colors, isPressed: configuration.isPressed))
      .clipShape(RoundedRectangle(cornerRadius: theme.controlRadius, style: .continuous))
      .contentShape(Rectangle())
      .scaleEffect(configuration.isPressed ? 0.985 : 1)
      .opacity(isEnabled ? 1 : 0.44)
      .animation(SynapseMotion.selection, value: configuration.isPressed)
  }

  private func foreground(colors: SynapseColorRoles) -> Color {
    switch role {
    case .primary: .white
    case .secondary: colors.contentPrimary
    case .quiet: colors.contentSecondary
    }
  }

  private func background(colors: SynapseColorRoles, isPressed: Bool) -> Color {
    switch role {
    case .primary: colors.accent.opacity(isPressed ? 0.78 : 1)
    case .secondary: colors.elevatedSurface.opacity(isPressed ? 0.66 : 1)
    case .quiet: colors.accentSurface.opacity(isPressed ? 1 : 0)
    }
  }
}

extension ButtonStyle where Self == SynapseButtonStyle {
  /// Creates a SynapseNote button style with a semantic emphasis role.
  public static func synapse(_ role: SynapseButtonRole) -> SynapseButtonStyle {
    SynapseButtonStyle(role: role)
  }
}

/// A complete semantic button with built-in loading and disabled states.
@MainActor
public struct SynapseButton: View {
  private let title: LocalizedStringKey
  private let role: SynapseButtonRole
  private let isLoading: Bool
  private let action: () -> Void

  public init(
    _ title: LocalizedStringKey,
    role: SynapseButtonRole,
    isLoading: Bool = false,
    action: @escaping () -> Void
  ) {
    self.title = title
    self.role = role
    self.isLoading = isLoading
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      ZStack {
        Text(title)
          .opacity(isLoading ? 0 : 1)
        if isLoading {
          ProgressView()
            .controlSize(.small)
        }
      }
    }
    .buttonStyle(.synapse(role))
    .disabled(isLoading)
    .accessibilityValue(isLoading ? "로딩 중" : "")
  }
}

/// A compact native icon button for toolbars and contextual actions.
@MainActor
public struct SynapseIconButton: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast
  @Environment(\.isEnabled) private var isEnabled

  private let symbol: String
  private let accessibilityLabel: LocalizedStringKey
  private let action: () -> Void

  public init(
    symbol: String,
    accessibilityLabel: LocalizedStringKey,
    action: @escaping () -> Void
  ) {
    self.symbol = symbol
    self.accessibilityLabel = accessibilityLabel
    self.action = action
  }

  public var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 14, weight: .semibold))
        .frame(width: 32, height: 32)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .foregroundStyle(colors.contentSecondary)
    .background(colors.elevatedSurface.opacity(0.001))
    .clipShape(RoundedRectangle(cornerRadius: theme.controlRadius, style: .continuous))
    .opacity(isEnabled ? 1 : 0.38)
    .accessibilityLabel(accessibilityLabel)
  }
}
