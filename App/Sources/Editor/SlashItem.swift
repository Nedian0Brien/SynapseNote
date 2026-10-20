import Foundation

/// Morrow's slash menu (src/app/editor/SlashCommand.ts `BLOCK_ITEMS` and `filterBlocks`), with the blocks the
/// native editor has so far; the rest join as their blocks do.
struct SlashItem: Identifiable, Equatable {
    let id: String
    let title: String
    let description: String
    let symbol: String
    var hint: String?
    let keywords: String

    static func == (lhs: SlashItem, rhs: SlashItem) -> Bool { lhs.id == rhs.id }

    static let all: [SlashItem] = [
        SlashItem(id: "text", title: "Text", description: "Plain paragraph", symbol: "paragraphsign", keywords: "paragraph plain"),
        SlashItem(id: "h1", title: "Heading 1", description: "Large section heading", symbol: "textformat.size.larger", hint: "#", keywords: "title h1"),
        SlashItem(id: "h2", title: "Heading 2", description: "Medium heading", symbol: "textformat.size", hint: "##", keywords: "subtitle h2"),
        SlashItem(id: "h3", title: "Heading 3", description: "Small heading", symbol: "textformat.size.smaller", hint: "###", keywords: "h3"),
        SlashItem(id: "bullet", title: "Bulleted list", description: "Simple list", symbol: "list.bullet", hint: "-", keywords: "unordered ul bullet"),
        SlashItem(id: "ordered", title: "Numbered list", description: "List with numbers", symbol: "list.number", hint: "1.", keywords: "ordered ol"),
        SlashItem(id: "task", title: "Checklist", description: "Track tasks", symbol: "checklist", hint: "[ ]", keywords: "todo task checkbox"),
        SlashItem(id: "quote", title: "Quote", description: "Quotation or callout", symbol: "text.quote", hint: ">", keywords: "blockquote citation"),
        SlashItem(id: "code", title: "Code block", description: "Monospaced code", symbol: "chevron.left.forwardslash.chevron.right", hint: "```", keywords: "snippet pre"),
        SlashItem(id: "divider", title: "Divider", description: "Horizontal line", symbol: "minus", hint: "---", keywords: "hr rule separator line"),
        SlashItem(id: "highlight", title: "Highlight", description: "Mark text to find it again", symbol: "highlighter", hint: "==", keywords: "mark marker yellow"),
        SlashItem(id: "diagram", title: "Diagram", description: "Flowcharts and more with Mermaid", symbol: "point.3.connected.trianglepath.dotted",
                  keywords: "mermaid flowchart sequence gantt chart graph uml"),
    ]

    static let sampleDiagram = "flowchart LR\n  Idea --> Draft --> Review\n  Review -->|changes| Draft\n  Review --> Done"

    /// blocks whose name matches come before blocks that only match a keyword, so /diagram finds the diagram
    static func filter(_ query: String) -> [SlashItem] {
        let folded = Search.foldText(query.trimmingCharacters(in: .whitespaces))
        guard !folded.isEmpty else { return all }
        let words = folded.split(whereSeparator: \.isWhitespace).map(String.init)
        func rank(_ item: SlashItem) -> Int {
            let title = Search.foldText(item.title)
            if title.hasPrefix(folded) { return 0 }
            if title.contains(folded) { return 1 }
            let haystack = "\(title) \(Search.foldText(item.keywords))"
            return words.allSatisfy { haystack.contains($0) } ? 2 : -1
        }
        return all.map { ($0, rank($0)) }.filter { $0.1 >= 0 }.enumerated()
            .sorted { ($0.element.1, $0.offset) < ($1.element.1, $1.offset) }
            .map(\.element.0)
    }

    /// what choosing it does with the caret at `offset` in the block at `path`, the slash already gone
    @MainActor func run(_ store: EditorStore, _ path: EditorEdits.Path, _ offset: Int) {
        switch id {
        case "text": store.setBlockType("paragraph")
        case "h1": store.setBlockType("heading", level: 1)
        case "h2": store.setBlockType("heading", level: 2)
        case "h3": store.setBlockType("heading", level: 3)
        case "bullet": store.toggleList("bulletList")
        case "ordered": store.toggleList("orderedList")
        case "task": store.toggleList("taskList")
        case "quote": store.quote()
        case "code": store.setBlockType("codeBlock")
        case "divider": store.rule()
        case "highlight": store.toggleMark("highlight")
        case "diagram": store.insertCode(language: "mermaid", text: Self.sampleDiagram)
        default: break
        }
    }
}
