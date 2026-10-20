import AVKit
import PDFKit
import SwiftUI
import UniformTypeIdentifiers

/// Morrow's image node view (Media.ts `Image`): a picture from the vault, or a picture on the web shown only
/// when asked, so opening a page never contacts anyone.
struct ImageBlockView: View {
    let store: EditorStore
    let node: DocNode
    @State private var image: PlatformImage?
    @State private var missing = false
    @State private var remoteShown = false

    var body: some View {
        Group {
            if let fileId, !fileId.isEmpty {
                if let image {
                    picture(Image(platformImage: image), size: image.size)
                } else if missing {
                    note("This image is missing from your workspace.")
                } else {
                    RoundedRectangle(cornerRadius: 8).fill(.quaternary.opacity(0.5)).frame(height: 48)
                }
            } else if let src = node.attr("src")?.string, !src.isEmpty {
                remote(src)
            } else {
                note("This image is missing from your workspace.")
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel(alt.isEmpty ? "Image" : alt)
        .task(id: fileId) {
            guard let fileId, !fileId.isEmpty else { return }
            if let data = await store.fileData(fileId), let picture = PlatformImage(data: data) {
                image = picture
                missing = false
            } else {
                missing = true
            }
        }
    }

    private var fileId: String? { node.attr("fileId")?.string }
    private var alt: String { node.attr("alt")?.string ?? "" }

    /// `max-width: 100%`, `max-height: 80vh`, centred
    private func picture(_ view: Image, size: CGSize) -> some View {
        view.resizable()
            .scaledToFit()
            .frame(maxWidth: size.width, maxHeight: min(size.height, EditorMediaLayout.maxPictureHeight))
            .clipShape(.rect(cornerRadius: 8))
    }

    @ViewBuilder private func remote(_ src: String) -> some View {
        let web = src.lowercased().hasPrefix("https://")
        if web, remoteShown, let url = URL(string: src) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let loaded): loaded.resizable().scaledToFit().frame(maxHeight: EditorMediaLayout.maxPictureHeight).clipShape(.rect(cornerRadius: 8))
                case .failure: note("This image is missing from your workspace.")
                default: RoundedRectangle(cornerRadius: 8).fill(.quaternary.opacity(0.5)).frame(height: 48)
                }
            }
        } else {
            HStack(spacing: 10) {
                Text(web ? "Image from \(URL(string: src)?.host() ?? "the web")" : "Image not found: \(src)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                if web {
                    Button("Load image") { remoteShown = true }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 8))
    }
}

enum EditorMediaLayout {
    /// Morrow's `max-height: 80vh` for a picture
    @MainActor static var maxPictureHeight: CGFloat {
        #if os(iOS)
        let screen = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.screen }.first
        return (screen?.bounds.height ?? 1000) * 0.8
        #else
        return (NSScreen.main?.visibleFrame.height ?? 1000) * 0.8
        #endif
    }
}

extension Image {
    init(platformImage: PlatformImage) {
        #if os(iOS)
        self.init(uiImage: platformImage)
        #else
        self.init(nsImage: platformImage)
        #endif
    }
}

/// Morrow's file node view (Media.ts `FileAttachment`): the name, the size and Save a copy; sound, video and
/// PDFs play on the page above it
struct FileBlockView: View {
    let store: EditorStore
    let node: DocNode
    @State private var data: Data?
    @State private var missing = false

    var body: some View {
        if let kind = EditorEdits.mediaKind(name) {
            VStack(spacing: 0) {
                player(kind)
                Divider()
                row
            }
            .background(.background.secondary, in: .rect(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator))
            .clipShape(.rect(cornerRadius: 8))
            .task(id: fileId) { await load() }
        } else {
            row
                .background(.background.secondary, in: .rect(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator))
        }
    }

    private var fileId: String { node.attr("fileId")?.string ?? "" }
    private var name: String { node.attr("name")?.string ?? "file" }

