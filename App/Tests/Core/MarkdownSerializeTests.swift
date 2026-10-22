import Foundation
import Testing
@testable import SynapseNote

struct MarkdownSerializeTests {
    /// Morrow's docToMarkdown of its own document trees, compared byte for byte.
    @Test func markdownMatchesMorrows() throws {
        var compared = 0
        for fixture in ["markdown", "markdown-fuzz"] {
            let cases = try #require(CoreFixtures.load(fixture).array)
            var failures = 0
            for (index, item) in cases.enumerated() {
                let doc = try #require(item["doc"]?.object)
                let expected = try #require(item["markdown"]?.string)
                let markdown = MarkdownSerialize.docToMarkdown(doc)
                compared += 1
                guard !markdown.jsEquals(expected) else { continue }
                failures += 1
                if failures <= 5 {
                    Issue.record("\(fixture) \(index) \(item["name"]?.string ?? "")\nswift:\n\(CoreFixtures.describe(.string(markdown)))\nmorrow:\n\(CoreFixtures.describe(.string(expected)))")
                }
            }
            #expect(failures == 0, "\(fixture)")
        }
        #expect(compared > 1500)
    }

    @Test func pageTitlesBecomeAHeading() {
        let doc = MarkdownParse.markdownToDoc("Body *text*")
        #expect(MarkdownSerialize.pageToMarkdown(title: "  A *title*  ", doc: doc) == "# A \\*title\\*\n\nBody *text*\n")
        #expect(MarkdownSerialize.pageToMarkdown(title: "", doc: Model.emptyDoc()) == "# Untitled\n")
    }
}
