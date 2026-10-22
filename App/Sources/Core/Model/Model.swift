import Foundation

/// Where the JavaScript engine Morrow runs in takes its locale and time zone from: string collation, date keys
/// and date titles follow these. The app uses the system's, as its web view does; tests fix them to the
/// fixtures' (en-US, UTC).
nonisolated enum JSEnvironment {
    /// `Date.now()`: whole milliseconds since 1970, as JavaScript gives them
    static func now() -> Double { (Date().timeIntervalSince1970 * 1000).rounded(.down) }

    nonisolated(unsafe) static var locale = Locale.current
    nonisolated(unsafe) static var timeZone = TimeZone.current

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = locale
        return calendar
    }
}

// MARK: core/model.ts

nonisolated enum PageKind: String, Sendable, CaseIterable {
    case page, journal, templates, database, canvas
}

nonisolated struct SelectOption: Equatable, Sendable {
    var id: String
    var name: String
    var color: String

    var json: JSValue { ["id": .string(id), "name": .string(name), "color": .string(color)] }
}

nonisolated struct PropDef: Equatable, Sendable {
    var id: String
    var name: String
    var type: String
    var options: [SelectOption]
    /// the expression a formula property computes, see core/formula
    var formula: String?

    var json: JSValue {
        var object = JSObject([("id", .string(id)), ("name", .string(name)), ("type", .string(type)), ("options", .array(options.map(\.json)))])
        if let formula { object["formula"] = .string(formula) }
        return .object(object)
    }
}

nonisolated struct FilterRule: Equatable, Sendable {
    var id: String
    var prop: String
    var op: String
    var value: JSValue

    var json: JSValue { ["id": .string(id), "prop": .string(prop), "op": .string(op), "value": value] }
}

nonisolated struct SortRule: Equatable, Sendable {
    var prop: String
    var dir: String

    var json: JSValue { ["prop": .string(prop), "dir": .string(dir)] }
}

nonisolated struct ViewDef: Equatable, Sendable {
    var id: String
    var name: String
    var type: String
    var filters: [FilterRule]
    var sorts: [SortRule]
    var groupBy: String?
    var dateProp: String?
    var hidden: [String]

    var json: JSValue {
        [
            "id": .string(id), "name": .string(name), "type": .string(type), "filters": .array(filters.map(\.json)),
            "sorts": .array(sorts.map(\.json)), "groupBy": groupBy.map(JSValue.string) ?? .null,
            "dateProp": dateProp.map(JSValue.string) ?? .null, "hidden": .array(hidden.map(JSValue.string)),
        ]
    }
}

nonisolated struct DatabaseDef: Equatable, Sendable {
    var properties: [PropDef]
    var views: [ViewDef]

    var json: JSValue { ["properties": .array(properties.map(\.json)), "views": .array(views.map(\.json))] }
}

/// `PageMeta`. Property values are kept as their JSON values (`PropValue`: string, number, boolean, list of
/// strings or null).
nonisolated struct PageMeta: Equatable, Sendable {
    var id: String
    var parentId: String?
    var title = ""
    var icon: String?
    var kind = PageKind.page
    var order = 0.0
    var createdAt = 0.0
    var updatedAt = 0.0
    /// set only on the page that was trashed, its subpages are hidden with it
    var trashedAt: Double?
    var favorite = false
    var dailyDate: String?
    var lastOpenedAt: Double?
    var tags: [String] = []
    /// values for the properties of the database this page is a row of, keyed by property id
    var properties = JSObject()
    var database: DatabaseDef?
    /// a gradient such as gradient-3, or the path of an image in the vault
    var cover: String?
    /// the page file is encrypted with a password, its content is only in memory while it is unlocked
    var encrypted = false

    /// `newPageMeta`: every new page record goes through here so added fields always get safe defaults
    init(id: String, parentId: String?, createdAt: Double = 0, updatedAt: Double? = nil) {
        self.id = id
        self.parentId = parentId
        self.createdAt = createdAt
        self.updatedAt = updatedAt ?? createdAt
    }

    /// The record as Morrow's newPageMeta lays it out.
    var json: JSValue {
        [
            "title": .string(title), "icon": icon.map(JSValue.string) ?? .null, "kind": .string(kind.rawValue),
            "order": .number(order), "createdAt": .number(createdAt), "updatedAt": .number(updatedAt),
            "trashedAt": trashedAt.map(JSValue.number) ?? .null, "favorite": .bool(favorite),
            "dailyDate": dailyDate.map(JSValue.string) ?? .null, "lastOpenedAt": lastOpenedAt.map(JSValue.number) ?? .null,
            "tags": .array(tags.map(JSValue.string)), "properties": .object(properties), "database": database?.json ?? .null,
            "cover": cover.map(JSValue.string) ?? .null, "encrypted": .bool(encrypted), "id": .string(id),
            "parentId": parentId.map(JSValue.string) ?? .null,
        ]
    }
}

