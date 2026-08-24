import SwiftUI

/// Connection states shown consistently across SynapseNote surfaces.
public enum SynapseSyncStatus: String, CaseIterable, Identifiable, Sendable {
  case synced
  case syncing
  case offline
  case conflict

  public var id: String { rawValue }

  /// A user-facing status name.
  public var title: String {
    switch self {
    case .synced: "Synced"
    case .syncing: "Syncing"
    case .offline: "Offline"
    case .conflict: "Conflict"
    }
  }

  var symbol: String {
    switch self {
    case .synced: "checkmark.circle.fill"
    case .syncing: "arrow.trianglehead.2.clockwise.rotate.90"
    case .offline: "icloud.slash"
    case .conflict: "exclamationmark.triangle.fill"
    }
  }
}

/// A compact status indicator with text, color, and an accessible symbol.
@MainActor
public struct SynapseStatusBadge: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast

  private let status: SynapseSyncStatus

  public init(status: SynapseSyncStatus) {
    self.status = status
  }

  public var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)
    let foreground = statusColor(colors: colors)

    Label(status.title, systemImage: status.symbol)
      .font(SynapseTypography.metadata)
      .foregroundStyle(foreground)
      .padding(.horizontal, 9)
      .frame(minHeight: 26)
      .background(foreground.opacity(0.10))
      .clipShape(Capsule())
  }

  private func statusColor(colors: SynapseColorRoles) -> Color {
    switch status {
    case .synced: colors.accent
    case .syncing: colors.contentSecondary
    case .offline: colors.warning
    case .conflict: colors.destructive
    }
  }
}
