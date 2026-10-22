import Foundation
import Testing
@testable import SynapseNote

struct VaultPathsTests {
    private let root = URL(filePath: "/tmp/vault-root")

    @Test func resolvesPathsInsideTheVault() throws {
        #expect(try VaultPaths.resolve("Notes/Page.md", in: root).path(percentEncoded: false) == "/tmp/vault-root/Notes/Page.md")
        #expect(try VaultPaths.resolve("a/../b.md", in: root).path(percentEncoded: false) == "/tmp/vault-root/b.md")
    }

    @Test func refusesPathsThatLeaveTheVault() {
        #expect(throws: VaultPaths.Failure.outside) { try VaultPaths.resolve("../other/x.md", in: root) }
        #expect(throws: VaultPaths.Failure.outside) { try VaultPaths.resolve("a/../../x.md", in: root) }
        #expect(throws: VaultPaths.Failure.invalid) { try VaultPaths.resolve("/etc/hosts", in: root) }
        #expect(throws: VaultPaths.Failure.invalid) { try VaultPaths.resolve("a\\b.md", in: root) }
        #expect(throws: VaultPaths.Failure.invalid) { try VaultPaths.resolve("", in: root) }
        #expect(throws: VaultPaths.Failure.invalid) { try VaultPaths.resolve("a\0b", in: root) }
    }

    @Test func hidesDotFoldersExceptTheVaultTrash() {
        #expect(VaultPaths.isHidden(".obsidian/app.json"))
        #expect(VaultPaths.isHidden(".morrow/workspace.json"))
        #expect(VaultPaths.isHidden("Notes/.git/HEAD"))
        #expect(!VaultPaths.isHidden(".trash/Old.md"))
        #expect(VaultPaths.isHidden("Notes/.trash/Old.md"))
        #expect(!VaultPaths.isHidden("Notes/Page.md"))
    }

    @Test func pagesAreMarkdownAndCanvasFiles() {
        #expect(VaultPaths.isPage("a/B.md"))
        #expect(VaultPaths.isPage("Board.CANVAS"))
        #expect(!VaultPaths.isPage("image.png"))
    }
}

struct VaultPathsRelativeTests {
    @Test func folderPathsHaveNoTrailingSlash() {
        let root = URL(filePath: "/tmp/vault-root/", directoryHint: .isDirectory)
        #expect(VaultPaths.relative(URL(filePath: "/tmp/vault-root/Notes/", directoryHint: .isDirectory), to: root) == "Notes")
        #expect(VaultPaths.relative(URL(filePath: "/tmp/vault-root/Notes/a.md"), to: root) == "Notes/a.md")
    }
}
