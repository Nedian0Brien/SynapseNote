import Foundation

/// Morrow's core/site.ts: pages as a small static website, plain HTML files and one stylesheet, no scripts and
/// nothing loaded from elsewhere.
nonisolated enum Site {
    struct Options {
        /// publish this page and its subpages, or every page when nil
        var rootId: String?
        var title: String
        /// formulas as HTML; Morrow renders them with KaTeX into MathML so no fonts are needed
        var renderMath: ((String, Bool) -> String)?
        /// `new Date()` for the formulas of database pages
        var now: Double = JSEnvironment.now()
    }

    struct File: Equatable, Sendable {
        var path: String
        var content: String
    }

    struct Built {
        var files: [File]
        /// stored files the pages show, with the path each one is copied to
        var assets: JSMap<String>
    }

    struct RenderContext {
        var href: (String) -> String?
        var assetPath: (String) -> String
        var titleOf: (String) -> String?
        var renderMath: ((String, Bool) -> String)?
    }

    /// the generator the published pages name; Morrow's build renames it for SynapseNote
    static let generator = "SynapseNote"

    static func escape(_ text: String) -> String {
        var out: [UInt16] = []
        for unit in text.utf16 {
            switch unit {
            case 0x26: out += "&amp;".utf16
            case 0x3C: out += "&lt;".utf16
            case 0x3E: out += "&gt;".utf16
            case 0x22: out += "&quot;".utf16
            default: out.append(unit)
            }
        }
        return JSText.string(out)
    }

    private static let safeHref = JSRegex(#"^(https?:|mailto:)"#, ignoreCase: true)
    private static let spaces = JSRegex(#"\s+"#)
    // swiftlint:disable:next force_try
    private static let notNameChar = try! NSRegularExpression(pattern: #"[^\p{L}\p{N}_-]"#)

    /// `.replace(/[^\p{L}\p{N}_-]/gu, '')`
    private static func keepNameChars(_ text: String) -> String {
        let string = text as NSString
        return notNameChar.stringByReplacingMatches(in: text, range: NSRange(location: 0, length: string.length), withTemplate: "")
    }

    /// `.replace(/[^\w.-]/g, '_')`, unit by unit as a regular expression without the u flag
    private static func asciiFileName(_ text: String) -> String {
        JSText.string(text.utf16.map { unit in
            let keep = (0x30...0x39).contains(unit) || (0x41...0x5A).contains(unit) || (0x61...0x7A).contains(unit) || unit == 0x5F || unit == 0x2E || unit == 0x2D
            return keep ? unit : 0x5F
        })
    }

    static func buildSite(_ state: WorkspaceState, _ options: Options) -> Built {
        let root = options.rootId.flatMap { state.pages[$0] }
        let pages = root.map { [$0] + Tree.descendantsOf(state.pages, $0.id).filter { $0.trashedAt == nil } } ?? Tree.livePages(state.pages)
        let live = JSSet(Tree.livePages(state.pages).map(\.id))
        // encrypted pages are never published
        let included = pages.filter { live.has($0.id) && !$0.encrypted }
        let ids = JSSet(included.map(\.id))

        // short readable file names, the published root is the home page
        var names = JSMap<String>()
        var used = JSSet(["index"])
        for page in included {
            if let root, page.id.jsEquals(root.id) {
                names[page.id] = "index.html"
                continue
            }
            let lowered = JSText.string(JSText.lowercased(Paths.safeFileName(Model.displayTitle(page), maxLength: 60).units))
            let dashed = JSText.string(spaces.replaceAll(lowered.units) { _ in "-".units })
            var base = keepNameChars(dashed)
            if base.isEmpty { base = "page" }
            var name = base
            var n = 2
            while used.has(name) {
                name = "\(base)-\(n)"
                n += 1
            }
            used.insert(name)
            names[page.id] = "\(name).html"
        }

        var assets = JSMap<String>()
        let assetPath: (String) -> String = { fileId in
            if let path = assets[fileId] { return path }
            let name = JSText.split(fileId, on: 0x2F).last ?? "file"
            let path = "files/\(assets.count + 1)-\(asciiFileName(name))"
            assets[fileId] = path
            return path
        }
        let href: (String) -> String? = { ids.has($0) ? names[$0] : nil }

        var backlinks = JSMap<[String]>()
        for page in included {
            guard let doc = state.docs[page.id] else { continue }
            for link in Links.linksInDoc(doc) where ids.has(link.targetId) && !link.targetId.jsEquals(page.id) {
                var list = backlinks[link.targetId] ?? []
                if !list.contains(where: { $0.jsEquals(page.id) }) { list.append(page.id) }
                backlinks[link.targetId] = list
            }
        }

        let topLevel = root.map { [$0] } ?? included.filter { $0.parentId == nil || !ids.has($0.parentId!) }
        func nav(_ current: String) -> String {
            func branch(_ list: [PageMeta], _ depth: Int) -> String {
                if depth > 6 || list.isEmpty { return "" }
                return "<ul>" + list.map { page in
                    let children = Tree.childrenOf(state.pages, page.id).filter { ids.has($0.id) }
                    let icon = page.icon.flatMap { $0.isEmpty ? nil : "\(escape($0)) " } ?? ""
                    let label = "\(icon)\(escape(Model.displayTitle(page)))"
                    let currentMark = page.id.jsEquals(current) ? " aria-current=\"page\"" : ""
                    return "<li><a href=\"\(names[page.id] ?? "undefined")\"\(currentMark)>\(label)</a>\(branch(children, depth + 1))</li>"
                }.joined() + "</ul>"
            }
            return branch(topLevel, 0)
        }

        var context = RenderContext(href: href, assetPath: assetPath, titleOf: { state.pages[$0].map(Model.displayTitle) }, renderMath: options.renderMath)
        context.assetPath = assetPath
        var files = [File(path: "style.css", content: siteCSS)]
        for page in included {
            let doc = state.docs[page.id]
            var main = ""
            if page.kind == .database, page.database != nil {
                main = databaseHtml(state, page, context, now: options.now)
            } else if page.kind == .canvas {
                main = canvasHtml(doc, context)
            } else if let doc {
                main = docToHtml(doc, context)
            }
            let children = Tree.childrenOf(state.pages, page.id).filter { ids.has($0.id) && page.kind != .database }
            let sub = children.isEmpty ? "" : "<section class=\"subpages\"><h2>Pages inside</h2><ul>" + children.map {
                "<li><a href=\"\(names[$0.id] ?? "undefined")\">\(escape(Model.displayTitle($0)))</a></li>"
            }.joined() + "</ul></section>"
            let back = (backlinks[page.id] ?? []).map {
                "<li><a href=\"\(names[$0] ?? "undefined")\">\(escape(Model.displayTitle(state.pages[$0])))</a></li>"
            }.joined()
            let tags = page.tags.isEmpty ? "" : "<p class=\"tags\">" + page.tags.map { "<span>#\(escape($0))</span>" }.joined(separator: " ") + "</p>"
            let plain = Doc.docToPlainText(doc ?? .node("doc"))
            let description = escape(JSText.string(spaces.replaceAll(JSText.slice(plain.units, 0, 160)) { _ in " ".units }))
            let icon = page.icon.flatMap { $0.isEmpty ? nil : "<span class=\"icon\">\(escape($0))</span> " } ?? ""
            let home = root != nil ? "index.html" : (topLevel.first.flatMap { names[$0.id] } ?? names[""] ?? "index.html")
            files.append(File(path: names[page.id]!, content: """
                <!doctype html>
                <html lang="en">
                <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="description" content="\(description)">
                <meta name="generator" content="\(generator)">
                <title>\(escape(Model.displayTitle(page))) · \(escape(options.title))</title>
                <link rel="stylesheet" href="style.css">
                </head>
                <body>
                <nav class="site-nav" aria-label="Pages"><a class="site-title" href="\(home)">\(escape(options.title))</a>\(nav(page.id))</nav>
                <main>
                <article>
                <h1>\(icon)\(escape(Model.displayTitle(page)))</h1>
                \(tags)\(main)
                </article>
                \(sub)\(back.isEmpty ? "" : "<section class=\"backlinks\"><h2>Linked from</h2><ul>\(back)</ul></section>")
                </main>
                </body>
                </html>

                """))
        }
        // a whole vault gets a home page that lists its top level pages
        if root == nil {
            let list = topLevel.map { "<li><a href=\"\(names[$0.id] ?? "undefined")\">\(escape(Model.displayTitle($0)))</a></li>" }.joined()
            files.append(File(path: "index.html", content: """
                <!doctype html>
                <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>\(escape(options.title))</title><link rel="stylesheet" href="style.css"></head>
                <body><nav class="site-nav" aria-label="Pages"><a class="site-title" href="index.html">\(escape(options.title))</a>\(nav(""))</nav><main><article><h1>\(escape(options.title))</h1><ul>\(list)</ul></article></main></body></html>

                """))
        }
        return Built(files: files, assets: assets)
    }

    private static let markTags: [String: (String, String)] = [
        "bold": ("<strong>", "</strong>"), "italic": ("<em>", "</em>"), "underline": ("<u>", "</u>"),
        "strike": ("<s>", "</s>"), "code": ("<code>", "</code>"), "highlight": ("<mark>", "</mark>"),
    ]

    private static func wrapMarks(_ html: String, _ marks: [DocMark]?) -> String {
        var out = html
        for mark in marks ?? [] {
            if mark.type == "link" {
                let target = mark.attr("href").map { $0.isNull ? "" : $0.jsString } ?? ""
                if safeHref.test(target) { out = "<a href=\"\(escape(target))\" rel=\"noopener noreferrer\">\(out)</a>" }
            } else if let tags = markTags[mark.type] {
                out = tags.0 + out + tags.1
            }
        }
        return out
    }

    /// `String(value ?? fallback)` for an attribute
    private static func attrText(_ node: DocNode, _ key: String, _ fallback: String = "") -> String {
        guard let value = node.attr(key), !value.isNull else { return fallback }
        return value.jsString
    }

    private static func inline(_ nodes: [DocNode]?, _ context: RenderContext) -> String {
        (nodes ?? []).map { node -> String in
            switch node.type {
            case "text":
                return wrapMarks(escape(node.text ?? ""), node.marks)
            case "hardBreak":
                return "<br>"
            case "inlineMath":
                let latex = attrText(node, "latex")
                return context.renderMath?(latex, false) ?? "<code class=\"math\">\(escape(latex))</code>"
            case "dateMention":
                let date = attrText(node, "date")
                return "<time class=\"date-mention\" datetime=\"\(escape(date))\">\(escape(Doc.readableDate(date)))</time>"
            case "pageLink":
                let id = node.attr("id")?.string
                var label = ""
                if let alias = node.attr("alias"), !alias.isNull {
                    label = alias.jsString
                } else if let id, let title = context.titleOf(id) {
                    label = title
                } else if let given = node.attr("label"), !given.isNull {
                    label = given.jsString
                } else if let target = node.attr("target"), !target.isNull {
                    label = target.jsString
                }
                if let id, let target = context.href(id) { return "<a class=\"page-link\" href=\"\(target)\">\(escape(label))</a>" }
                return "<span class=\"page-link missing\">\(escape(label))</span>"
            default:
                return inline(node.content, context)
            }
        }.joined()
    }

    /// `Number(value ?? fallback)`
    private static func number(_ node: DocNode, _ key: String, _ fallback: Double) -> Double {
        guard let value = node.attr(key), !value.isNull else { return fallback }
        return Database.toNumber(value)
    }

    /// Math.min and Math.max, NaN when either side is NaN
    private static func jsMin(_ a: Double, _ b: Double) -> Double { a.isNaN || b.isNaN ? .nan : min(a, b) }
    private static func jsMax(_ a: Double, _ b: Double) -> Double { a.isNaN || b.isNaN ? .nan : max(a, b) }

    static func docToHtml(_ doc: DocNode, _ context: RenderContext) -> String {
        func block(_ node: DocNode) -> String {
            func children() -> String { (node.content ?? []).map(block).joined(separator: "\n") }
            switch node.type {
            case "paragraph":
                return "<p>\(inline(node.content, context))</p>"
            case "heading":
                let level = JSNumber.string(jsMin(6, jsMax(2, number(node, "level", 1) + 1)))
                return "<h\(level)>\(inline(node.content, context))</h\(level)>"
            case "bulletList":
                return "<ul>\(children())</ul>"
            case "orderedList":
                let start = number(node, "start", 1)
                return "<ol start=\"\(JSNumber.string(start.isNaN || start == 0 ? 1 : start))\">\(children())</ol>"
            case "listItem":
                return "<li>\(children())</li>"
            case "taskList":
                return "<ul class=\"tasks\">\(children())</ul>"
            case "taskItem":
                return "<li><input type=\"checkbox\" disabled\(node.attr("checked")?.truthy == true ? " checked" : "")> \(children())</li>"
            case "blockquote":
                return "<blockquote>\(children())</blockquote>"
            case "callout":
                var title = ""
                if case .string(let text)? = node.attr("title"), !text.isEmpty { title = "<p class=\"callout-title\">\(escape(text))</p>" }
                return "<aside class=\"callout tone-\(escape(attrText(node, "tone", "note")))\">\(title)\(children())</aside>"
            case "columns":
                return "<div class=\"columns\" style=\"--columns:\((node.content ?? []).count)\">\(children())</div>"
            case "column":
                return "<div class=\"column\">\(children())</div>"
            case "tableOfContents":
                let headings = (doc.content ?? []).filter { $0.type == "heading" }
                if headings.isEmpty { return "" }
                return "<nav class=\"toc\">" + headings.map { heading in
                    "<p class=\"toc-\(JSNumber.string(jsMin(3, number(heading, "level", 1))))\">\(escape(Doc.inlineText(heading)))</p>"
                }.joined() + "</nav>"
            case "details":
                let parts = node.content ?? []
                let summary = parts.first
                let content = parts.count > 1 ? parts[1] : nil
                return "<details><summary>\(inline(summary?.content, context))</summary>\((content?.content ?? []).map(block).joined(separator: "\n"))</details>"
            case "codeBlock":
                var language = ""
                if case .string(let name)? = node.attr("language") { language = " class=\"language-\(escape(name))\"" }
                return "<pre><code\(language)>\(escape((node.content ?? []).map { $0.text ?? "" }.joined()))</code></pre>"
            case "blockMath":
                let latex = attrText(node, "latex")
                return "<div class=\"math-block\">\(context.renderMath?(latex, true) ?? "<pre>\(escape(latex))</pre>")</div>"
            case "rawBlock":
                return "<pre class=\"raw\">\(escape(attrText(node, "text")))</pre>"
            case "horizontalRule":
                return "<hr>"
            case "table":
                return "<div class=\"table\"><table>\(children())</table></div>"
            case "tableRow":
                return "<tr>\(children())</tr>"
            case "tableHeader":
                return "<th>\((node.content ?? []).map { inline($0.content, context) }.joined(separator: "<br>"))</th>"
            case "tableCell":
                return "<td>\((node.content ?? []).map { inline($0.content, context) }.joined(separator: "<br>"))</td>"
            case "image":
                let alt = escape(attrText(node, "alt"))
                if case .string(let fileId)? = node.attr("fileId") {
                    return "<figure><img src=\"\(context.assetPath(fileId))\" alt=\"\(alt)\" loading=\"lazy\"></figure>"
                }
                // a published page never loads anything from elsewhere, remote images become links
                let src = node.attr("src")?.string ?? ""
                return safeHref.test(src) ? "<p><a href=\"\(escape(src))\" rel=\"noopener noreferrer\">\(alt.isEmpty ? "Image" : alt)</a></p>" : ""
            case "fileAttachment":
                let fileId = attrText(node, "fileId")
                return "<p class=\"file\"><a href=\"\(context.assetPath(fileId))\" download>\(escape(attrText(node, "name", "file")))</a></p>"
            default:
                return children()
            }
        }
        return (doc.content ?? []).map(block).joined(separator: "\n")
    }

    static func databaseHtml(_ state: WorkspaceState, _ page: PageMeta, _ context: RenderContext, now: Double = JSEnvironment.now()) -> String {
        let database = page.database!
        let rows = Database.rowsOf(state, page.id)
        let head = "<tr><th>Name</th>" + database.properties.map { "<th>\(escape($0.name))</th>" }.joined() + "</tr>"
        let body = rows.map { row -> String in
            let title = escape(Model.displayTitle(row))
            let cells = database.properties.map { prop in
                "<td>\(escape(Database.formatValue(prop, Database.valueOf(row, prop.id, database, now: now))))</td>"
            }.joined()
            let name = context.href(row.id).map { "<a href=\"\($0)\">\(title)</a>" } ?? title
            return "<tr><td>\(name)</td>\(cells)</tr>"
        }.joined()
        return "<div class=\"table\"><table>\(head)\(body)</table></div>"
    }

    private static func canvasHtml(_ doc: DocNode?, _ context: RenderContext) -> String {
        let data = CanvasFile.canvasFromDoc(doc)
        func num(_ node: JSObject, _ key: String) -> Double { node[key]?.number ?? 0 }
        let cards = data.nodes.filter { $0["type"]?.string != "group" }.jsSorted { a, b in
            let dy = num(a, "y") - num(b, "y")
            if dy != 0, !dy.isNaN { return dy < 0 ? -1 : 1 }
            let dx = num(a, "x") - num(b, "x")
            return dx == 0 || dx.isNaN ? 0 : dx < 0 ? -1 : 1
        }.map { node -> String in
            switch node["type"]?.string {
            case "text":
                let text = node["text"]?.string ?? ""
                return "<div class=\"card\">" + JSText.split(text, on: 0x0A).map { "<p>\(escape($0))</p>" }.joined() + "</div>"
            case "page":
                let pageId = node["pageId"]?.string ?? ""
                let title = escape(context.titleOf(pageId) ?? "Missing page")
                return "<div class=\"card\">\(context.href(pageId).map { "<a href=\"\($0)\">\(title)</a>" } ?? title)</div>"
            case "link":
                let url = node["url"]?.string ?? ""
                return safeHref.test(url) ? "<div class=\"card\"><a href=\"\(escape(url))\" rel=\"noopener noreferrer\">\(escape(url))</a></div>" : ""
            case "file":
                let file = node["file"]?.string ?? ""
                return "<div class=\"card\"><a href=\"\(context.assetPath(file))\">\(escape(JSText.split(file, on: 0x2F).last ?? ""))</a></div>"
            default:
                return ""
            }
        }.joined()
        return "<div class=\"cards\">\(cards)</div>"
    }

    /// one page as a published page shows it, without the site's navigation, for printing to PDF: its icon
    /// and title, tags and content, then its subpages and the pages linking to it are left out. Pictures are
    /// read from the vault through `assetPath`.
    static func printPage(_ state: WorkspaceState, _ id: String, assetPath: @escaping (String) -> String, now: Double = JSEnvironment.now()) -> String? {
        guard let page = state.pages[id] else { return nil }
        let context = RenderContext(href: { _ in nil }, assetPath: assetPath, titleOf: { state.pages[$0].map(Model.displayTitle) },
                                    renderMath: Katex.mathML)
        let doc = state.docs[id]
        let main: String
        if page.kind == .database, page.database != nil {
            main = databaseHtml(state, page, context, now: now)
        } else if let doc {
            main = docToHtml(doc, context)
        } else {
            main = ""
        }
        let tags = page.tags.isEmpty ? "" : "<p class=\"tags\">" + page.tags.map { "<span>#\(escape($0))</span>" }.joined(separator: " ") + "</p>"
        let icon = page.icon.flatMap { $0.isEmpty ? nil : "<span class=\"icon\">\(escape($0))</span> " } ?? ""
        return """
            <!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="color-scheme" content="light">
            <title>\(escape(Model.displayTitle(page)))</title>
            <style>\(siteCSS)
            :root{color-scheme:light;--bg:#fff;--text:#22201c;--muted:#6b665d;--line:#e6e2d9;--accent:#b04f29;--soft:rgba(192,88,47,.1);--code:#f1eee8}
            body{display:block;background:#fff}main{max-width:none;padding:0}img{max-width:100%}
            </style>
            </head>
            <body><main><article>
            <h1>\(icon)\(escape(Model.displayTitle(page)))</h1>
            \(tags)\(main)
            </article></main></body>
            </html>
            """
    }

    static let siteCSS = """
        :root{color-scheme:light dark;--bg:#fbfaf7;--text:#22201c;--muted:#6b665d;--line:#e6e2d9;--accent:#b04f29;--soft:rgba(192,88,47,.1);--code:#f1eee8}
        @media (prefers-color-scheme:dark){:root{--bg:#1b1a18;--text:#e9e5dd;--muted:#a49e93;--line:#2f2d2a;--accent:#e27d50;--soft:rgba(226,125,80,.15);--code:#262421}}
        *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.7 Georgia,'Iowan Old Style',serif;display:grid;grid-template-columns:260px minmax(0,1fr)}
        .site-nav{position:sticky;top:0;height:100vh;overflow:auto;padding:24px 16px;border-right:1px solid var(--line);font:14px/1.5 system-ui,sans-serif}
        .site-nav ul{list-style:none;margin:0;padding-left:12px}.site-nav>ul{padding:0}.site-nav a{display:block;padding:3px 6px;border-radius:5px;color:var(--muted);text-decoration:none}
        .site-nav a:hover,.site-nav a[aria-current]{background:var(--soft);color:var(--text)}.site-title{font-weight:600;color:var(--text)!important;margin-bottom:12px}
        main{max-width:760px;width:100%;margin:0 auto;padding:56px 32px}h1{font-size:2.2em;line-height:1.2}a{color:var(--accent)}
        .page-link{text-decoration:none;background:var(--soft);border-radius:3px;padding:0 .2em}.page-link.missing{color:var(--muted);background:none}
        code,pre{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85em;background:var(--code);border-radius:5px}code{padding:.1em .3em}pre{padding:14px 16px;overflow:auto}pre code{padding:0;background:none}
        blockquote{margin:0;padding-left:16px;border-left:3px solid var(--line);color:var(--muted)}mark{background:rgba(214,160,40,.3);color:inherit}
        .callout{padding:10px 16px;margin:1em 0;border-left:3px solid #4f7aa8;background:rgba(79,122,168,.09);border-radius:6px}.tone-tip{border-color:#4d8a5c;background:rgba(77,138,92,.1)}.tone-warning{border-color:#b7791f;background:rgba(183,121,31,.11)}.tone-danger{border-color:#b3261e;background:rgba(179,38,30,.08)}.callout-title{font-weight:600;margin:0}
        .table{overflow:auto}table{border-collapse:collapse;font:15px/1.5 system-ui,sans-serif}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left}th{color:var(--muted);font-weight:500}
        ul.tasks{list-style:none;padding-left:4px}img{max-width:100%;border-radius:6px}figure{margin:1em 0}.math-block{overflow:auto;text-align:center}
        .tags span{font:13px system-ui,sans-serif;color:var(--accent);background:var(--soft);padding:2px 8px;border-radius:99px}
        .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.card{border:1px solid var(--line);border-radius:10px;padding:12px 14px;font:15px/1.5 system-ui,sans-serif}.card p{margin:0}
        .subpages,.backlinks{margin-top:3em;padding-top:1em;border-top:1px solid var(--line);font:15px/1.6 system-ui,sans-serif}.subpages h2,.backlinks h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
        @media (max-width:800px){body{display:block}.site-nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:32px 20px}}

        """
}
