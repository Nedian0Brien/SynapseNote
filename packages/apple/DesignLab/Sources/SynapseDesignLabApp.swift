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
        .frame(minWidth: 1180, minHeight: 760)
    }
    .defaultSize(width: 1520, height: 980)
    .windowResizability(.contentMinSize)
    .commands {
      InspectorCommands()
    }
  }
}
