import Foundation
import Testing
@testable import SynapseNote

struct VaultFileSystemTests {
    private let root: URL
    private let vault: VaultFileSystem

    init() throws {
        root = FileManager.default.temporaryDirectory.appending(path: "vault-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root.appending(path: "Notes"), withIntermediateDirectories: true)
        // no test may touch the real trash
        vault = VaultFileSystem(root: root, trash: { _ in throw CocoaError(.featureUnsupported) })
    }

    private func write(_ relative: String, _ text: String) throws {
        let url = root.appending(path: relative)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: url)
    }

    private func bytes(_ relative: String) throws -> Data {
        try Data(contentsOf: root.appending(path: relative))
    }

    private func ops(_ json: String) throws -> [VaultFileSystem.Op] {
        try JSONDecoder().decode([VaultFileSystem.Op].self, from: Data(json.utf8))
    }

    @Test func scanFollowsMorrowsRules() throws {
        try write("Home.md", "# Home")
        try write("Notes/Idea.md", "idea")
        try write("Notes/photo.png", "png")
        try write("Board.canvas", "{}")
        try write(".obsidian/app.json", "{}")
        try write(".trash/Old.md", "old")
        try write(".morrow/workspace.json", #"{"pages":[]}"#)
        try write("Notes/.morrow-tmp-abc", "temp")
        try FileManager.default.createDirectory(at: root.appending(path: "Empty"), withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: root.appending(path: "Link.md"), withDestinationURL: root.appending(path: "Home.md"))

        let scan = try vault.scan()
        #expect(Set(scan.files.map(\.path)) == ["Home.md", "Notes/Idea.md", "Board.canvas", ".trash/Old.md"])
        #expect(scan.others == ["Notes/photo.png"])
        #expect(Set(scan.folders.map(\.path)) == ["Notes", "Empty", ".trash"])
        #expect(scan.folders.first { $0.path == "Empty" }?.empty == true)
        #expect(scan.registry == .object(["pages": .array([])]))
        #expect(scan.recent == .null)
        #expect(scan.files.allSatisfy { $0.mtime > 0 && $0.birthtime > 0 })
    }

    @Test func writesTextByteForByte() throws {
        let text = "\u{FEFF}---\r\ntitle: 한글 🧪\r\n---\r\n\r\n본문\n"
        let results = vault.apply([.write(path: "Notes/New.md", text: text, expect: .some(nil))])
        #expect(results == [.ok])
        #expect(try bytes("Notes/New.md") == Data(text.utf8))
        #expect(try vault.readText("Notes/New.md") == text)
        let leftovers = try FileManager.default.contentsOfDirectory(atPath: root.appending(path: "Notes").path(percentEncoded: false))
        #expect(!leftovers.contains { $0.contains(VaultPaths.tempMark) })
    }

    @Test func writeChecksTheExpectedText() throws {
        try write("Page.md", "on disk")
        let results = vault.apply(try ops(#"[{"op":"write","path":"Page.md","text":"mine","expect":"what I read"},{"op":"write","path":"Other.md","text":"x"}]"#))
        #expect(results == [.conflict(message: "Page.md changed on disk.", current: "on disk")])
        #expect(try vault.readText("Page.md") == "on disk")
        #expect(try vault.exists("Other.md") == false)

        let refused = vault.apply(try ops(#"[{"op":"write","path":"Page.md","text":"x","expect":null}]"#))
        #expect(refused == [.conflict(message: "Page.md changed on disk.", current: "on disk")])

        let accepted = vault.apply(try ops(#"[{"op":"write","path":"Page.md","text":"mine","expect":"on disk"}]"#))
        #expect(accepted == [.ok])
        #expect(try vault.readText("Page.md") == "mine")
    }

    @Test func renameRefusesToReplaceButAllowsACaseChange() throws {
        try write("A.md", "a")
        try write("B.md", "b")
        #expect(vault.apply([.rename(from: "A.md", to: "B.md", optional: false)]) == [.exists(message: "B.md already exists.")])
        #expect(vault.apply([.rename(from: "A.md", to: "a.md", optional: false)]) == [.ok])
        let names = try FileManager.default.contentsOfDirectory(atPath: root.path(percentEncoded: false))
        #expect(names.contains("a.md") && !names.contains("A.md"))
        #expect(vault.apply([.rename(from: "a.md", to: "Deep/Folder/a.md", optional: false)]) == [.ok])
        #expect(try vault.readText("Deep/Folder/a.md") == "a")
        #expect(vault.apply([.rename(from: "Missing", to: "Elsewhere", optional: true)]) == [.ok])
        #expect(vault.apply([.rename(from: "Missing.md", to: "Elsewhere.md", optional: false)]) == [.error(message: "Missing.md is missing.")])
    }

    @Test func deleteOnlyTouchesMorrowFiles() throws {
        try write("Page.md", "keep")
        try write(".morrow/history/x.json", "{}")
        #expect(vault.apply([.delete(path: "Page.md")]) == [.error(message: "Only SynapseNote files can be deleted.")])
        #expect(try vault.exists("Page.md"))
        #expect(vault.apply([.delete(path: ".morrow/history/x.json")]) == [.ok])
        #expect(try vault.exists(".morrow/history/x.json") == false)
    }

    @Test func removeUsesTheTrashAndOtherwiseKeepsTheFile() throws {
        try write("Gone.md", "bye")
        #expect(vault.apply([.remove(path: "Gone.md")]) == [.ok])
        #expect(try vault.exists("Gone.md") == false)
        let kept = try FileManager.default.contentsOfDirectory(atPath: root.appending(path: ".morrow/deleted").path(percentEncoded: false))
        #expect(kept.count == 1 && kept[0].hasSuffix("-Gone.md"))

        let trashed = LockedURLs()
        let withTrash = VaultFileSystem(root: root, trash: { url in
            trashed.append(url)
            try FileManager.default.removeItem(at: url)
        })
        try write("Also.md", "bye")
        #expect(withTrash.apply([.remove(path: "Also.md")]) == [.ok])
        #expect(trashed.urls.map(\.lastPathComponent) == ["Also.md"])
    }

    @Test func rmdirLeavesFoldersThatStillHoldFiles() throws {
        try write("Full/x.md", "x")
        try FileManager.default.createDirectory(at: root.appending(path: "Empty"), withIntermediateDirectories: true)
        #expect(vault.apply([.rmdir(path: "Full"), .rmdir(path: "Empty")]) == [.ok, .ok])
        #expect(try vault.exists("Full"))
        #expect(try vault.exists("Empty") == false)
    }

    @Test func createFileNeverReplaces() throws {
        try vault.createFile("attachments/a.png", data: Data([1, 2, 3]))
        #expect(vault.readBytes("attachments/a.png") == Data([1, 2, 3]))
        #expect(throws: VaultFileSystem.Failure.self) { try vault.createFile("attachments/a.png", data: Data([9])) }
        #expect(vault.readBytes("attachments/a.png") == Data([1, 2, 3]))
    }

    @Test func refusesWritesThroughALinkOutOfTheVault() throws {
        let outside = FileManager.default.temporaryDirectory.appending(path: "outside-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: root.appending(path: "Escape"), withDestinationURL: outside)
        let results = vault.apply([.write(path: "Escape/x.md", text: "x", expect: nil)])
        #expect(results == [.error(message: "That path is outside the vault.")])
        #expect(!FileManager.default.fileExists(atPath: outside.appending(path: "x.md").path(percentEncoded: false)))
    }

    @Test func describesChangesLikeMorrow() throws {
        try write("Notes/Changed.md", "new text")
        try write("Notes/pic.png", "png")
        try write("Moved/Inside.md", "inside")
        let changes = vault.describe(["Notes/Changed.md", "Notes/pic.png", "Deleted.md", "Moved", ".obsidian/x", "a/.morrow-tmp-1"])
        let byPath = Dictionary(uniqueKeysWithValues: changes.map { ($0.path, $0) })
        #expect(Set(byPath.keys) == ["Notes/Changed.md", "Notes/pic.png", "Deleted.md", "Moved/Inside.md"])
        #expect(byPath["Notes/Changed.md"]?.text == "new text")
        #expect(byPath["Notes/pic.png"]?.other == true)
        #expect(byPath["Deleted.md"]?.text == nil && byPath["Deleted.md"]?.dir == false)
        #expect(byPath["Moved/Inside.md"]?.text == "inside")
    }

    @Test func listsFilesUnderAFolder() throws {
        try write("attachments/a.png", "a")
        try write("attachments/sub/b.pdf", "bb")
        let files = try vault.listFiles("attachments")
        #expect(Set(files.map(\.path)) == ["attachments/a.png", "attachments/sub/b.pdf"])
        #expect(files.first { $0.path == "attachments/sub/b.pdf" }?.size == 2)
    }
}

/// Collects the urls a test trash function received.
nonisolated final class LockedURLs: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [URL] = []
    var urls: [URL] { lock.withLock { stored } }
    func append(_ url: URL) { lock.withLock { stored.append(url) } }
}
