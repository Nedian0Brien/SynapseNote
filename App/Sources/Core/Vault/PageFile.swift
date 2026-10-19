import Foundation

/// Morrow's core/vault/pageFile.ts: how one page maps to its markdown file, frontmatter for metadata, the body
/// for content.
nonisolated enum PageFile {
    /// frontmatter keys morrow reads and writes, every other key is kept exactly as it was
    static let managedKeys: Set<String> = ["title", "icon", "kind", "tags", "tag", "database", "cover"]
    private static let fileKinds: [PageKind] = [.journal, .templates, .database]

    /// a database property can not use a name morrow already gives a meaning to
    static func reservedPropertyName(_ name: String) -> Bool {
        let trimmed = JSText.trim(name)
        return managedKeys.contains(trimmed) || trimmed == "aliases"
    }

    struct Source: Equatable, Sendable {
        /// frontmatter keys in the order the file had them
        var keyOrder: [String]
        /// frontmatter values morrow does not manage
        var extra: JSObject
        /// the frontmatter as it was read, and its exact text, reused when nothing in it changed
        var rawData: JSObject?
        var rawHead: String
        /// the body as read from disk, kept while the page has not been edited in morrow
        var body: String?
        /// other names the page answers to in [[links]], from obsidian's aliases property
        var aliases: [String]

        var json: JSValue {
            [
                "keyOrder": .array(keyOrder.map(JSValue.string)), "extra": .object(extra),
                "rawData": rawData.map(JSValue.object) ?? .null, "rawHead": .string(rawHead),
                "body": body.map(JSValue.string) ?? .null, "aliases": .array(aliases.map(JSValue.string)),
            ]
        }
    }

    struct Read {
        var title: String?
        var icon: String?
        var cover: String?
        var kind: PageKind?
        var tags: [String]
        var database: DatabaseDef?
        /// every frontmatter value, property values are mapped once the parent database is known
        var data: JSObject
        var source: Source
        var body: String
        var error: String?
    }

    private static let lineBreaks = JSRegex(#"[\r\n\t]+"#)

    static func readPageText(_ text: String) -> Read {
        let split = Frontmatter.split(text)
        let data = split.data ?? JSObject()
        var title: String?
        if case .string(let raw) = data["title"], !JSText.trim(raw).isEmpty {
            title = JSText.string(JSText.slice(lineBreaks.replaceAll(raw.units) { _ in [0x20] }, 0, Model.maxTitleLength))
        }
        var icon: String?
        if case .string(let raw) = data["icon"], !raw.isEmpty, raw.unicodeScalars.count <= Model.maxIconLength { icon = raw }
        let kind = data["kind"]?.string.flatMap(PageKind.init(rawValue:)).flatMap { fileKinds.contains($0) ? $0 : nil }
        var extra = JSObject()
        for (key, value) in data where !managedKeys.contains(key) { extra[key] = value }
        let rawAliases: [JSValue] = switch data["aliases"] {
        case .array(let items): items
        case .string(let alias): [.string(alias)]
        default: []
        }
        let aliases = rawAliases.compactMap(\.string).filter { !JSText.trim($0).isEmpty }.map(JSText.trim)
        let tagsValue = data["tags"].flatMap { $0.isNull ? nil : $0 } ?? data["tag"]
        return Read(
            title: title,
            icon: icon,
            cover: Model.validCover(data["cover"]),
            kind: kind,
            tags: Frontmatter.readTags(tagsValue),
            database: kind == .database ? Migrations.normalizeDatabase(data["database"]) : nil,
            data: data,
            source: Source(keyOrder: data.keys, extra: extra, rawData: split.data, rawHead: split.head, body: split.body, aliases: aliases),
            body: split.body,
            error: split.error,
        )
    }

    /// the title a file implies on its own, so frontmatter only carries a title when it differs
    static func impliedTitle(_ fileBase: String, _ dailyDate: String?) -> String {
        if let dailyDate, let date = Daily.parseDateKey(dailyDate) { return Daily.dailyTitle(date) }
        return fileBase
    }

    static func managedFrontmatter(_ page: PageMeta, fileBase: String, parentDatabase: DatabaseDef?) -> JSMap<JSValue> {
        var out = JSMap<JSValue>()
        let title = Model.displayTitle(page)
        if !title.jsEquals(impliedTitle(fileBase, page.dailyDate)) { out["title"] = .string(title) }
        if let icon = page.icon, !icon.isEmpty, page.kind != .canvas { out["icon"] = .string(icon) }
        if let cover = page.cover, !cover.isEmpty, page.kind != .canvas { out["cover"] = .string(cover) }
        if fileKinds.contains(page.kind) { out["kind"] = .string(page.kind.rawValue) }
        if !page.tags.isEmpty { out["tags"] = .array(page.tags.map(JSValue.string)) }
        for prop in parentDatabase?.properties ?? [] {
            if let value = writeProperty(prop, page.properties[prop.id]) { out[prop.name] = value }
        }
        if page.kind == .database, let database = page.database { out["database"] = databaseToYaml(database) }
        return out
    }

    /// keeps the order and unknown keys of the existing frontmatter, adds new keys at the end
    static func composeFrontmatter(_ managed: JSMap<JSValue>, _ source: Source?) -> JSObject {
        var out = JSObject()
        for key in source?.keyOrder ?? [] {
            if let value = managed[key] { out[key] = value } else if let value = source?.extra[key] { out[key] = value }
        }
        for (key, value) in managed where !out.has(key) { out[key] = value }
        return out
    }

    static func renderPageText(_ frontmatter: JSObject, _ source: Source?, _ body: String) -> String {
        if let source, let rawData = source.rawData, !source.rawHead.isEmpty, sameFrontmatter(frontmatter, rawData, source.extra) {
            return source.rawHead + body
        }
        return Frontmatter.join(frontmatter, body)
    }

    /// `sameValue(frontmatter, rawData)` as JavaScript decides it: a list or record kept from the file is the very
    /// object rawData holds (`extra` takes its values from it), which `===` finds equal before looking inside,
    /// so a NaN inside it does not count as a change
    private static func sameFrontmatter(_ frontmatter: JSObject, _ rawData: JSObject, _ extra: JSObject) -> Bool {
        guard frontmatter.count == rawData.count else { return false }
        return frontmatter.allSatisfy { key, value in
            guard let raw = rawData[key] else { return false }
            if value.array != nil || value.object != nil, let kept = extra[key], value.identical(to: kept), kept.identical(to: raw) { return true }
            return sameValue(value, raw)
        }
    }

    /// `writeProperty`: the frontmatter value of a property, nil where Morrow gives undefined
    static func writeProperty(_ prop: PropDef, _ value: JSValue?) -> JSValue? {
        guard let value, !value.isNull, value != .string("") else { return nil }
        switch prop.type {
        case "number":
            if case .number = value { return value }
            return nil
        case "checkbox":
            return value == .bool(true) ? .bool(true) : nil
        case "select":
            return prop.options.first { JSValue.string($0.id) == value }.map { .string($0.name) }
        case "formula":
            // computed every time, never written
            return nil
        case "relation":
            // links in the frontmatter, the way obsidian writes them, so the related pages show up in its graph too
            let items: [JSValue] = value.array ?? [.string(value.jsString)]
            let targets = items.filter(\.truthy)
            return targets.isEmpty ? nil : .array(targets.map { .string("[[\($0.jsString)]]") })
        case "multiSelect":
            let names = (value.array ?? []).compactMap { id in prop.options.first { JSValue.string($0.id) == id }?.name }
            return names.isEmpty ? nil : .array(names.map(JSValue.string))
        default:
            if case .string = value { return value }
            return .string(value.jsString)
        }
    }

    private static let truthyText = JSRegex(#"^(true|yes|x)$"#, ignoreCase: true)
    private static let dateStart = JSRegex(#"^\d{4}-\d{2}-\d{2}"#)
    private static let wikiEnds = JSRegex(#"^\[\[|\]\]$"#)

    /// `readProperty`: a frontmatter value read as the property's type, adding select options it has not seen yet
    static func readProperty(_ prop: PropDef, _ raw: JSValue?, _ newOptionId: () -> String) -> (value: JSValue, added: [SelectOption]) {
        var added: [SelectOption] = []
        func optionFor(_ name: String) -> String {
            let wanted = JSText.lowercased(name.units)
            if let known = (prop.options + added).first(where: { JSText.lowercased($0.name.units) == wanted }) { return known.id }
            let option = SelectOption(id: newOptionId(), name: JSText.string(JSText.slice(name.units, 0, 200)),
                                      color: Model.colors[(prop.options.count + added.count) % Model.colors.count])
            added.append(option)
            return option.id
        }
        switch prop.type {
        case "number":
            var number = Double.nan
            if case .number(let value) = raw { number = value } else if case .string(let text) = raw { number = JSNumber.parse(JSText.trim(text)) }
            return (number.isFinite && raw != .string("") ? .number(number) : .null, added)
        case "checkbox":
            var checked = raw == .bool(true)
            if case .string(let text) = raw, truthyText.test(JSText.trim(text)) { checked = true }
            return (.bool(checked), added)
        case "select":
            let name = scalarText(raw?.array.map { $0.first ?? .null } ?? raw)
            return (name.flatMap { $0.isEmpty ? nil : JSValue.string(optionFor($0)) } ?? .null, added)
        case "multiSelect":
            let list: [JSValue] = raw?.array ?? raw?.string.map { JSText.split($0, on: 0x2C).map(JSValue.string) } ?? []
            var ids = JSSet()
            for name in list.compactMap(scalarText) where !name.isEmpty { ids.insert(optionFor(name)) }
            return (ids.isEmpty ? .null : .array(ids.items.map(JSValue.string)), added)
        case "formula":
            return (.null, added)
        case "relation":
            let list: [JSValue] = raw?.array ?? raw?.string.map { splitRelations($0).map(JSValue.string) } ?? []
            var targets = JSSet()
            for item in list {
                let text = wikiEnds.replaceAll((scalarText(item) ?? "").units) { _ in [] }
                let target = JSText.trim(JSText.split(JSText.string(text), on: 0x7C)[0])
                if !target.isEmpty { targets.insert(target) }
            }
            return (targets.isEmpty ? .null : .array(targets.items.prefix(500).map(JSValue.string)), added)
        case "date":
            let text = scalarText(raw)
            let match = text.flatMap { dateStart.exec($0.units) }
            return (match.map { .string(JSText.string($0.text)) } ?? .null, added)
        default:
            let text = scalarText(raw) ?? ""
            return (text.isEmpty ? .null : .string(text), added)
        }
    }

    /// `raw.split(/,(?![^[]*\]\])/)`: commas outside a [[link]]
    private static func splitRelations(_ text: String) -> [String] {
        let units = text.units
        var parts: [String] = []
        var start = 0
        for (i, unit) in units.enumerated() where unit == 0x2C {
            let bracket = JSText.indexOf(units, 0x5B, from: i + 1)
            let window = Array(units[(i + 1)..<(bracket == -1 ? units.count : bracket)])
            if JSText.indexOf(window, [0x5D, 0x5D]) != -1 { continue }
            parts.append(JSText.string(units[start..<i]))
            start = i + 1
        }
        parts.append(JSText.string(units[start...]))
        return parts
    }

    private static func scalarText(_ value: JSValue?) -> String? {
        switch value {
        case .string(let text): JSText.trim(text)
        case .number(let number): JSNumber.string(number)
        case .bool(let flag): flag ? "true" : "false"
        default: nil
        }
    }

    private static func databaseToYaml(_ database: DatabaseDef) -> JSValue {
        let properties: [JSValue] = database.properties.map { prop in
            var object = JSObject([("id", .string(prop.id)), ("name", .string(prop.name)), ("type", .string(prop.type))])
            if !prop.options.isEmpty { object["options"] = .array(prop.options.map(\.json)) }
            if prop.type == "formula", let formula = prop.formula, !formula.isEmpty { object["formula"] = .string(formula) }
            return .object(object)
        }
        let views: [JSValue] = database.views.map { view in
            var object = JSObject([("id", .string(view.id)), ("name", .string(view.name)), ("type", .string(view.type))])
            if !view.filters.isEmpty { object["filters"] = .array(view.filters.map(\.json)) }
            if !view.sorts.isEmpty { object["sorts"] = .array(view.sorts.map(\.json)) }
            if let groupBy = view.groupBy, !groupBy.isEmpty { object["groupBy"] = .string(groupBy) }
            if let dateProp = view.dateProp, !dateProp.isEmpty { object["dateProp"] = .string(dateProp) }
            if !view.hidden.isEmpty { object["hidden"] = .array(view.hidden.map(JSValue.string)) }
            return .object(object)
        }
        return ["properties": .array(properties), "views": .array(views)]
    }

    /// `sameValue`: strict equality of primitives (NaN is never equal), lists in order, records by their keys
    /// whatever their order
    static func sameValue(_ a: JSValue, _ b: JSValue) -> Bool {
        switch (a, b) {
        case (.array(let x), .array(let y)): return x.count == y.count && zip(x, y).allSatisfy(sameValue)
        case (.object(let x), .object(let y)):
            return x.count == y.count && x.allSatisfy { key, value in y[key].map { sameValue(value, $0) } ?? false }
        case (.array, _), (.object, _): return false
        default: return a == b
        }
    }
}
