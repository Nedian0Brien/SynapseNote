import Foundation
import Testing
@testable import SynapseNote
#if os(macOS)
import PDFKit
#endif

struct DataExportTests {
    @Test func backupsAreNamedAsMorrowNamesThem() {
        // morrow's electron/main.cts: new Date().toISOString().replace(/[:.]/g, '-')
        let date = Date(timeIntervalSince1970: 1_792_351_850.972)
        #expect(AutoBackup.stamp(date) == "2026-10-18T19-30-50-972Z")
    }

    @Test func backupsKeepTheNewestTwenty() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "backups-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: folder) }
        let start = Date(timeIntervalSince1970: 1_792_000_000)
        for minute in 0..<23 {
            try AutoBackup.write("{\"n\":\(minute)}", in: folder, at: start.addingTimeInterval(Double(minute) * 60))
        }
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false)).sorted()
        #expect(names.count == AutoBackup.keep)
        #expect(names.allSatisfy { $0.hasPrefix("synapsenote-backup-") && $0.hasSuffix(".json") })
        // the three oldest went, the newest is whole
        #expect(names.first == "synapsenote-backup-\(AutoBackup.stamp(start.addingTimeInterval(180))).json")
        let newest = try String(contentsOf: folder.appending(path: names.last!), encoding: .utf8)
        #expect(newest == "{\"n\":22}")
    }

    @Test func fileNamesFollowMorrowsRule() {
        #expect(ExportFile.safeName("Plans: 2026/Q4") == "Plans  2026 Q4")
        #expect(ExportFile.safeName("  \"?\"  ") == "Page")
        #expect(ExportFile.safeName(String(repeating: "a", count: 130)).count == 120)
        #expect(ExportFile(name: "Notes.zip", data: Data()).contentType == .zip)
    }

    @Test func printedDocumentIsLightWithTheEditorStyles() {
        let snapshot = PDFExporter.Snapshot(title: "A \"B\"", head: "<link rel=\"stylesheet\" href=\"/assets/index.css\">", body: "<p>x</p>", accent: "ocean", colorful: "true")
        let html = PDFExporter.html(for: snapshot)
        #expect(html.contains("data-theme=\"light\""))
        #expect(html.contains("<title>A &quot;B&quot;</title>"))
        #expect(html.contains("href=\"/assets/index.css\""))
        #expect(html.contains("<body><p>x</p></body>"))
    }

    #if os(macOS)
    @MainActor
    @Test func pagesPrintOnA4InPages() async throws {
        let paragraphs = (1...120).map { "<p>Paragraph \($0) with enough words to wrap across the line a few times on the page.</p>" }.joined()
        let snapshot = PDFExporter.Snapshot(title: "Long", head: "<style>body{font:16px Georgia}</style>", body: "<h1>Long</h1>\(paragraphs)", accent: "ocean", colorful: "true")
        let root = FileManager.default.temporaryDirectory.appending(path: "editor-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let data = try await PDFExporter(editorRoot: root, access: VaultAccess()).pdf(of: snapshot)
        let document = try #require(PDFDocument(data: data))
        #expect(document.pageCount > 1)
        let bounds = try #require(document.page(at: 0)).bounds(for: .mediaBox)
        #expect(abs(bounds.width - PDFExporter.paper.width) < 1)
        #expect(abs(bounds.height - PDFExporter.paper.height) < 1)
        #expect((document.string ?? "").contains("Paragraph 120"))
    }
    #endif
}
