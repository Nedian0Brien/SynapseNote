import Foundation
import Testing
@testable import SynapseNote

struct FrontmatterTests {
    /// The value as the fixture JSON holds it: NaN and the infinities become null.
    private func json(_ value: JSValue?) throws -> JSValue {
        try JSJSON.parse(JSJSON.stringify(value ?? .null))
    }

    private func check(_ fixture: String, errorIsFlag: Bool) throws -> Int {
        let cases = try #require(CoreFixtures.load(fixture).array)
        var failures = 0
        for (index, item) in cases.enumerated() {
            let text = try #require(item["text"]?.string)
            let split = Frontmatter.split(text)
            let expected = try #require(item["split"])
            var problems: [String] = []
            let data = try json(split.data.map(JSValue.object))
            if data != expected["data"] { problems.append("data \(CoreFixtures.describe(data)) vs \(CoreFixtures.describe(expected["data"] ?? .null))") }
            if !split.head.jsEquals(expected["head"]?.string ?? "") { problems.append("head") }
            if !split.body.jsEquals(expected["body"]?.string ?? "") { problems.append("body") }
            let expectedError = errorIsFlag ? expected["error"]?.bool == true : !(expected["error"]?.isNull ?? true)
            if (split.error != nil) != expectedError { problems.append("error \(split.error ?? "none") vs \(expectedError)") }
            let joined = split.data.map { Frontmatter.join($0, split.body) }
            if (joined.map(JSValue.string) ?? .null) != item["joined"] {
                problems.append("joined \(CoreFixtures.describe(joined.map(JSValue.string) ?? .null)) vs \(CoreFixtures.describe(item["joined"] ?? .null))")
            }
            guard !problems.isEmpty else { continue }
            failures += 1
            if failures <= 8 { Issue.record("\(fixture) \(index) \(CoreFixtures.describe(.string(text)))\n\(problems.joined(separator: "\n"))") }
        }
        return failures
    }

    @Test func frontmatterMatchesMorrows() throws {
        #expect(try check("frontmatter", errorIsFlag: false) == 0)
    }

    @Test func fuzzedFrontmatterMatchesMorrows() throws {
        #expect(try check("frontmatter-fuzz", errorIsFlag: true) == 0)
    }

    @Test func yamlIsWrittenAsYamlWritesIt() throws {
        let cases = try #require(CoreFixtures.load("yaml-stringify").array)
        var failures = 0
        for (index, item) in cases.enumerated() {
            let value = try #require(item["value"])
            let yaml = YAMLStringify.stringify(value)
            guard !yaml.jsEquals(item["yaml"]?.string ?? "") else { continue }
            failures += 1
            if failures <= 8 { Issue.record("\(index) \(CoreFixtures.describe(value))\nswift: \(CoreFixtures.describe(.string(yaml)))\nyaml: \(CoreFixtures.describe(item["yaml"] ?? .null))") }
        }
        #expect(failures == 0)
    }
}