nonisolated struct WorkspaceState: Equatable, Sendable {
    var pages = JSRecord<PageMeta>()
    var docs = JSRecord<DocNode>()
}

nonisolated extension Model {
    static let schemaVersion = 3
    static let maxTitleLength = 500
    static let maxIconLength = 16
    // limits that keep hostile or corrupted documents from hanging the app
    static let maxDocDepth = 64
    static let maxDocNodes = 200_000
    static let maxTreeDepth = 256
    static let propTypes = ["text", "number", "select", "multiSelect", "date", "checkbox", "url", "relation", "formula"]
    static let viewTypes = ["table", "board", "calendar", "list", "gallery"]
    static let untitled = "Untitled"
    static let coverGradients = 12

    static func displayTitle(_ page: PageMeta?) -> String {
        let title = page.map { JSText.trim($0.title) } ?? ""
        return title.isEmpty ? untitled : title
    }

    private static let gradient = JSRegex(#"^gradient-([1-9]|1[0-2])$"#)
    private static let scheme = JSRegex(#"^[a-z][a-z0-9+.-]*:"#, ignoreCase: true)

    static func validCover(_ value: JSValue?) -> String? {
        guard case .string(let raw) = value else { return nil }
        let cover = JSText.trim(raw)
        if gradient.test(cover) { return cover }
        // images are vault paths, never web addresses, so a cover never loads anything from elsewhere
        if cover.utf16.count <= 500, !scheme.test(cover), JSText.indexOf(cover.units, "..".units) == -1 { return cover }
        return nil
    }
}

// MARK: core/crypto.ts

nonisolated enum PageCrypto {
    static let cipher = "aes-256-gcm"
    static let marker = "morrow-encrypted"

    /// `isEncryptedText`: frontmatter that names Morrow's cipher, with a salt and an iv `atob` accepts.
    static func isEncryptedText(_ text: String) -> Bool {
        guard let data = Frontmatter.split(text).data, data[marker] == .string(cipher) else { return false }
        func decodes(_ value: JSValue?) -> Bool {
            let text = value.flatMap { $0.isNull ? nil : $0 }?.jsString ?? ""
            return forgivingBase64(text.utf16.filter { !JSText.isSpace($0) })
        }
        return decodes(data["salt"]) && decodes(data["iv"])
    }

    /// the forgiving-base64 decode `atob` runs, on text without whitespace: whether it succeeds
    private static func forgivingBase64(_ units: [UInt16]) -> Bool {
        var units = units
        if units.count % 4 == 0 {
            if units.last == 0x3D { units.removeLast() }
            if units.last == 0x3D { units.removeLast() }
        }
        if units.count % 4 == 1 { return false }
        return units.allSatisfy { (0x41...0x5A).contains($0) || (0x61...0x7A).contains($0) || (0x30...0x39).contains($0) || $0 == 0x2B || $0 == 0x2F }
    }
}
