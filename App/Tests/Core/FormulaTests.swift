import Foundation
import Testing
@testable import SynapseNote

/// Morrow's core/formula.ts in node, Fixtures/core/expected/formula.json: the same formula and row values give the
/// same value or the same message.
struct FormulaTests {
    @Test func computesAsMorrowDoes() throws {
        VaultLoadTests.useFixtureEnvironment()
        let fixture = try CoreFixtures.load("formula")
        let props = try #require(fixture["props"]?.object)
        let now = try #require(fixture["now"]?.number)
        let cases = try #require(fixture["cases"]?.array)
        #expect(cases.count > 90)
        for item in cases {
            let source = try #require(item["source"]?.string)
            let result = Formula.compute(source, prop: { props[$0] ?? .null }, now: now)
            let actual: JSValue = ["value": result.value, "error": result.error.map(JSValue.string) ?? .null]
            #expect(actual == item["result"], "\(source.prefix(60)): \(CoreFixtures.describe(actual)) vs \(CoreFixtures.describe(item["result"] ?? .null))")
        }
    }
}
