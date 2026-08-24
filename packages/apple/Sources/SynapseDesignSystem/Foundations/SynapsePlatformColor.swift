import SwiftUI

#if os(macOS)
  import AppKit
#elseif os(iOS)
  import UIKit
#endif

enum SynapsePlatformColor {
  static var canvas: Color {
    #if os(macOS)
      Color(nsColor: .windowBackgroundColor)
    #elseif os(iOS)
      Color(uiColor: .systemBackground)
    #endif
  }

  static var sidebar: Color {
    #if os(macOS)
      Color(nsColor: .underPageBackgroundColor)
    #elseif os(iOS)
      Color(uiColor: .secondarySystemBackground)
    #endif
  }

  static var elevatedSurface: Color {
    #if os(macOS)
      Color(nsColor: .controlBackgroundColor)
    #elseif os(iOS)
      Color(uiColor: .tertiarySystemBackground)
    #endif
  }

  static var separator: Color {
    #if os(macOS)
      Color(nsColor: .separatorColor)
    #elseif os(iOS)
      Color(uiColor: .separator)
    #endif
  }
}
