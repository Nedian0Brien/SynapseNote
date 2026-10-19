import Foundation
import Testing
@testable import SynapseNote

struct CollationTests {
    @Test(arguments: ["en-US", "ko-KR"])
    func comparisonsMatchJavaScripts(_ identifier: String) throws {
        let fixture = try CoreFixtures.load("collation")
        let words = try #require(fixture["words"]?.array).map { $0.string ?? "" }
        let locale = Locale(identifier: identifier)
        for mode in ["plain", "titles"] {
            let table = try #require(fixture[identifier]?[mode]?.array)
            var mismatches: [String] = []
            for (i, a) in words.enumerated() {
                let row = try #require(table[i].array)
                for (j, b) in words.enumerated() {
                    let expected = Int(row[j].number ?? 9)
                    let actual = JSCollator.compare(a, b, locale: locale, titles: mode == "titles")
                    if actual != expected { mismatches.append("\(CoreFixtures.describe(.string(a))) \(CoreFixtures.describe(.string(b))) js \(expected) swift \(actual)") }
                }
            }
            #expect(mismatches.isEmpty, "\(identifier) \(mode): \(mismatches.count) of \(words.count * words.count)\n\(mismatches.prefix(30).joined(separator: "\n"))")
        }
    }
}
