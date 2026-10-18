import Foundation
import Testing
@testable import SynapseNote

struct EditorSchemeHandlerTests {
    private let root: URL
    private let handler: EditorSchemeHandler

    init() throws {
        root = FileManager.default.temporaryDirectory.appending(path: "scheme-\(UUID().uuidString)/Editor")
        try FileManager.default.createDirectory(at: root.appending(path: "assets"), withIntermediateDirectories: true)
        try Data("<html></html>".utf8).write(to: root.appending(path: "index.html"))
        try Data("export {}".utf8).write(to: root.appending(path: "assets/index.js"))
        try Data("secret".utf8).write(to: root.deletingLastPathComponent().appending(path: "secret.txt"))
        try Data("stamp".utf8).write(to: root.appending(path: ".build-stamp"))
        handler = EditorSchemeHandler(root: root)
    }

    private func url(_ path: String) -> URL {
        URL(string: "synapse-editor://app\(path)")!
    }

    @Test func servesBundleFilesWithTheirType() throws {
        let (response, data) = try handler.response(for: url("/assets/index.js"))
        #expect((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") == "text/javascript")
        #expect(String(decoding: data, as: UTF8.self) == "export {}")
        let (index, _) = try handler.response(for: url("/"))
        #expect((index as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") == "text/html")
    }

    @Test func refusesPathsOutsideTheBundle() {
        #expect(throws: EditorSchemeHandler.Failure.outsideBundle) { try handler.response(for: url("/../secret.txt")) }
        #expect(throws: EditorSchemeHandler.Failure.outsideBundle) { try handler.response(for: url("/assets/%2E%2E/%2E%2E/secret.txt")) }
        #expect(throws: EditorSchemeHandler.Failure.outsideBundle) { try handler.response(for: url("/.build-stamp")) }
        #expect(throws: EditorSchemeHandler.Failure.outsideBundle) {
            try handler.response(for: URL(string: "synapse-editor://other/index.html")!)
        }
    }

    @Test func reportsMissingFiles() {
        #expect(throws: EditorSchemeHandler.Failure.notFound) { try handler.response(for: url("/missing.js")) }
    }
}
