import SwiftUI
import SynapseDesignSystem

@main
@MainActor
struct SynapseDesignLabApp: App {
  @State private var theme = SynapseTheme()
  @State private var catalog = CatalogModel()

  var body: some Scene {
    WindowGroup("Synapse Design System") {
      DesignSystemCatalogView(theme: theme, catalog: catalog)
        .frame(minWidth: 1320, minHeight: 820)
    }
    .defaultSize(width: 1760, height: 1020)
    .windowResizability(.contentMinSize)
    .commands {
      InspectorCommands()
    }
  }
}
