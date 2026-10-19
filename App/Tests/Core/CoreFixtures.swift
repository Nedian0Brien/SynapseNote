import Foundation
import Testing
@testable import SynapseNote

/// What Morrow's TypeScript core makes of the inputs in Fixtures/core/input and of its own test inputs, written by
/// `npm run core-fixtures` in `web/`.
enum CoreFixtures {
    private final class BundleToken {}

    static func load(_ name: String) throws -> JSValue {
        let url = try #require(Bundle(for: BundleToken.self).url(forResource: name, withExtension: "json"))
        let text = try String(contentsOf: url, encoding: .utf8)
        return try JSJSON.parse(text)
    }

    /// Both values as JSON, so a failure shows where they part.
    static func describe(_ value: JSValue) -> String { JSJSON.stringify(value, indent: 1) }
}
