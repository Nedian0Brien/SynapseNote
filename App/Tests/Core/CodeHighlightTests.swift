import Foundation
import Testing
@testable import SynapseNote

/// Code blocks highlighted as Morrow's editor highlights them (Fixtures/core/expected/highlight.json, the
/// decorations code-block-lowlight's plugin gives every code block of the markdown fixtures and a few more, written
/// by `npm run editor-fixtures`), and the look features.css gives the classes.
struct CodeHighlightTests {
    @Test func languagesAreMorrows() throws {
        let fixture = try #require(CoreFixtures.load("highlight").object)
        let languages = try #require(fixture["languages"]?.array).compactMap(\.string)
        #expect(CodeHighlight.languages == languages)
        #expect(languages.count == 38)
    }

    @Test func blocksAreHighlightedAsLowlightDoes() throws {
        let fixture = try #require(CoreFixtures.load("highlight").object)
        let blocks = try #require(fixture["blocks"]?.array)
        #expect(blocks.count > 300)
        var highlighted = 0
        for block in blocks {
            let block = try #require(block.object)
            let code = try #require(block["code"]?.string)
            let language = block["language"]?.string
            let expected = try #require(block["runs"]?.array).map { run -> CodeHighlight.Run in
                let parts = run.array ?? []
                let from = Int(parts[0].number ?? 0), to = Int(parts[1].number ?? 0)
                return CodeHighlight.Run(range: NSRange(location: from, length: to - from), classes: (parts[2].string ?? "").split(separator: " ").map(String.init))
            }
            let runs = CodeHighlight.runs(code, language: language)
            #expect(runs == expected, "\(language ?? "auto"): \(code.prefix(40))")
            if !runs.isEmpty { highlighted += 1 }
        }
        #expect(highlighted > 200)
    }

    @Test func classesTakeFeaturesCssLooks() {
        #expect(CodeHighlight.style(["hljs-keyword"]) == .init(tone: .keyword))
        #expect(CodeHighlight.style(["hljs-comment"]) == .init(tone: .comment, italic: true))
        // a compound selector wins over a single class, a later rule over an earlier one as specific
        #expect(CodeHighlight.style(["hljs-variable", "constant_"]) == .init(tone: .number))
        #expect(CodeHighlight.style(["hljs-title", "function_"]) == .init(tone: .title))
        #expect(CodeHighlight.style(["hljs-keyword", "hljs-title"]) == .init(tone: .title))
        #expect(CodeHighlight.style(["hljs-attr", "hljs-string"]) == .init(tone: .attr))
        #expect(CodeHighlight.style(["hljs-variable"]) == .init())
        #expect(CodeHighlight.style(["hljs-strong", "hljs-emphasis"]) == .init(italic: true, bold: true))
        #expect(CodeHighlight.style(["hljs-deletion"]) == .init(tone: .deletion))
    }
}
