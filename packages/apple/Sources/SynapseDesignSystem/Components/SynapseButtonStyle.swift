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

/// A semantic action that delegates rendering and interaction to native button styles.
///
/// Liquid Glass remains neutral and belongs to window chrome. Product emphasis
/// comes from native control hierarchy, not from repeatedly tinting glass.
@MainActor
public struct SynapseButton: View {
  @Environment(SynapseTheme.self) private var theme

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
    switch role {
    case .primary:
      nativeButton
        .buttonStyle(.borderedProminent)
    case .secondary:
      nativeButton
        .buttonStyle(.bordered)
    case .quiet:
      nativeButton
        .buttonStyle(.borderless)
    }
  }

  private var nativeButton: some View {
    Button(action: action) {
      HStack(spacing: 7) {
        if isLoading {
          ProgressView()
            .controlSize(.small)
        }
        Text(title)
      }
      .frame(minWidth: 72)
    }
    .controlSize(theme.density == .compact ? .small : .regular)
    .disabled(isLoading)
    .accessibilityValue(isLoading ? "로딩 중" : "")
  }
}

/// A compact native button for toolbars and contextual actions.
@MainActor
public struct SynapseIconButton: View {
  @Environment(SynapseTheme.self) private var theme

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
    Button(action: action) {
      Image(systemName: symbol)
        .frame(minWidth: 16, minHeight: 16)
    }
    .buttonStyle(.borderless)
    .controlSize(theme.density == .compact ? .small : .regular)
    .accessibilityLabel(accessibilityLabel)
  }
}
