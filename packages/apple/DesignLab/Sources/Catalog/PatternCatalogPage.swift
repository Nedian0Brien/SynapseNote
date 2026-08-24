import SwiftUI
import SynapseDesignSystem

@MainActor
struct WorkspaceCatalogPage: View {
  let catalog: CatalogModel

  var body: some View {
    GeometryReader { proxy in
      SynapseWorkspaceSurface(
        layout: catalog.viewport.layout,
        syncStatus: catalog.syncStatus,
        showsFileSidebar: catalog.workspaceShowsFiles,
        showsAssistantPanel: catalog.workspaceShowsPanel,
        selectedPanel: catalog.workspacePanel
      )
      .frame(width: proxy.size.width, height: proxy.size.height)
      .clipped()
    }
  }
}
