import Foundation
import JavaScriptCore

/// Morrow's code blocks highlighted as its editor does (Extras.ts `CodeBlock`, tiptap's code-block-lowlight):
/// lowlight with highlight.js's common languages, `highlight` for a language lowlight knows by name or alias and
/// `highlightAuto` for any other, the classes over each run of text flattened as the plugin's decorations are.
/// The same lowlight runs here in JavaScriptCore, from App/Renderers/highlight.js (web/scripts/vendor-renderers.ts),
/// and the classes take their look from Morrow's features.css.
nonisolated enum CodeHighlight {
    /// a run of the block's text, in UTF-16 units, and the classes over it
    struct Run: Equatable {
        var range: NSRange
        var classes: [String]
    }

    /// the colours of features.css (`--hl-*`, `--danger`)
    enum Tone: Equatable {
        case keyword, string, number, comment, title, attr, deletion
    }

    struct Style: Equatable {
        var tone: Tone?
        var italic = false
        var bold = false
    }

    /// Morrow's CODE_LANGUAGES: lowlight's languages and mermaid, sorted
    static var languages: [String] { engine.languages }

    /// the runs that have classes, as code-block-lowlight decorates them
    static func runs(_ code: String, language: String?) -> [Run] {
        engine.runs(code, language: language)
    }

    /// what features.css gives an element with these classes: the rule with the most classes wins, a later rule
    /// over an earlier one with as many. Its `.hljs-function .hljs-title` never applies, as the decorations are
    /// one element each.
    static func style(_ classes: [String]) -> Style {
        let have = Set(classes)
        var style = Style()
        var color: (specificity: Int, order: Int)?
        var italic: (specificity: Int, order: Int)?
        var bold: (specificity: Int, order: Int)?
        func wins(_ current: (specificity: Int, order: Int)?, _ candidate: (Int, Int)) -> Bool {
            guard let current else { return true }
            return candidate.0 > current.specificity || (candidate.0 == current.specificity && candidate.1 >= current.order)
        }
        for (order, rule) in rules.enumerated() {
            for selector in rule.selectors where selector.isSubset(of: have) {
                let key = (selector.count, order)
                if let tone = rule.tone, wins(color, key) { style.tone = tone; color = key }
                if rule.italic, wins(italic, key) { style.italic = true; italic = key }
                if rule.bold, wins(bold, key) { style.bold = true; bold = key }
            }
        }
        return style
    }

    private struct Rule {
        var selectors: [Set<String>]
        var tone: Tone?
        var italic = false
        var bold = false
    }

    /// features.css, in its order
    private static let rules: [Rule] = [
        Rule(selectors: [["hljs-keyword"], ["hljs-selector-tag"], ["hljs-built_in"], ["hljs-type"], ["hljs-literal"]], tone: .keyword),
        Rule(selectors: [["hljs-string"], ["hljs-regexp"], ["hljs-addition"], ["hljs-template-tag"]], tone: .string),
        Rule(selectors: [["hljs-number"], ["hljs-symbol"], ["hljs-bullet"], ["hljs-variable", "constant_"]], tone: .number),
        Rule(selectors: [["hljs-comment"], ["hljs-quote"], ["hljs-meta"]], tone: .comment, italic: true),
        Rule(selectors: [["hljs-title"], ["hljs-section"], ["hljs-title", "function_"], ["hljs-title", "class_"]], tone: .title),
        Rule(selectors: [["hljs-attr"], ["hljs-attribute"], ["hljs-property"], ["hljs-params"], ["hljs-name"], ["hljs-selector-class"]], tone: .attr),
        Rule(selectors: [["hljs-deletion"]], tone: .deletion),
        Rule(selectors: [["hljs-emphasis"]], tone: nil, italic: true),
        Rule(selectors: [["hljs-strong"]], tone: nil, bold: true),
    ]

    private static let engine = Engine()

    /// one JavaScript context for every block, used by one caller at a time
    private final class Engine: @unchecked Sendable {
        private let lock = NSLock()
        private let context: JSContext?
        private var last: (code: String, language: String?, runs: [Run])?
        let languages: [String]

        init() {
            let context = JSContext()
            if let url = Bundle.main.url(forResource: "Renderers/highlight", withExtension: "js"),
               let source = try? String(contentsOf: url, encoding: .utf8) {
                context?.evaluateScript(source, withSourceURL: url)
            }
            let names = context?.evaluateScript("morrowHighlight.languages()")?.toArray() as? [String] ?? []
            self.context = names.isEmpty ? nil : context
            languages = (names + ["mermaid"]).sorted { $0.jsLess($1) }
        }

        func runs(_ code: String, language: String?) -> [Run] {
            lock.lock()
            defer { lock.unlock() }
            if let last, last.code == code, last.language == language { return last.runs }
            guard let context, let highlight = context.objectForKeyedSubscript("morrowHighlight")?.objectForKeyedSubscript("highlight"),
                  let json = highlight.call(withArguments: [code, language as Any? ?? NSNull()])?.toString(),
                  let pairs = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [[Any]] else { return [] }
            var offset = 0
            var out: [Run] = []
            for pair in pairs {
                guard let length = pair.first as? Int, let classes = pair.last as? String else { continue }
                if !classes.isEmpty {
                    out.append(Run(range: NSRange(location: offset, length: length), classes: classes.split(separator: " ").map(String.init)))
                }
                offset += length
            }
            last = (code, language, out)
            return out
        }
    }
}
