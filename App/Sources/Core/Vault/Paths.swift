import Foundation

/// Morrow's core/vault/paths.ts: vault paths are always relative to the vault folder and use forward slashes.
nonisolated enum Paths {
    static let trashDir = ".trash"
    static let morrowDir = ".morrow"
    static let attachmentsDir = "attachments"
    static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]

    static func dirname(_ path: String) -> String {
        let units = path.units
        let index = JSText.lastIndexOf(units, 0x2F)
        return index == -1 ? "" : JSText.string(units[..<index])
    }

    static func basename(_ path: String) -> String {
        let units = path.units
        return JSText.string(units[(JSText.lastIndexOf(units, 0x2F) + 1)...])
    }

    static func `extension`(_ path: String) -> String {
        let name = basename(path).units
        let dot = JSText.lastIndexOf(name, 0x2E)
        return dot > 0 ? JSText.string(JSText.lowercased(Array(name[(dot + 1)...]))) : ""
    }

    static func stripExtension(_ path: String) -> String {
        let name = basename(path).units
        let dot = JSText.lastIndexOf(name, 0x2E)
        let units = path.units
        return dot > 0 ? JSText.string(units[..<(units.count - (name.count - dot))]) : path
    }

    static func joinPath(_ parts: String...) -> String {
        parts.filter { !$0.isEmpty }.joined(separator: "/")
    }

    static func isPageFile(_ path: String) -> Bool {
        let lower = JSText.lowercased(path.units)
        return JSText.endsWith(lower, ".md".units) || JSText.endsWith(lower, ".canvas".units)
    }

    static func isImagePath(_ path: String) -> Bool { imageExtensions.contains(`extension`(path)) }

    /// hidden folders belong to other tools, except the trash which holds trashed pages
    static func isHiddenPath(_ path: String) -> Bool {
        JSText.split(path, on: 0x2F).enumerated().contains { index, part in
            part.utf16.first == 0x2E && !(index == 0 && part == trashDir)
        }
    }

    static func isInTrash(_ path: String) -> Bool {
        path.jsEquals(trashDir) || path.utf16.starts(with: "\(trashDir)/".utf16)
    }

    /// resolves ./ and ../ against a folder, nil when the path escapes the vault
    static func resolveRelative(_ fromDir: String, _ href: String) -> String? {
        var parts = fromDir.isEmpty ? [] : JSText.split(fromDir, on: 0x2F)
        for part in JSText.split(href, on: 0x2F) {
            if part.isEmpty || part == "." { continue }
            if part == ".." {
                if parts.isEmpty { return nil }
                parts.removeLast()
            } else {
                parts.append(part)
            }
        }
        return parts.joined(separator: "/")
    }

    /// the shortest relative path from a folder to a file, as markdown links expect
    static func relativePath(_ fromDir: String, _ to: String) -> String {
        let from = fromDir.isEmpty ? [] : JSText.split(fromDir, on: 0x2F)
        let target = JSText.split(to, on: 0x2F)
        var common = 0
        while common < from.count, common < target.count - 1, from[common].jsEquals(target[common]) { common += 1 }
        return (Array(repeating: "..", count: from.count - common) + target[common...]).joined(separator: "/")
    }

    private static let unsafeChars = JSRegex(#"[<>:"/\\|?*#^[\]]"#)
    private static let spaces = JSRegex(#"\s+"#)
    private static let edges = JSRegex(#"^[.\s]+|[.\s]+$"#)
    private static let reservedName = JSRegex(#"^(con|prn|aux|nul|com\d|lpt\d)$"#, ignoreCase: true)

    /// a title turned into a name every common file system accepts
    static func safeFileName(_ title: String, maxLength: Int = 60) -> String {
        var printable: [UInt16] = []
        for scalar in title.unicodeScalars {
            // [...title] walks code points, and charCodeAt(0) is the first unit of each
            if scalar.value < 32 { printable.append(0x20) } else { printable += String(scalar).utf16 }
        }
        var cleaned = unsafeChars.replaceAll(printable) { _ in [0x20] }
        cleaned = spaces.replaceAll(cleaned) { _ in [0x20] }
        cleaned = edges.replaceAll(cleaned) { _ in [] }
        cleaned = JSText.trim(JSText.slice(cleaned, 0, maxLength))
        return cleaned.isEmpty || reservedName.test(cleaned) ? Model.untitled : JSText.string(cleaned)
    }

    static func uniqueName(_ name: String, used: inout JSSet, separator: String = " ") -> String {
        var candidate = name
        var n = 2
        while used.has(JSText.string(JSText.lowercased(candidate.units))) {
            candidate = "\(name)\(separator)\(n)"
            n += 1
        }
        used.insert(JSText.string(JSText.lowercased(candidate.units)))
        return candidate
    }

    static func encodePathForUrl(_ path: String) -> String {
        JSText.split(path, on: 0x2F).map(JSURI.encodeURIComponent).joined(separator: "/")
    }
}

/// JavaScript's `encodeURIComponent` and `decodeURIComponent`.
nonisolated enum JSURI {
    private static let unreserved = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()".utf16)

    static func encodeURIComponent(_ text: String) -> String {
        var out = ""
        for scalar in text.unicodeScalars {
            if scalar.value < 0x80, unreserved.contains(UInt16(scalar.value)) {
                out.unicodeScalars.append(scalar)
            } else {
                for byte in String(scalar).utf8 { out += String(format: "%%%02X", byte) }
            }
        }
        return out
    }

    /// nil where JavaScript throws a URIError: a `%` without two hex digits, or bytes that are not UTF-8
    static func decodeURIComponent(_ text: String) -> String? {
        let units = text.units
        var out: [UInt16] = []
        var index = 0
        func hexByte(_ at: Int) -> UInt8? {
            guard at + 2 < units.count + 0, units[at] == 0x25,
                  let value = UInt8(JSText.string(units[(at + 1)...(at + 2)]), radix: 16)
            else { return nil }
            return value
        }
        while index < units.count {
            guard units[index] == 0x25 else {
                out.append(units[index])
                index += 1
                continue
            }
            guard index + 2 < units.count, let first = hexByte(index) else { return nil }
            index += 3
            if first < 0x80 {
                out.append(UInt16(first))
                continue
            }
            let length = first >= 0xF0 ? 4 : first >= 0xE0 ? 3 : first >= 0xC0 ? 2 : 0
            guard length >= 2, first < 0xF8 else { return nil }
            var bytes = [first]
            for _ in 1..<length {
                guard index + 2 < units.count, let next = hexByte(index), next & 0xC0 == 0x80 else { return nil }
                bytes.append(next)
                index += 3
            }
            guard let decoded = String(validating: bytes, as: UTF8.self) else { return nil }
            out += decoded.utf16
        }
        return JSText.string(out)
    }
}
