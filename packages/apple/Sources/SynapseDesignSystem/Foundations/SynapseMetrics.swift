import SwiftUI

/// Shared shape values for controls and product surfaces.
public enum SynapseCorner {
  public static let control: CGFloat = 10
  public static let panel: CGFloat = 14
  public static let selection: CGFloat = 8
}

/// Shared type roles for application chrome and long-form documents.
public enum SynapseTypography {
  public static let documentTitle = Font.system(.largeTitle, design: .default, weight: .semibold)
  public static let documentBody = Font.system(.body, design: .default)
  public static let metadata = Font.system(.caption, design: .default, weight: .medium)
  public static let navigation = Font.system(.body, design: .default)
  public static let navigationEmphasized = Font.system(.body, design: .default, weight: .semibold)
  public static let code = Font.system(.callout, design: .monospaced)
}

/// Shared motion contracts that remain meaningful when Reduce Motion is enabled.
public enum SynapseMotion {
  public static let revealDuration: TimeInterval = 0.32
  public static let selectionDuration: TimeInterval = 0.16
  public static let reveal = Animation.spring(duration: revealDuration, bounce: 0.06)
  public static let selection = Animation.easeOut(duration: selectionDuration)
}
