import Observation
import SwiftUI
import SynapseDesignSystem

@main
@MainActor
struct SynapseDesignLabApp: App {
  @State private var theme = SynapseTheme()

  var body: some Scene {
    WindowGroup("Synapse Design Lab") {
      DesignLabView(theme: theme)
        .frame(minWidth: 1100, minHeight: 760)
    }
    .defaultSize(width: 1480, height: 980)
    .windowResizability(.contentMinSize)
  }
}

@MainActor
private struct DesignLabView: View {
  @Bindable var theme: SynapseTheme

  @State private var viewport: ViewportPreset = .tablet
  @State private var appearance: LabAppearance = .light
  @State private var syncStatus: SynapseSyncStatus = .synced
  @State private var zoom: CGFloat = 1

  var body: some View {
    HSplitView {
      controls
        .frame(minWidth: 250, idealWidth: 270, maxWidth: 300)

      previewStage
        .frame(minWidth: 760)
    }
    .background(Color(nsColor: .underPageBackgroundColor))
  }

  private var controls: some View {
    Form {
      Section("Viewport") {
        Picker("Canvas", selection: $viewport) {
          ForEach(ViewportPreset.allCases) { preset in
            Text(preset.title).tag(preset)
          }
        }

        Picker("Zoom", selection: $zoom) {
          Text("75%").tag(CGFloat(0.75))
          Text("100%").tag(CGFloat(1))
          Text("125%").tag(CGFloat(1.25))
        }
      }

      Section("Appearance") {
        Picker("Mode", selection: $appearance) {
          ForEach(LabAppearance.allCases) { mode in
            Text(mode.title).tag(mode)
          }
        }

        Picker("Accent", selection: $theme.accent) {
          ForEach(SynapseAccent.allCases) { accent in
            Text(accent.title).tag(accent)
          }
        }

        Picker("Density", selection: $theme.density) {
          ForEach(SynapseDensity.allCases) { density in
            Text(density.title).tag(density)
          }
        }
      }

      Section("Document") {
        LabeledContent("Body width") {
          Text("\(Int(theme.documentWidth)) pt")
            .monospacedDigit()
        }
        Slider(value: $theme.documentWidth, in: 560...800, step: 20)

        Picker("Sync state", selection: $syncStatus) {
          ForEach(SynapseSyncStatus.allCases) { status in
            Text(status.title).tag(status)
          }
        }
      }

      Section {
        Button("Reset foundations") {
          theme.accent = .iris
          theme.density = .comfortable
          theme.documentWidth = 680
          appearance = .light
          syncStatus = .synced
          zoom = 1
        }
      }
    }
    .formStyle(.grouped)
  }

  private var previewStage: some View {
    ScrollView([.horizontal, .vertical]) {
      SynapseWorkspaceSurface(
        layout: viewport.layout,
        syncStatus: syncStatus
      )
      .synapseTheme(theme)
      .preferredColorScheme(appearance.colorScheme)
      .frame(width: viewport.size.width, height: viewport.size.height)
      .overlay {
        Rectangle()
          .stroke(Color.primary.opacity(0.12), lineWidth: 1)
      }
      .scaleEffect(zoom, anchor: .topLeading)
      .frame(
        width: viewport.size.width * zoom,
        height: viewport.size.height * zoom,
        alignment: .topLeading
      )
      .padding(48)
    }
    .background(Color(nsColor: .underPageBackgroundColor))
    .safeAreaInset(edge: .top) {
      HStack {
        Text(viewport.title)
          .font(.headline)
        Text("\(Int(viewport.size.width)) × \(Int(viewport.size.height)) pt")
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
        Spacer()
        Text("Native SwiftUI · Retina")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 18)
      .frame(height: 42)
      .background(.bar)
    }
  }
}

private enum LabAppearance: String, CaseIterable, Identifiable {
  case light
  case dark

  var id: String { rawValue }
  var title: String { rawValue.capitalized }
  var colorScheme: ColorScheme { self == .light ? .light : .dark }
}

private enum ViewportPreset: String, CaseIterable, Identifiable {
  case phone
  case tablet
  case desktop

  var id: String { rawValue }

  var title: String {
    switch self {
    case .phone: "iPhone Compact"
    case .tablet: "iPad Regular"
    case .desktop: "macOS Resizable"
    }
  }

  var size: CGSize {
    switch self {
    case .phone: CGSize(width: 390, height: 844)
    case .tablet: CGSize(width: 834, height: 1194)
    case .desktop: CGSize(width: 1280, height: 820)
    }
  }

  var layout: SynapseWorkspaceLayout {
    switch self {
    case .phone: .compact
    case .tablet: .split
    case .desktop: .desktop
    }
  }
}
