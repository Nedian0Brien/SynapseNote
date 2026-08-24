import SwiftUI
import SynapseDesignSystem

@MainActor
struct DesignSystemCatalogView: View {
  @Bindable var catalog: CatalogModel
  let theme: SynapseTheme

  @State private var inspectorPresented = true

  init(theme: SynapseTheme, catalog: CatalogModel) {
    self.theme = theme
    self.catalog = catalog
  }

  var body: some View {
    NavigationSplitView {
      CatalogSidebarView(catalog: catalog)
        .navigationSplitViewColumnWidth(min: 190, ideal: 224, max: 280)
    } detail: {
      CatalogCanvasView(catalog: catalog)
        .navigationTitle(catalog.selection.title)
        .toolbar {
          ToolbarItemGroup(placement: .primaryAction) {
            Picker("Appearance", selection: $catalog.appearance) {
              Image(systemName: "sun.max").tag(LabAppearance.light)
              Image(systemName: "moon").tag(LabAppearance.dark)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 72)

            Button {
              inspectorPresented.toggle()
            } label: {
              Label("Inspector", systemImage: "sidebar.right")
            }
            .help(inspectorPresented ? "Hide Inspector" : "Show Inspector")
          }
        }
        .inspector(isPresented: $inspectorPresented) {
          CatalogInspectorView(theme: theme, catalog: catalog)
            .inspectorColumnWidth(min: 260, ideal: 292, max: 360)
        }
    }
    .navigationSplitViewStyle(.balanced)
    .synapseTheme(theme)
  }
}
