import SwiftUI
import SynapseDesignSystem

@MainActor
struct DesignSystemCatalogView: View {
  let theme: SynapseTheme
  let catalog: CatalogModel

  var body: some View {
    HSplitView {
      CatalogSidebarView(catalog: catalog)
        .frame(minWidth: 210, idealWidth: 230, maxWidth: 260)

      CatalogCanvasView(catalog: catalog)
        .frame(minWidth: 640)

      CatalogInspectorView(theme: theme, catalog: catalog)
        .frame(minWidth: 270, idealWidth: 300, maxWidth: 340)
    }
    .synapseTheme(theme)
    .background(Color(nsColor: .windowBackgroundColor))
  }
}
