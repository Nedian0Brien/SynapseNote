import Foundation
import UniformTypeIdentifiers

/// The vault the scheme handler reads from, swapped when a vault opens.
nonisolated final class VaultAccess: @unchecked Sendable {
    private let lock = NSLock()
    private var current: VaultFileSystem?

    var files: VaultFileSystem? { lock.withLock { current } }

    func set(_ files: VaultFileSystem?) {
        lock.withLock { current = files }
    }
}

/// Serves vault images and attachments under `synapse-vault://vault/<path>` to the web view a PDF is printed in
/// (PDFExporter), through the same path checks as every other vault read.
nonisolated struct VaultSchemeHandler {
    static let scheme = "synapse-vault"

    /// the URL a vault file is served at, as the editor's `fileUrl` makes it (encodePathForUrl)
    static func url(for path: String) -> URL? {
        URL(string: "\(scheme)://vault/\(Paths.encodePathForUrl(path))")
    }

    let access: VaultAccess

    enum Failure: Error, Equatable {
        case noVault
        case notFound
    }

    func response(for url: URL) throws -> (URLResponse, Data) {
        guard let files = access.files else { throw Failure.noVault }
        guard url.scheme == Self.scheme, url.host() == "vault" else { throw VaultPaths.Failure.invalid }
        let relative = String(url.path(percentEncoded: false).drop { $0 == "/" })
        _ = try VaultPaths.resolve(relative, in: files.root)
        guard let data = files.readBytes(relative) else { throw Failure.notFound }
        let mime = Self.mimeType(for: URL(filePath: relative))
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": mime, "Content-Length": String(data.count), "Cache-Control": "no-store"]
        )!
        return (response, data)
    }

    static func mimeType(for file: URL) -> String {
        switch file.pathExtension.lowercased() {
        case "js", "mjs": "text/javascript"
        case "css": "text/css"
        case "html": "text/html"
        case "json": "application/json"
        default: UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        }
    }
}
