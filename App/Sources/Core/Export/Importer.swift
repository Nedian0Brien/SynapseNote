import Foundation

/// Morrow's core/importer.ts: a Notion export or any folder of Markdown files as pages, keeping the folder tree;
/// Notion's databases (a CSV of rows beside a folder with a page per row) become real databases.
nonisolated enum Importer {
    struct Entry: Sendable {
        var path: String
        var data: Data
    }

    struct Plan {
        var pages: [PageMeta]
        var docs: JSRecord<DocNode>
        var files: [(meta: FileMeta, data: Data)]
        var problems: [String]
    }

    private static let maxTableRows = 1000
    // notion appends a 32 character hex id to every exported name
    private static let notionId = JSRegex(#"\s+[0-9a-f]{32}$"#, ignoreCase: true)
    private static let mime: [String: String] = [
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
        "svg": "image/svg+xml", "avif": "image/avif", "bmp": "image/bmp", "pdf": "application/pdf", "txt": "text/plain",
        "csv": "text/csv", "json": "application/json", "zip": "application/zip", "mp3": "audio/mpeg", "mp4": "video/mp4",
        "mov": "video/quicktime", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]

    static func mimeType(_ name: String) -> String {
        let last = JSText.split(name, on: 0x2E).last ?? ""
        return mime[JSText.string(JSText.lowercased(last.units))] ?? "application/octet-stream"
    }

    /// `new TextDecoder().decode(bytes)`: UTF-8, a leading byte order mark dropped, broken sequences replaced
    static func decode(_ data: Data) -> String {
        var bytes = data
        if bytes.starts(with: [0xEF, 0xBB, 0xBF]) { bytes.removeFirst(3) }
        return String(decoding: bytes, as: UTF8.self)
    }

    private static let markdownFile = JSRegex(#"\.(md|markdown)$"#, ignoreCase: true)
    private static let csvFile = JSRegex(#"\.csv$"#, ignoreCase: true)
    private static let pageFile = JSRegex(#"\.(md|markdown|csv)$"#, ignoreCase: true)
    private static let allSuffix = JSRegex(#"_all$"#)
    private static let allCsv = JSRegex(#"_all\.csv$"#, ignoreCase: true)

    private struct Key {
        var id: String
        var title: String
    }

    static func planArchiveImport(_ state: WorkspaceState, _ entries: [Entry], _ parentId: String?, _ newId: @escaping () -> String, now: Double) -> Plan {
        let usable = entries.map { Entry(path: normalizePath($0.path), data: $0.data) }.filter { entry in
            !entry.path.isEmpty && !JSText.split(entry.path, on: 0x2F).contains { $0.hasPrefix(".") || $0 == "__MACOSX" }
        }
        let root = commonWrapper(usable.map(\.path))
        let files = usable.map { Entry(path: JSText.string(JSText.slice($0.path.units, root.utf16.count)), data: $0.data) }.filter { !$0.path.isEmpty }

        let markdown = files.filter { markdownFile.test($0.path) }
        let tables = pickTables(files.filter { csvFile.test($0.path) })
        var assets = JSMap<Entry>()
        for entry in files where !pageFile.test(entry.path) { assets[entry.path] = entry }

        // every page is keyed by its path without the extension, which is also the folder holding its subpages
        var keys = JSMap<Key>()
        for entry in markdown { keys[stripExtension(entry.path)] = Key(id: newId(), title: cleanName(entry.path)) }
        for entry in tables {
            let key = withoutAll(stripExtension(entry.path))
            if !keys.has(key) { keys[key] = Key(id: newId(), title: cleanName(key)) }
        }
        var folders = JSMap<Key>()
        for key in keys.keys {
            var dir = dirname(key)
            while !dir.isEmpty {
                if !keys.has(dir), !folders.has(dir) { folders[dir] = Key(id: newId(), title: cleanName(dir)) }
                dir = dirname(dir)
            }
        }
        func pageAt(_ key: String) -> Key? { keys[key] ?? folders[key] }

        var referenced = JSMap<FileMeta>()
        var problems: [String] = []
        var docs = JSRecord<DocNode>()
        var titles = JSMap<String>()

        for entry in markdown {
            let key = stripExtension(entry.path)
            let page = keys[key]!
            let base = dirname(entry.path)
            var options = MarkdownParse.Options()
            options.resolvePage = { title in findByTitle(keys, title) ?? Search.pageIdByTitle(state, title) }
            options.resolveLink = { href in resolveHref(base, href).flatMap { keys[stripExtension($0)]?.id } }
            options.resolveFile = { href in
                guard let target = resolveHref(base, href), let asset = assets[target] else { return nil }
                var meta = referenced[asset.path]
                if meta == nil {
                    let name = JSText.split(asset.path, on: 0x2F).last!
                    meta = FileMeta(id: newId(), name: name, type: mimeType(name), size: Double(asset.data.count), createdAt: now)
                    referenced[asset.path] = meta
                }
                return MarkdownParse.FileRef(fileId: meta!.id, name: meta!.name, image: meta!.type.hasPrefix("image/"))
            }
            let parsed = MarkdownParse.markdownToPage(decode(entry.data), fallbackTitle: page.title, options)
            docs[page.id] = parsed.doc
            let title = JSText.string(notionId.replaceAll(parsed.title.units) { _ in [] })
            titles[page.id] = title.isEmpty ? page.title : title
        }

        struct Extra {
            var kind: PageKind?
            var database: DatabaseDef?
            var properties: JSObject?
        }
        var extras = JSMap<Extra>()
        var newRows: [PageMeta] = []
        for entry in tables {
            let key = withoutAll(stripExtension(entry.path))
            let page = keys[key]!
            let rows = parseCsv(decode(entry.data))
            if rows.isEmpty { continue }
            if rows.count > maxTableRows + 1 { problems.append("Only the first \(maxTableRows) rows of \(page.title) were imported.") }
            let kept = Array(rows.prefix(maxTableRows + 1))
            let header = kept[0]
            let body = Array(kept.dropFirst())
            let database = Database.databaseFromTable(header, body, newId)
            extras[page.id] = Extra(kind: .database, database: database)
            if docs[page.id] == nil { docs[page.id] = Model.emptyDoc() }
            let rowPages = keys.keys.filter { dirname($0).jsEquals(key) }.map { ($0, keys[$0]!) }
            var claimed = JSSet()
            for (index, cells) in body.enumerated() {
                let first = JSText.trim(cells.first ?? "")
                let title = first.isEmpty ? "Untitled" : first
                var values = JSObject()
                for (column, prop) in database.properties.enumerated() {
                    let value = Database.parseCellValue(prop, column + 1 < cells.count ? cells[column + 1] : "")
                    if !value.isNull { values[prop.id] = value }
                }
                if let match = rowPages.first(where: { _, row in !claimed.has(row.id) && JSText.trim(titles[row.id] ?? row.title).jsEquals(title) }) {
                    claimed.insert(match.1.id)
                    extras[match.1.id] = Extra(properties: values)
                    if let doc = docs[match.1.id] { docs[match.1.id] = withoutPropertyLines(doc, Array(header.dropFirst())) }
                } else {
                    let id = newId()
                    var row = PageMeta(id: id, parentId: page.id, createdAt: now)
                    row.title = title
                    row.order = Double(index)
                    row.properties = values
                    newRows.append(row)
                    docs[id] = Model.emptyDoc()
                }
            }
        }
        for folder in folders.valuesInOrder { docs[folder.id] = Model.emptyDoc() }

        let all = (keys.keys.map { ($0, keys[$0]!) } + folders.keys.map { ($0, folders[$0]!) })
            .jsSorted { JSCollator.compare($0.0, $1.0, locale: JSEnvironment.locale) }
        var counters: [String?: Double] = [:]
        let base = Double(Tree.childrenOf(state.pages, parentId).count)
        var pages: [PageMeta] = all.map { key, entry in
            let parent = pageAt(dirname(key))?.id ?? parentId
            let order = counters[parent] ?? (parent == parentId ? base : 0)
            counters[parent] = order + 1
            var page = PageMeta(id: entry.id, parentId: parent, createdAt: now)
            page.title = titles[entry.id] ?? entry.title
            page.order = order
            if let extra = extras[entry.id] {
                if let kind = extra.kind { page.kind = kind }
                if let database = extra.database { page.database = database }
                if let properties = extra.properties { page.properties = properties }
            }
            return page
        }
        for index in newRows.indices { newRows[index].order += counters[newRows[index].parentId] ?? 0 }
        pages += newRows

        let stored = referenced.keys.map { path in (meta: referenced[path]!, data: assets[path]!.data) }
        return Plan(pages: pages, docs: docs, files: stored, problems: problems)
    }

    private static let leadingDots = JSRegex(#"^(\.\/|\/)+"#)

    private static func normalizePath(_ path: String) -> String {
        let slashes = JSText.replacing(path, 0x5C, with: "/")
        return JSText.string(leadingDots.replaceAll(slashes.units) { _ in [] })
    }

    /// a single folder wrapping everything, like notion's export folder, is not a page
    private static func commonWrapper(_ paths: [String]) -> String {
        var prefix = ""
        while true {
            guard let firstPath = paths.first else { return prefix }
            let first = JSText.split(JSText.string(JSText.slice(firstPath.units, prefix.utf16.count)), on: 0x2F)[0]
            if first.isEmpty || paths.contains(where: { !JSText.startsWith($0.units, "\(prefix)\(first)/".units) }) { return prefix }
            if paths.contains(where: { $0.jsEquals("\(prefix)\(first).md") || $0.jsEquals("\(prefix)\(first).csv") }) { return prefix }
            prefix = "\(prefix)\(first)/"
        }
    }

    private static func pickTables(_ entries: [Entry]) -> [Entry] {
        var byKey = JSMap<Entry>()
        for entry in entries {
            let key = withoutAll(stripExtension(entry.path))
            // notion writes both name.csv and name_all.csv, the second has every row
            if byKey[key] == nil || allCsv.test(entry.path) { byKey[key] = entry }
        }
        return byKey.valuesInOrder
    }

    private static func stripExtension(_ path: String) -> String { JSText.string(pageFile.replaceAll(path.units) { _ in [] }) }
    private static func withoutAll(_ text: String) -> String { JSText.string(allSuffix.replaceAll(text.units) { _ in [] }) }

    private static func dirname(_ path: String) -> String {
        let index = JSText.lastIndexOf(path.units, 0x2F)
        return index == -1 ? "" : JSText.string(JSText.slice(path.units, 0, index))
    }

    private static func cleanName(_ path: String) -> String {
        let name = withoutAll(stripExtension(JSText.split(path, on: 0x2F).last ?? ""))
        let cleaned = JSText.trim(JSText.string(notionId.replaceAll(name.units) { _ in [] }))
        return cleaned.isEmpty ? "Untitled" : cleaned
    }

    private static func findByTitle(_ keys: JSMap<Key>, _ title: String) -> String? {
        let folded = JSText.lowercased(JSText.trim(title.units))
        return keys.valuesInOrder.first { JSText.lowercased($0.title.units) == folded }?.id
    }

    private static let scheme = JSRegex(#"^[a-z][a-z0-9+.-]*:"#, ignoreCase: true)

    /// resolves a relative href against the folder of the file that contains it
    private static func resolveHref(_ base: String, _ href: String) -> String? {
        if href.isEmpty || scheme.test(href) || href.hasPrefix("#") { return nil }
        let units = href.units
        let cut = units.firstIndex { $0 == 0x3F || $0 == 0x23 } ?? units.count
        var decoded = JSText.string(units[..<cut])
        if let plain = JSURI.decodeURIComponent(decoded) { decoded = plain }
        var out: [String] = []
        for part in JSText.split(base.isEmpty ? decoded : "\(base)/\(decoded)", on: 0x2F) {
            if part.isEmpty || part == "." { continue }
            if part == ".." { _ = out.popLast() } else { out.append(part) }
        }
        return out.joined(separator: "/")
    }

    static func parseCsv(_ text: String) -> [[String]] {
        var rows: [[String]] = []
        var row: [String] = []
        var field: [UInt16] = []
        var quoted = false
        var source = text.units
        if source.first == 0xFEFF { source.removeFirst() }
        var i = 0
        while i < source.count {
            let char = source[i]
            if quoted {
                if char == 0x22, source.at(i + 1) == 0x22 {
                    field.append(0x22)
                    i += 1
                } else if char == 0x22 {
                    quoted = false
                } else {
                    field.append(char)
                }
            } else if char == 0x22 {
                quoted = true
            } else if char == 0x2C {
                row.append(JSText.string(field))
                field = []
            } else if char == 0x0A || char == 0x0D {
                if char == 0x0D, source.at(i + 1) == 0x0A { i += 1 }
                row.append(JSText.string(field))
                rows.append(row)
                row = []
                field = []
            } else {
                field.append(char)
            }
            i += 1
        }
        if !field.isEmpty || !row.isEmpty {
            row.append(JSText.string(field))
            rows.append(row)
        }
        return rows.filter { $0.contains { !JSText.trim($0).isEmpty } }
    }

    /// notion repeats a row's properties as "Name: value" lines at the top of its page, they now live in the database
    private static func withoutPropertyLines(_ doc: DocNode, _ names: [String]) -> DocNode {
        let prefixes = names.map { "\(JSText.trim($0)):" }.filter { $0.utf16.count > 1 }
        var content = doc.content ?? []
        while let first = content.first {
            let text = first.type == "paragraph" ? JSText.trim(Doc.inlineText(first)) : ""
            if text.isEmpty || !prefixes.contains(where: { JSText.startsWith(text.units, $0.units) }) { break }
            content.removeFirst()
        }
        return content.isEmpty ? Model.emptyDoc() : doc.with(content: content)
    }
}
