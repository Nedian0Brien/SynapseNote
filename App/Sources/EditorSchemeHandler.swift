import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the editor web bundle from the app's resources under `synapse-editor://app/`.
/// Nothing outside the bundle folder can be read through it.
nonisolated struct EditorSchemeHandler: URLSchemeHandler {
    static let scheme = "synapse-editor"
    static let entry = URL(string: "\(scheme)://app/index.html")!

    let root: URL

    enum Failure: Error, Equatable {
        case outsideBundle
        case notFound
    }

    /// The file a request path names, nil when the path leaves the bundle folder.
    func fileURL(for path: String) -> URL? {
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let components = relative.split(separator: "/", omittingEmptySubsequences: true)
        // hidden files and parent folders are never served, which also rules out symlink tricks via ..
        guard !components.contains(where: { $0 == ".." || $0.hasPrefix(".") }) else { return nil }
        let file = (components.isEmpty ? root.appending(path: "index.html") : root.appending(path: components.joined(separator: "/")))
            .standardizedFileURL.resolvingSymlinksInPath()
        let base = root.standardizedFileURL.resolvingSymlinksInPath().path(percentEncoded: false)
        let resolved = file.path(percentEncoded: false)
        return resolved.hasPrefix(base.hasSuffix("/") ? base : base + "/") ? file : nil
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

    func response(for url: URL) throws -> (URLResponse, Data) {
        guard url.scheme == Self.scheme, url.host() == "app", let file = fileURL(for: url.path(percentEncoded: false)) else {
            throw Failure.outsideBundle
        }
        guard let data = try? Data(contentsOf: file) else { throw Failure.notFound }
        let mime = Self.mimeType(for: file)
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": mime, "Content-Length": String(data.count), "Cache-Control": "no-store"]
        )!
        return (response, data)
    }

    func reply(for request: URLRequest) -> AsyncThrowingStream<URLSchemeTaskResult, any Error> {
        AsyncThrowingStream { continuation in
            guard let url = request.url else {
                continuation.finish(throwing: Failure.notFound)
                return
            }
            let task = Task.detached {
                do {
                    let (response, data) = try response(for: url)
                    continuation.yield(.response(response))
                    continuation.yield(.data(data))
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