    private var row: some View {
        HStack(spacing: 10) {
            Image(systemName: "doc")
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
            Text(name)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let size = node.attr("size")?.number {
                Text(EditorEdits.formatBytes(size))
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
            }
            Button("Save a copy") { saveCopy() }
                .buttonStyle(.borderless)
                .font(.subheadline)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    @ViewBuilder private func player(_ kind: EditorEdits.MediaKind) -> some View {
        if missing {
            EmptyView()
        } else if let data {
            switch kind {
            case .pdf: PDFBlock(data: data).frame(height: 560)
            case .audio: MediaPlayer(data: data, fileId: fileId, name: name, audio: true)
            case .video: MediaPlayer(data: data, fileId: fileId, name: name, audio: false).frame(height: 360)
            }
        } else {
            Color.clear.frame(height: kind == .audio ? 44 : 120)
        }
    }

    private func load() async {
        data = await store.fileData(fileId)
        missing = data == nil
    }

    /// Morrow's downloadFile
    private func saveCopy() {
        Task {
            guard let data = await store.fileData(fileId) else {
                store.controller.showToast("This file is missing from your workspace.", error: true)
                return
            }
            store.controller.exportFile = ExportFile(name: name, data: data)
        }
    }
}

/// a sound or video file played from a copy in the app's temporary folder, which AVKit reads by URL: a video
/// with the system's controls, a sound with play, its place and its length, as a browser's `<audio controls>`
private struct MediaPlayer: View {
    let data: Data
    let fileId: String
    let name: String
    let audio: Bool
    @State private var player: AVPlayer?
    @State private var playing = false
    @State private var position: Double = 0
    @State private var length: Double = 0
    @State private var observer: Any?

    var body: some View {
        Group {
            if audio {
                HStack(spacing: 12) {
                    Button(playing ? "Pause" : "Play", systemImage: playing ? "pause.fill" : "play.fill") { toggle() }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                        .disabled(player == nil)
                    Text(Self.time(position)).monospacedDigit().font(.caption).foregroundStyle(.secondary)
                    Slider(value: Binding(get: { position }, set: { seek($0) }), in: 0...max(length, 0.1))
                        .disabled(player == nil)
                        .accessibilityLabel("Position")
                    Text(Self.time(length)).monospacedDigit().font(.caption).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            } else if let player {
                VideoPlayer(player: player)
            } else {
                Color.black.opacity(0.06)
            }
        }
        .task(id: fileId) {
            let folder = FileManager.default.temporaryDirectory.appending(path: "media", directoryHint: .isDirectory)
            let safe = fileId.map { $0.isLetter || $0.isNumber ? $0 : "-" }
            let url = folder.appending(path: String(safe) + "." + (name as NSString).pathExtension)
            let data = data
            let written = await Task.detached { () -> Bool in
                try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                return (try? data.write(to: url, options: .atomic)) != nil
            }.value
            guard written else { return }
            let player = AVPlayer(url: url)
            if audio {
                length = (try? await player.currentItem?.asset.load(.duration).seconds).flatMap { $0.isFinite ? $0 : nil } ?? 0
                observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { time in
                    MainActor.assumeIsolated {
                        position = time.seconds
                        if let item = player.currentItem, time >= item.duration { playing = false }
                    }
                }
            }
            self.player = player
        }
        .onDisappear {
            player?.pause()
            if let observer { player?.removeTimeObserver(observer) }
            observer = nil
        }
    }

    private func toggle() {
        guard let player else { return }
        if playing {
            player.pause()
        } else {
            if let item = player.currentItem, player.currentTime() >= item.duration { player.seek(to: .zero) }
            player.play()
        }
        playing.toggle()
    }

    private func seek(_ seconds: Double) {
        position = seconds
        player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
    }

    /// minutes and seconds, as a media element shows them
    static func time(_ seconds: Double) -> String {
        let whole = Int(seconds.isFinite ? max(0, seconds) : 0)
        return String(format: "%d:%02d", whole / 60, whole % 60)
    }
}

private struct PDFBlock {
    let data: Data

    func makeDocument() -> PDFDocument? { PDFDocument(data: data) }
}

#if os(iOS)
extension PDFBlock: UIViewRepresentable {
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.document = makeDocument()
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {}
}
#else
extension PDFBlock: NSViewRepresentable {
    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.document = makeDocument()
        return view
    }

    func updateNSView(_ view: PDFView, context: Context) {}
}
#endif

/// Morrow's rawBlock node view (Extras.ts `RawBlock`): markdown or HTML kept exactly as written, opened as
/// written with a double tap
struct RawBlockView: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path

    var body: some View {
        Text(node.attr("text")?.string ?? "")
            .font(.system(size: 13.5, design: .monospaced))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .overlay(alignment: .topLeading) {
                Text("Kept as written")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 6)
                    .background(.background)
                    .offset(x: 10, y: -7)
            }
            .contentShape(.rect)
            .onTapGesture(count: 2) { store.editRaw(path) }
            .accessibilityAction(named: "Edit as written") { store.editRaw(path) }
    }
}

/// a formula block as tiptap's BlockMath draws it with KaTeX's display mode, centred; tapping opens it
struct MathBlockView: View {
    let store: EditorStore
    let node: DocNode
    let path: EditorEdits.Path
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let latex = node.attr("latex")?.string ?? ""
        let size = EditorStyle.bodySize(store.controller.preferences.font)
        Group {
            if latex.isEmpty {
                Text("Empty formula, click to write one")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity)
            } else {
                // centred, scrolling sideways when wider than the page (`overflow-x: auto`)
                ViewThatFits(in: .horizontal) {
                    RenderedMath(latex: latex, display: true, size: size, dark: colorScheme == .dark)
                        .fixedSize()
                        .frame(maxWidth: .infinity)
                    ScrollView(.horizontal) {
                        RenderedMath(latex: latex, display: true, size: size, dark: colorScheme == .dark).fixedSize()
                    }
                }
            }
        }
        .frame(minHeight: size * 1.6)
        .padding(.vertical, 6)
        .contentShape(.rect)
        .onTapGesture { store.editFormula(path) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(latex.isEmpty ? "Empty formula" : "Formula \(latex)")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { store.editFormula(path) }
    }
}

