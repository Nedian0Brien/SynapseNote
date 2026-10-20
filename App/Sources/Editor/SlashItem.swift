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
    /// what choosing it does: a block from the slash menu, or a page or date from the "[[" and "@" menus
    var action: Action = .block

    enum Action: Equatable {
        case block
        case page(id: String, title: String)
        case newPage(title: String)
        case date(key: String)
    }

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
        SlashItem(id: "callout", title: "Callout", description: "Highlighted note", symbol: "info.circle", keywords: "note tip warning aside alert"),
        SlashItem(id: "toggle", title: "Toggle", description: "Content that folds away", symbol: "chevron.right", keywords: "details collapse fold accordion"),
        SlashItem(id: "image", title: "Image", description: "Picture from your computer", symbol: "photo", keywords: "picture photo upload"),
        SlashItem(id: "file", title: "File", description: "Attach any file", symbol: "paperclip", keywords: "attachment upload pdf document"),
        SlashItem(id: "table", title: "Table", description: "Rows and columns", symbol: "tablecells", keywords: "grid spreadsheet"),
        SlashItem(id: "math", title: "Formula", description: "Display maths in LaTeX", symbol: "sum", hint: "$$", keywords: "math equation latex katex tex formula"),
        SlashItem(id: "inlineMath", title: "Inline formula", description: "Maths inside a sentence", symbol: "sum", hint: "$", keywords: "math equation latex inline"),
        SlashItem(id: "highlight", title: "Highlight", description: "Mark text to find it again", symbol: "highlighter", hint: "==", keywords: "mark marker yellow"),
        SlashItem(id: "database", title: "Database", description: "Table, board and calendar of pages", symbol: "tablecells.badge.ellipsis",
                  keywords: "collection kanban board calendar gallery table"),
        SlashItem(id: "canvas", title: "Canvas", description: "Cards and arrows on a whiteboard", symbol: "rectangle.on.rectangle", keywords: "whiteboard board diagram mind map"),
        SlashItem(id: "inlineDatabase", title: "Inline database", description: "A database shown right on this page", symbol: "tablecells",
                  keywords: "inline table board embedded view"),
        SlashItem(id: "inlineCanvas", title: "Inline canvas", description: "A whiteboard shown right on this page", symbol: "rectangle.on.rectangle",
                  keywords: "inline whiteboard drawing sketch embedded board"),
        SlashItem(id: "columns2", title: "2 columns", description: "Put blocks side by side", symbol: "rectangle.split.2x1", keywords: "columns layout side by side split"),
        SlashItem(id: "columns3", title: "3 columns", description: "Three blocks side by side", symbol: "rectangle.split.3x1", keywords: "columns layout side by side split"),
        SlashItem(id: "toc", title: "Table of contents", description: "Every heading on this page", symbol: "list.bullet.indent", keywords: "toc outline contents headings index"),
        SlashItem(id: "diagram", title: "Diagram", description: "Flowcharts and more with Mermaid", symbol: "point.3.connected.trianglepath.dotted",
                  keywords: "mermaid flowchart sequence gantt chart graph uml"),
        SlashItem(id: "date", title: "Date", description: "Mention a day, like @tomorrow", symbol: "calendar", hint: "@", keywords: "date day today tomorrow reminder mention due"),
        SlashItem(id: "embed", title: "Embed a page", description: "Show another page inside this one", symbol: "link", hint: "![[",
                  keywords: "transclude include synced block mirror"),
        SlashItem(id: "link", title: "Link to page", description: "Mention another page", symbol: "link", hint: "[[", keywords: "mention reference wiki"),
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
        case "diagram":
            store.insertContent(.node("codeBlock", ("attrs", ["language": "mermaid"]),
                                      ("content", [.object(JSObject([("type", "text"), ("text", .string(Self.sampleDiagram))]))])))
        case "image": store.pickFiles(images: true)
        case "file": store.pickFiles(images: false)
        case "math": store.insertFormula()
        case "inlineMath": store.insertInlineFormula()
        case "callout": store.wrapCallout()
        case "toggle": store.wrapDetails()
        case "table": store.insertBlock(EditorEdits.table(rows: 3, columns: 3))
        case "columns2": store.insertBlock(EditorEdits.columns(2))
        case "columns3": store.insertBlock(EditorEdits.columns(3))
        case "toc": store.insertContent(.node("tableOfContents"))
        case "database": store.linkChild(kind: "database")
        case "canvas": store.linkChild(kind: "canvas")
        case "inlineDatabase": store.linkChild(kind: "database", embed: true)
        case "inlineCanvas": store.linkChild(kind: "canvas", embed: true)
        // these type the menu's own trigger, which opens its menu
        case "date": store.typeTrigger("@")
        case "embed": store.typeTrigger("![[")
        case "link": store.typeTrigger("[[")
        default: break
        }
    }
}
