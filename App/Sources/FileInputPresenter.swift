import Foundation
import os
import UniformTypeIdentifiers
import WebKit
#if os(macOS)
import AppKit
#endif

/// Shows the system file picker when the editor page asks for files, such as the slash menu's image item.
/// Picked files are copied to a temporary folder first, so the web content can read them without needing
/// access to wherever they came from.
@MainActor
final class FileInputPresenter: WebPage.DialogPresenting {
    /// Set while the iOS picker is up; the view presents a file importer for it.
    struct Request: Identifiable {
        let id = UUID()
        let allowsMultiple: Bool
        let continuation: CheckedContinuation<[URL]?, Never>
    }

    var onRequest: (Request?) -> Void = { _ in }
    private let logger = Logger(subsystem: "com.synapsenote.native", category: "files")

    func handleFileInputPrompt(parameters: WKOpenPanelParameters, initiatedBy frame: WebPage.FrameInfo) async -> WebPage.FileInputPromptResult {
        let picked = await pick(allowsMultiple: parameters.allowsMultipleSelection)
        logger.notice("file input: \(picked?.count ?? 0, privacy: .public) picked")
        guard let picked, !picked.isEmpty else { return .cancel }
        let copies = picked.compactMap(Self.temporaryCopy)
        if copies.count < picked.count { logger.error("file input: \(picked.count - copies.count, privacy: .public) could not be copied") }
        return copies.isEmpty ? .cancel : .selected(copies)
    }

    private func pick(allowsMultiple: Bool) async -> [URL]? {
        #if os(macOS)
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = allowsMultiple
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        guard await panel.begin() == .OK else { return nil }
        return panel.urls
        #else
        return await withCheckedContinuation { continuation in
            onRequest(Request(allowsMultiple: allowsMultiple, continuation: continuation))
        }
        #endif
    }

    private static func temporaryCopy(_ url: URL) -> URL? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let folder = FileManager.default.temporaryDirectory.appending(path: "picked-\(UUID().uuidString)")
        let copy = folder.appending(path: url.lastPathComponent)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: url, to: copy)
            return copy
        } catch {
            return nil
        }
    }
}
