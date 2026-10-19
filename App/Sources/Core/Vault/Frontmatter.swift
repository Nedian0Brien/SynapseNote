import Foundation

/// Morrow's core/vault/frontmatter.ts.
nonisolated enum Frontmatter {
    struct Split: Equatable {
        /// nil when the file has no frontmatter
        var data: JSObject?
        /// the frontmatter block exactly as written, reused when its values did not change
        var head: String
        var body: String
        /// set when frontmatter exists but is not valid yaml, the file is then left alone
        var error: String?
    }

    private static let open = JSRegex(#"^---[ \t]*\r?\n"#)
    private static let close = JSRegex(#"\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)"#)

    static func split(_ text: String) -> Split {
        var source = text.units
        if source.first == 0xFEFF { source.removeFirst() }
        let sourceText = JSText.string(source)
        guard let openMatch = open.exec(source) else { return Split(data: nil, head: "", body: sourceText, error: nil) }
        // the leading newline lets an empty block close on the very next line
        let rest = [0x0A] + source[openMatch.range.upperBound...]
        guard let match = close.exec(rest) else { return Split(data: nil, head: "", body: sourceText, error: nil) }
        let yaml = JSText.string(JSText.slice(rest, 1, max(1, match.range.lowerBound)))
        let body = Array(rest[match.range.upperBound...])
        let head = JSText.string(source[..<(source.count - body.count)])
        let bodyText = JSText.string(body)
        if JSText.trim(yaml).isEmpty { return Split(data: JSObject(), head: head, body: bodyText, error: nil) }
        do {
            guard let data = try YAML.parse(yaml), !data.isNull else {
                return Split(data: JSObject(), head: head, body: bodyText, error: nil)
            }
            guard case .object(let object) = data else {
                return Split(data: nil, head: head, body: bodyText, error: "The properties at the top of the file are not a list of keys.")
            }
            return Split(data: object, head: head, body: bodyText, error: nil)
        } catch {
            let first = JSText.split(error.message, on: 0x0A).first ?? ""
            return Split(data: nil, head: head, body: bodyText, error: "The properties at the top of the file could not be read: \(first)")
        }
    }

    /// the body is kept byte for byte, so a file only changes where its properties changed
    static func join(_ data: JSObject?, _ body: String) -> String {
        guard let data, !data.isEmpty else { return body }
        return "---\n\(YAMLStringify.stringify(.object(data)))---\n\(body)"
    }

    /// tags may be a list, a single string or a comma separated string, with or without the leading #
    static func readTags(_ value: JSValue?) -> [String] {
        var raw: [JSValue] = []
        switch value {
        case .array(let items): raw = items
        case .string(let text):
            raw = text.utf16.split(omittingEmptySubsequences: false) { $0 == 0x2C || JSText.isSpace($0) }.map { .string(JSText.string($0)) }
        default: break
        }
        var seen = Set<JSKey>()
        var tags: [String] = []
        for item in raw {
            let text: String
            switch item {
            case .string(let value): text = value
            case .number(let number): text = JSNumber.string(number)
            default: continue
            }
            guard let tag = normalizeTag(text), seen.insert(JSKey(tag)).inserted else { continue }
            tags.append(tag)
        }
        return tags
    }

    static func normalizeTag(_ tag: String) -> String? {
        var cleaned = JSText.trim(tag.units)
        if cleaned.first == 0x23 { cleaned.removeFirst() }
        guard !cleaned.isEmpty, cleaned.count <= 100 else { return nil }
        let text = JSText.string(cleaned)
        // /^[\p{L}\p{N}_\-/]+$/u and not /^\d+$/
        let valid = text.unicodeScalars.allSatisfy { scalar in
            if scalar == "_" || scalar == "-" || scalar == "/" { return true }
            switch scalar.properties.generalCategory {
            case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
                 .decimalNumber, .letterNumber, .otherNumber: return true
            default: return false
            }
        }
        guard valid, !cleaned.allSatisfy({ (0x30...0x39).contains($0) }) else { return nil }
        return text
    }
}
