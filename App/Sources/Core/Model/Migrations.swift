import Foundation

/// The record checks of Morrow's core/migrations.ts: every record is validated on its own, so one bad record
/// never blocks the rest.
nonisolated enum Migrations {
    private static let idPattern = JSRegex(#"^[A-Za-z0-9_-]{1,64}$"#)
    private static let datePattern = JSRegex(#"^\d{4}-\d{2}-\d{2}$"#)
    private static let lineBreaks = JSRegex(#"[\r\n\t]+"#)
    private static let maxNameLength = 200
    private static let filterOps = ["contains", "notContains", "is", "isNot", "empty", "notEmpty", "gt", "lt", "checked", "unchecked"]

    static func validId(_ value: JSValue?) -> Bool {
        guard case .string(let text) = value else { return false }
        return idPattern.test(text)
    }

    static func isID(_ text: String) -> Bool { idPattern.test(text) }

    private static func nameOf(_ value: JSValue?, _ fallback: String) -> String {
        guard case .string(let text) = value else { return fallback }
        return JSText.string(JSText.slice(text.units, 0, maxNameLength))
    }

    static func records(_ value: JSValue?) -> [JSObject] {
        guard case .array(let items) = value else { return [] }
        return items.compactMap(\.object)
    }

    /// `normalizeValue`: a property value, nil where Morrow gives undefined
    static func normalizeValue(_ value: JSValue?) -> JSValue? {
        switch value {
        case .null, .string, .bool: return value
        case .number(let number): return number.isFinite ? value : nil
        case .array(let items): return items.allSatisfy { $0.string != nil } ? value : nil
        default: return nil
        }
    }

    static func normalizeProperties(_ raw: JSValue?) -> JSObject {
        guard case .object(let object) = raw else { return JSObject() }
        var result = JSObject()
        for (key, value) in object {
            if let normalized = normalizeValue(value), idPattern.test(key) { result[key] = normalized }
        }
        return result
    }

    private static func normalizeProp(_ raw: JSObject) -> PropDef? {
        guard validId(raw["id"]), case .string(let type) = raw["type"], Model.propTypes.contains(type) else { return nil }
        let options = records(raw["options"]).filter { validId($0["id"]) }.map { option in
            let color = option["color"]?.string.flatMap { Model.colors.contains($0) ? $0 : nil } ?? "gray"
            return SelectOption(id: option["id"]!.string!, name: nameOf(option["name"], ""), color: color)
        }
        var formula: String?
        if type == "formula", case .string(let text) = raw["formula"] { formula = JSText.string(JSText.slice(text.units, 0, 2000)) }
        return PropDef(id: raw["id"]!.string!, name: nameOf(raw["name"], ""), type: type, options: options, formula: formula)
    }

    private static func propRef(_ value: JSValue?) -> String? {
        guard case .string(let text) = value, text.utf16.count <= 64 else { return nil }
        return text
    }

    private static func normalizeView(_ raw: JSObject) -> ViewDef? {
        guard validId(raw["id"]), case .string(let type) = raw["type"], Model.viewTypes.contains(type) else { return nil }
        let filters: [FilterRule] = records(raw["filters"]).compactMap { filter in
            guard let prop = propRef(filter["prop"]), let value = normalizeValue(filter["value"]), validId(filter["id"]),
                  case .string(let op) = filter["op"], filterOps.contains(op)
            else { return nil }
            return FilterRule(id: filter["id"]!.string!, prop: prop, op: op, value: value)
        }
        let sorts: [SortRule] = records(raw["sorts"]).compactMap { sort in
            guard let prop = propRef(sort["prop"]) else { return nil }
            return SortRule(prop: prop, dir: sort["dir"] == .string("desc") ? "desc" : "asc")
        }
        let hidden = raw["hidden"]?.array?.compactMap { propRef($0) } ?? []
        return ViewDef(id: raw["id"]!.string!, name: nameOf(raw["name"], ""), type: type, filters: filters, sorts: sorts,
                       groupBy: propRef(raw["groupBy"]), dateProp: propRef(raw["dateProp"]), hidden: hidden)
    }

    static func normalizeDatabase(_ raw: JSValue?) -> DatabaseDef? {
        guard case .object(let object) = raw else { return nil }
        return DatabaseDef(properties: records(object["properties"]).compactMap(normalizeProp),
                           views: records(object["views"]).compactMap(normalizeView))
    }

    private static func finite(_ value: JSValue?) -> Double? {
        guard case .number(let number) = value, number.isFinite else { return nil }
        return number
    }

    /// `normalizePage`: fills safe defaults for missing optional fields, rejects records without a usable id
    static func normalizePage(_ value: JSValue) -> PageMeta? {
        guard case .object(let raw) = value, case .string(let id) = raw["id"], idPattern.test(id) else { return nil }
        let updatedAt = finite(raw["updatedAt"]) ?? finite(raw["createdAt"]) ?? 0
        var parentId: String?
        if case .string(let parent) = raw["parentId"], idPattern.test(parent), parent != id { parentId = parent }
        var page = PageMeta(id: id, parentId: parentId, createdAt: finite(raw["createdAt"]) ?? updatedAt, updatedAt: updatedAt)
        if case .string(let title) = raw["title"] {
            page.title = JSText.string(JSText.slice(lineBreaks.replaceAll(title.units) { _ in [0x20] }, 0, Model.maxTitleLength))
        }
        if case .string(let icon) = raw["icon"], !icon.isEmpty, icon.unicodeScalars.count <= Model.maxIconLength { page.icon = icon }
        if case .string(let kind) = raw["kind"], let known = PageKind(rawValue: kind) { page.kind = known }
        page.order = finite(raw["order"]) ?? 0
        page.trashedAt = finite(raw["trashedAt"])
        page.favorite = raw["favorite"] == .bool(true)
        if case .string(let date) = raw["dailyDate"], datePattern.test(date) { page.dailyDate = date }
        page.lastOpenedAt = finite(raw["lastOpenedAt"])
        var tags = JSSet()
        for tag in raw["tags"]?.array ?? [] { if case .string(let text) = tag, !text.isEmpty { tags.insert(text) } }
        page.tags = tags.items
        page.properties = normalizeProperties(raw["properties"])
        page.database = normalizeDatabase(raw["database"])
        page.cover = Model.validCover(raw["cover"])
        page.encrypted = raw["encrypted"] == .bool(true)
        return page
    }

    struct Loaded {
        var pages: [PageMeta]
        var docs: JSRecord<DocNode>
        /// records that could not be read, reported to the user and left untouched in storage
        var problems: [String]
        /// pages whose stored content failed validation, opened read only so nothing overwrites it
        var unreadable: [String]
    }

    /// `migrate`: versions 1 and 2 only added fields, which normalizePage fills
    static func migrate(_ version: Double, pages: [JSValue], docs: JSObject) -> Result<(pages: [JSValue], docs: JSObject), CommandFailure> {
        guard version.isFinite, version == version.rounded(.towardZero), version >= 1 else {
            return .failure(CommandFailure(message: "The data has an unknown format version."))
        }
        if version > Double(Model.schemaVersion) {
            let text = JSNumber.string(version)
            return .failure(CommandFailure(message: "This data was written by a newer version of SynapseNote (format \(text)). Please update SynapseNote."))
        }
        return .success((pages, docs))
    }

    /// `readWorkspace`: every record is checked on its own so one bad record never blocks the rest
    static func readWorkspace(_ version: Double, pages raw: [JSValue], docs rawDocs: JSObject) -> Result<Loaded, CommandFailure> {
        switch migrate(version, pages: raw, docs: rawDocs) {
        case .failure(let error): return .failure(error)
        case .success(let migrated):
            var loaded = Loaded(pages: [], docs: JSRecord(), problems: [], unreadable: [])
            var seen = JSSet()
            for record in migrated.pages {
                guard let page = normalizePage(record) else {
                    loaded.problems.append("A page record could not be read and was skipped.")
                    continue
                }
                if !seen.insert(page.id) { continue }
                loaded.pages.append(page)
                guard let doc = migrated.docs[page.id] else { continue }
                if let error = Doc.validateDoc(doc) {
                    loaded.unreadable.append(page.id)
                    loaded.problems.append("The content of \"\(page.title.isEmpty ? "Untitled" : page.title)\" could not be read: \(error)")
                } else if case .object(let node) = doc {
                    loaded.docs[page.id] = node
                }
            }
            return .success(loaded)
        }
    }
}
