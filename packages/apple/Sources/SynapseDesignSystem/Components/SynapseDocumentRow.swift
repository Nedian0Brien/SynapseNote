import Foundation
import SwiftUI

/// A stable document summary shared by navigation components and previews.
public struct SynapseDocumentSummary: Identifiable, Hashable, Sendable {
  public let id: UUID
  public let title: String
  public let location: String
  public let modifiedLabel: String
  public let symbol: String

  public init(
    id: UUID,
    title: String,
    location: String,
    modifiedLabel: String,
    symbol: String = "doc.text"
  ) {
    self.id = id
    self.title = title
    self.location = location
    self.modifiedLabel = modifiedLabel
    self.symbol = symbol
  }
}

/// A selectable document row with stable geometry across selection states.
@MainActor
public struct SynapseDocumentRow: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast

  private let document: SynapseDocumentSummary
  private let isSelected: Bool

  public init(document: SynapseDocumentSummary, isSelected: Bool) {
    self.document = document
    self.isSelected = isSelected
  }

  public var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    HStack(spacing: theme.spacing.small) {
      Image(systemName: document.symbol)
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(isSelected ? colors.accent : colors.contentSecondary)
        .frame(width: 20)

      VStack(alignment: .leading, spacing: 2) {
        Text(document.title)
          .font(isSelected ? SynapseTypography.navigationEmphasized : SynapseTypography.navigation)
          .foregroundStyle(colors.contentPrimary)
          .lineLimit(1)

        if theme.density == .comfortable {
          Text(document.modifiedLabel)
            .font(SynapseTypography.metadata)
            .foregroundStyle(colors.contentSecondary)
            .lineLimit(1)
        }
      }

      Spacer(minLength: theme.spacing.small)
    }
    .padding(.horizontal, theme.spacing.small)
    .frame(minHeight: theme.spacing.rowHeight)
    .background(isSelected ? colors.accentSurface : .clear)
    .clipShape(RoundedRectangle(cornerRadius: theme.controlRadius, style: .continuous))
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}
