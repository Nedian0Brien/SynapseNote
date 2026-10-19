import Foundation
import Testing
@testable import SynapseNote

/// Morrow's session on the guide vault and the edits of Fixtures/core/expected/session.json: the commands give
/// the same results and every save hands the vault the same file operations, in the same order.
struct SessionTests {
    @Test func savesMatchMorrows() throws {
        VaultLoadTests.useFixtureEnvironment()
        let fixture = try CoreFixtures.load("session")
        let steps = try #require(fixture["steps"]?.array)
        #expect(steps.count == 10)
        let vault = MemoryVault()
        let writer = VaultWriter(bridge: vault, newId: VaultLoadTests.counter("g"), now: { VaultLoadTests.fixedNow })
        let session = CoreSession.open(try vault.scan(), writer: writer)
        #expect(session.firstRun)
        for step in steps {
            let name = step["name"]?.string ?? "?"
            let commands = try #require(step["commands"]?.array).map { json in
                try #require(CoreCommand(json: json), "\(name): \(CoreFixtures.describe(json).prefix(200))")
            }
            if step["all"] == .bool(true) {
                if case .failure(let error) = session.executeAll(commands) { Issue.record("\(name): \(error.message)") }
            } else {
                let expected = try #require(step["results"]?.array)
                for (index, command) in commands.enumerated() {
                    let result = session.execute(command)
                    let actual: JSValue = switch result {
                    case .success: ["ok": true]
                    case .failure(let error): ["ok": false, "error": .string(error.message)]
                    }
                    #expect(actual == expected[index], "\(name) command \(index)")
                }
            }
            try session.flush()
            let ops = vault.takeLog().map(\.json)
            let expectedOps = try #require(step["ops"]?.array)
            if ops != expectedOps {
                let first = Array(zip(ops, expectedOps)).firstIndex { $0.0 != $0.1 } ?? min(ops.count, expectedOps.count)
                Issue.record("""
                \(name): \(ops.count) operations, morrow \(expectedOps.count), first difference at \(first)
                swift: \(first < ops.count ? CoreFixtures.describe(ops[first]).prefix(1500) : "none")
                morrow: \(first < expectedOps.count ? CoreFixtures.describe(expectedOps[first]).prefix(1500) : "none")
                """)
            }
        }
        let files = try #require(fixture["files"]?.object)
        var actual = JSObject()
        for (path, text) in vault.files where !path.utf16.starts(with: ".morrow/history/".utf16) { actual[path] = .string(text) }
        #expect(actual.keys.sorted { $0.jsLess($1) } == files.keys.sorted { $0.jsLess($1) })
        for (path, text) in files where actual[path] != text { Issue.record("file \(path) differs") }
    }

    /// opening a vault and closing it without an edit must leave every byte as it was
    @Test func openingWithoutEditsWritesNothing() throws {
        VaultLoadTests.useFixtureEnvironment()
        for vault in try #require(CoreFixtures.load("vaults").array) {
            let files = try #require(vault["files"]?.object)
            let memory = MemoryVault(files)
            let session = CoreSession.open(try memory.scan(), writer: VaultWriter(bridge: memory, newId: VaultLoadTests.counter("u"), now: { VaultLoadTests.fixedNow }))
            try session.flush()
            #expect(memory.takeLog().isEmpty, "\(vault["name"]?.string ?? "")")
            #expect(memory.files.count == files.count)
        }
    }
}
