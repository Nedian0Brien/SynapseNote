import SwiftUI
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

/// A file Morrow saves, such as an export or a backup, waiting for the person to say where it goes.
struct ExportFile: Identifiable {
    let id = UUID()
    let name: String
    let data: Data
    /// Shown once the file is saved, as Morrow's desktop app does after a PDF.
    var savedMessage: ((String) -> String)? = nil

    /// The type the file's extension names, plain data when the system does not know it.
    var contentType: UTType {
        UTType(filenameExtension: (name as NSString).pathExtension) ?? .data
    }

    /// A file name the file systems accept, as Morrow's desktop app makes one for a PDF: characters they
    /// refuse become spaces, at most 120 characters, "Page" when nothing is left.
    static func safeName(_ title: String) -> String {
        let refused = CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)
        let parts = title.components(separatedBy: refused)
        let joined = parts.filter { !$0.isEmpty }.joined(separator: " ")
        let trimmed = String(joined.trimmingCharacters(in: .whitespaces).prefix(120)).trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "Page" : trimmed
    }
}

/// The bytes of an `ExportFile` for the system's save sheet.
struct ExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [] }
    /// Every type Morrow saves: zip archives, JSON backups, Markdown, PDF, and attachments of any type.
    static var writableContentTypes: [UTType] {
        [.zip, .json, .pdf, .plainText, UTType(filenameExtension: "md") ?? .plainText, .image, .data]
    }

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        throw CocoaError(.featureUnsupported)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

#if os(macOS)
enum SavePanel {
    /// Asks where to keep a file, in Documents unless the person picks elsewhere, as Morrow's desktop app
    /// does for downloads. Returns the name it was saved under, nil when cancelled.
    @MainActor
    static func save(_ file: ExportFile) async throws -> String? {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = file.name
        panel.directoryURL = VaultLocation.userDocuments()
        panel.canCreateDirectories = true
        if file.contentType != .data { panel.allowedContentTypes = [file.contentType] }
        guard await panel.begin() == .OK, let url = panel.url else { return nil }
        try file.data.write(to: url, options: .atomic)
        return url.lastPathComponent
    }
}
#endif
