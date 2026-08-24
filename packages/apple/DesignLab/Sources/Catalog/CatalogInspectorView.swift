import SwiftUI
import SynapseDesignSystem

@MainActor
struct CatalogInspectorView: View {
  @Bindable var theme: SynapseTheme
  @Bindable var catalog: CatalogModel

  init(theme: SynapseTheme, catalog: CatalogModel) {
    self.theme = theme
    self.catalog = catalog
  }

  var body: some View {
    Form {
      Section("Preview environment") {
        Picker("Appearance", selection: $catalog.appearance) {
          ForEach(LabAppearance.allCases) { mode in
            Text(mode.title).tag(mode)
          }
        }

        Toggle("Increased contrast", isOn: $theme.increasedContrastOverride)

        Picker("Type scale", selection: $catalog.typeScale) {
          ForEach(CatalogTypeScale.allCases) { scale in
            Text(scale.title).tag(scale)
          }
        }
      }

      Section("Foundation tokens") {
        Picker("Content accent", selection: $theme.accent) {
          ForEach(SynapseAccent.allCases) { accent in
            Text(accent.title).tag(accent)
          }
        }

        Picker("Density", selection: $theme.density) {
          ForEach(SynapseDensity.allCases) { density in
            Text(density.title).tag(density)
          }
        }

        ValueSlider(
          title: "Spacing scale",
          value: $theme.spacingScale,
          range: 0.8...1.25,
          step: 0.05,
          format: { String(format: "%.2f×", $0) }
        )

        ValueSlider(
          title: "Corner scale",
          value: $theme.cornerScale,
          range: 0.75...1.5,
          step: 0.05,
          format: { String(format: "%.2f×", $0) }
        )
      }

      contextualControls

      Section {
        Button("Reset catalog values", action: resetCatalog)
      }
    }
    .formStyle(.grouped)
    .scrollContentBackground(.hidden)
    .navigationTitle("Inspector")
  }

  @ViewBuilder
  private var contextualControls: some View {
    switch catalog.selection {
    case .buttons:
      Section("Button state") {
        Picker("Role", selection: $catalog.buttonRole) {
          Text("Primary").tag(SynapseButtonRole.primary)
          Text("Secondary").tag(SynapseButtonRole.secondary)
          Text("Quiet").tag(SynapseButtonRole.quiet)
        }
        Toggle("Enabled", isOn: $catalog.componentEnabled)
        Toggle("Loading", isOn: $catalog.componentLoading)
      }
    case .iconButtons:
      Section("Icon button state") {
        Toggle("Enabled", isOn: $catalog.componentEnabled)
      }
    case .documentRows:
      Section("Document row state") {
        Toggle("Selected", isOn: $catalog.documentRowSelected)
      }
    case .statusBadges:
      Section("Status badge state") {
        Picker("Status", selection: $catalog.syncStatus) {
          ForEach(SynapseSyncStatus.allCases) { status in
            Text(status.title).tag(status)
          }
        }
      }
    case .workspace:
      Section("Workspace pattern") {
        Picker("Layout", selection: $catalog.viewport) {
          ForEach(ViewportPreset.allCases) { preset in
            Text(preset.title).tag(preset)
          }
        }

        Toggle("File sidebar", isOn: $catalog.workspaceShowsFiles)
          .disabled(catalog.viewport == .phone)

        Toggle("Document panel", isOn: $catalog.workspaceShowsPanel)
          .disabled(catalog.viewport != .desktop)

        Picker("Panel content", selection: $catalog.workspacePanel) {
          ForEach(SynapseWorkspacePanel.allCases) { panel in
            Text(panel.title).tag(panel)
          }
        }
        .disabled(catalog.viewport != .desktop || !catalog.workspaceShowsPanel)

        Picker("Sync state", selection: $catalog.syncStatus) {
          ForEach(SynapseSyncStatus.allCases) { status in
            Text(status.title).tag(status)
          }
        }

        ValueSlider(
          title: "Document width",
          value: $theme.documentWidth,
          range: 560...800,
          step: 20,
          format: { "\(Int($0)) pt" }
        )
      }

      Section("Material rule") {
        LabeledContent("Liquid Glass", value: "Neutral")
        Text("색유리는 기본 구성요소에서 사용하지 않습니다. 강조색은 콘텐츠 선택, 링크, 포커스, 상태에만 적용합니다.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    default:
      EmptyView()
    }
  }

  private func resetCatalog() {
    catalog.reset(theme: theme)
  }
}

private struct ValueSlider: View {
  let title: String
  @Binding var value: CGFloat
  let range: ClosedRange<CGFloat>
  let step: CGFloat
  let format: (CGFloat) -> String

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      LabeledContent(title) {
        Text(format(value))
          .monospacedDigit()
      }
      Slider(value: $value, in: range, step: step)
        .accessibilityLabel(title)
        .accessibilityValue(format(value))
    }
  }
}