/// a formula or diagram from the web renderer: its picture when drawn, the source text while it is drawn or
/// when it could not be
struct RenderedMath: View {
    let latex: String
    let display: Bool
    let size: CGFloat
    let dark: Bool

    var body: some View {
        let renderer = WebRenderer.shared
        let _ = renderer.version
        switch renderer.result(.init(kind: .math(display: display), source: latex, size: size, dark: dark)) {
        case .image(let image, _):
            Image(platformImage: image)
                .resizable()
                .frame(width: image.size.width, height: image.size.height)
        case .failed:
            Text(latex)
                .font(.system(size: size * 0.85, design: .monospaced))
                .foregroundStyle(Color(EditorStyle.highlight(.deletion)))
        case nil:
            Text(latex)
                .font(.system(size: size * 0.85, design: .monospaced))
                .foregroundStyle(.tertiary)
        }
    }
}

/// a Mermaid code block's diagram (Extras.ts CodeBlock): drawn 350 ms after the code last changed
struct DiagramView: View {
    let source: String
    let width: CGFloat
    @Environment(\.colorScheme) private var colorScheme
    @State private var drawn = ""

    var body: some View {
        let renderer = WebRenderer.shared
        let _ = renderer.version
        Group {
            if drawn.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || width <= 0 {
                // a view that is there, so the task below runs
                Color.clear.frame(height: 0)
            } else {
                switch renderer.result(.init(kind: .diagram, source: drawn, size: 14, dark: colorScheme == .dark, width: width)) {
                case .image(let image, _):
                    Image(platformImage: image)
                        .resizable()
                        .frame(width: image.size.width, height: image.size.height)
                        .frame(maxWidth: .infinity)
                        .padding(16)
                case .failed(let message):
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(Color(EditorStyle.highlight(.deletion)))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                case nil:
                    ProgressView().padding(16).frame(maxWidth: .infinity)
                }
            }
        }
        .task(id: source) {
            if drawn.isEmpty {
                drawn = source
                return
            }
            try? await Task.sleep(for: .milliseconds(350))
            if !Task.isCancelled { drawn = source }
        }
    }
}

/// Morrow's SourceDialog: a formula with a live preview, or markdown kept as written; Cmd Return saves
struct SourceEditSheet: View {
    let store: EditorStore
    let edit: EditorStore.SourceEdit
    @State private var text: String
    @State private var previewed: String
    @FocusState private var typing: Bool
    @Environment(\.colorScheme) private var colorScheme

    init(store: EditorStore, edit: EditorStore.SourceEdit) {
        self.store = store
        self.edit = edit
        _text = State(initialValue: edit.value)
        _previewed = State(initialValue: edit.value)
    }

    @ViewBuilder private var preview: some View {
        if !JSText.trim(previewed).isEmpty {
            RenderedMath(latex: previewed, display: edit.display, size: 16, dark: colorScheme == .dark)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(edit.title).font(.headline)
            TextEditor(text: $text)
                .focused($typing)
                .font(.system(size: 13, design: .monospaced))
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                // Morrow's textarea: 4 rows for a formula, 10 for markdown
                .frame(height: edit.latex ? 96 : 220)
                .scrollContentBackground(.hidden)
                .padding(6)
                .background(.background.secondary, in: .rect(cornerRadius: 8))
                .overlay(alignment: .topLeading) {
                    if text.isEmpty, edit.latex {
                        Text("e = mc^2")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 14)
                            .allowsHitTesting(false)
                    }
                }
                .accessibilityLabel(edit.latex ? "Formula in LaTeX" : "Markdown")
            // the box stays while the text is empty, so the sheet keeps its size
            if edit.latex {
                // `.math-preview`, centred; the sheet is sized once as it opens, so the preview has a set height and
                // scrolls when a formula is larger
                ViewThatFits(in: [.horizontal, .vertical]) {
                    preview
                        .fixedSize()
                        .padding(12)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    ScrollView([.horizontal, .vertical]) {
                        preview
                            .fixedSize()
                            .padding(12)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 120)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator))
                .accessibilityLabel("Preview")
            }
            HStack {
                Text("⌘↩ to save").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("Cancel", role: .cancel) { store.sourceEdit = nil }
                    .keyboardShortcut(.cancelAction)
                Button("Save") { store.saveSource(edit, text) }
                    .keyboardShortcut(.return, modifiers: .command)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .frame(minWidth: 420)
        .presentationSizing(.fitted)
        // the text is ready for typing as the dialog opens (data-autofocus)
        .onAppear { typing = true }
        .task(id: text) {
            // the preview follows the text a moment after typing pauses, so each key does not draw a formula
            try? await Task.sleep(for: .milliseconds(150))
            if !Task.isCancelled { previewed = text }
        }
    }
}
