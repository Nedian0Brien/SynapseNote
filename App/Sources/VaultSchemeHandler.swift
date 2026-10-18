import Foundation
import WebKit

/// The vault the scheme handler and the editor bridge read from, swapped when a vault opens.
nonisolated final class VaultAccess: @unchecked Sendable {
    private let lock = NSLock()
    private var current: VaultFileSystem?

    var files: VaultFileSystem? { lock.withLock { current } }

    func set(_ files: VaultFileSystem?) {
        lock.withLock { current = files }
    }
}

/// Serves vault images and attachments under `synapse-vault://vault/<path>`, through the same path checks as
/// every other vault read.
nonisolated struct VaultSchemeHandler: URLSchemeHandler {
    static let scheme = "synapse-vault"

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
        let mime = EditorSchemeHandler.mimeType(for: URL(filePath: relative))
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
