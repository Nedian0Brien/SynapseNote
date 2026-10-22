import Foundation

/// The link handling markdown-it 15.0.2 applies to every link destination: `normalizeLink`,
/// `normalizeLinkText` and `validateLink`, with the parts of mdurl 2.1.0 and punycode.js 2.3.1 they use,
/// ported line by line on UTF-16 code units.
nonisolated enum MarkdownURL {
    // MARK: markdown-it

    private static let recodeHostnameFor: [[UInt16]] = ["http:", "https:", "mailto:"].map(\.units)

    /// `/^(vbscript|javascript|file|data):/` gives false unless `/^data:image\/(gif|png|jpeg|webp);/`, on the
    /// trimmed lower-cased url.
    static func validateLink(_ url: [UInt16]) -> Bool {
        let text = JSText.string(JSText.lowercased(JSText.trim(url)))
        let bad = ["vbscript:", "javascript:", "file:", "data:"].contains { text.utf16.starts(with: $0.utf16) }
        guard bad else { return true }
        return ["gif", "png", "jpeg", "webp"].contains { text.utf16.starts(with: "data:image/\($0);".utf16) }
    }

    static func normalizeLink(_ url: [UInt16]) -> [UInt16] {
        var parsed = URLParts.parse(url)
        if let hostname = parsed.hostname, !hostname.isEmpty,
           parsed.protocol == nil || recodeHostnameFor.contains(parsed.protocol!) {
            if let ascii = Punycode.toASCII(hostname) { parsed.hostname = ascii }
        }
        if let auth = parsed.auth, !auth.isEmpty { parsed.auth = encode(auth) }
        if let hostname = parsed.hostname, !hostname.isEmpty { parsed.hostname = encode(hostname) }
        if let pathname = parsed.pathname, !pathname.isEmpty { parsed.pathname = encode(pathname) }
        if let search = parsed.search, !search.isEmpty { parsed.search = encode(search) }
        if let hash = parsed.hash, !hash.isEmpty { parsed.hash = encode(hash) }
        return parsed.format()
    }

    static func normalizeLinkText(_ url: [UInt16]) -> [UInt16] {
        var parsed = URLParts.parse(url)
        if let hostname = parsed.hostname, !hostname.isEmpty,
           parsed.protocol == nil || recodeHostnameFor.contains(parsed.protocol!) {
            if let unicode = Punycode.toUnicode(hostname) { parsed.hostname = unicode }
        }
        return decode(parsed.format(), exclude: ";/?:@&=+$,#%".units)
    }

    // MARK: mdurl encode

    private static let hexDigits = Array("0123456789ABCDEF".utf16)

    private static func percent(_ byte: Int) -> [UInt16] {
        [0x25, hexDigits[byte >> 4], hexDigits[byte & 15]]
    }

    private static func isHex(_ unit: UInt16) -> Bool {
        (0x30...0x39).contains(unit) || (0x41...0x46).contains(unit) || (0x61...0x66).contains(unit)
    }

    /// `mdurl.encode(string)` with its default characters kept and `%xx` escapes kept.
    static func encode(_ string: [UInt16]) -> [UInt16] {
        let keep = Set(";/?:@&=+$,-_.!~*'()#".utf16)
        var result: [UInt16] = []
        var index = 0
        let count = string.count
        while index < count {
            let code = string[index]
            if code == 0x25, index + 2 < count, isHex(string[index + 1]), isHex(string[index + 2]) {
                result += string[index..<index + 3]
                index += 3
                continue
            }
            if code < 128 {
                let isAlnum = (0x30...0x39).contains(code) || (0x41...0x5A).contains(code) || (0x61...0x7A).contains(code)
                result += isAlnum || keep.contains(code) ? [code] : percent(Int(code))
                index += 1
                continue
            }
            if (0xD800...0xDFFF).contains(code) {
                if code <= 0xDBFF, index + 1 < count, (0xDC00...0xDFFF).contains(string[index + 1]) {
                    let scalar = 0x10000 + ((Int(code) - 0xD800) << 10) + (Int(string[index + 1]) - 0xDC00)
                    result += utf8(scalar).flatMap(percent)
                    index += 2
                    continue
                }
                result += "%EF%BF%BD".units
                index += 1
                continue
            }
            result += utf8(Int(code)).flatMap(percent)
            index += 1
        }
        return result
    }

    private static func utf8(_ scalar: Int) -> [Int] {
        switch scalar {
        case ..<0x80: [scalar]
        case ..<0x800: [0xC0 | scalar >> 6, 0x80 | scalar & 0x3F]
        case ..<0x10000: [0xE0 | scalar >> 12, 0x80 | scalar >> 6 & 0x3F, 0x80 | scalar & 0x3F]
        default: [0xF0 | scalar >> 18, 0x80 | scalar >> 12 & 0x3F, 0x80 | scalar >> 6 & 0x3F, 0x80 | scalar & 0x3F]
        }
    }

    // MARK: mdurl decode

    private static func hexValue(_ unit: UInt16) -> Int {
        switch unit {
        case 0x30...0x39: Int(unit) - 0x30
        case 0x41...0x46: Int(unit) - 0x41 + 10
        default: Int(unit) - 0x61 + 10
        }
    }

    /// `mdurl.decode(string, exclude)`: runs of `%xx` become the UTF-8 text they spell, the excluded ASCII
    /// characters stay escaped (in upper case), broken sequences become U+FFFD.
    static func decode(_ string: [UInt16], exclude: [UInt16]) -> [UInt16] {
        let excluded = Set(exclude)
        var out: [UInt16] = []
        var index = 0
        let count = string.count
        while index < count {
            // a run of /(%[a-f0-9]{2})+/i
            var end = index
            while end + 2 < count, string[end] == 0x25, isHex(string[end + 1]), isHex(string[end + 2]) { end += 3 }
            if end == index {
                out.append(string[index])
                index += 1
                continue
            }
            let bytes = stride(from: index, to: end, by: 3).map { hexValue(string[$0 + 1]) * 16 + hexValue(string[$0 + 2]) }
            out += decodeRun(bytes, excluded: excluded)
            index = end
        }
        return out
    }

    private static func decodeRun(_ bytes: [Int], excluded: Set<UInt16>) -> [UInt16] {
        var result: [UInt16] = []
        var i = 0
        // the run's length in characters is 3 per byte, the checks below are on that length as mdurl's are
        let l = bytes.count * 3
        while i < l {
            let b1 = bytes[i / 3]
            if b1 < 0x80 {
                result += excluded.contains(UInt16(b1)) ? percent(b1) : [UInt16(b1)]
                i += 3
                continue
            }
            if b1 & 0xE0 == 0xC0, i + 3 < l {
                let b2 = bytes[i / 3 + 1]
                if b2 & 0xC0 == 0x80 {
                    let chr = (b1 << 6) & 0x7C0 | b2 & 0x3F
                    result += chr < 0x80 ? [0xFFFD, 0xFFFD] : [UInt16(chr)]
                    i += 6
                    continue
                }
            }
            if b1 & 0xF0 == 0xE0, i + 6 < l {
                let b2 = bytes[i / 3 + 1], b3 = bytes[i / 3 + 2]
                if b2 & 0xC0 == 0x80, b3 & 0xC0 == 0x80 {
                    let chr = (b1 << 12) & 0xF000 | (b2 << 6) & 0xFC0 | b3 & 0x3F
                    result += chr < 0x800 || (0xD800...0xDFFF).contains(chr) ? [0xFFFD, 0xFFFD, 0xFFFD] : [UInt16(chr)]
                    i += 9
                    continue
                }
            }
            if b1 & 0xF8 == 0xF0, i + 9 < l {
                let b2 = bytes[i / 3 + 1], b3 = bytes[i / 3 + 2], b4 = bytes[i / 3 + 3]
                if b2 & 0xC0 == 0x80, b3 & 0xC0 == 0x80, b4 & 0xC0 == 0x80 {
                    var chr = (b1 << 18) & 0x1C0000 | (b2 << 12) & 0x3F000 | (b3 << 6) & 0xFC0 | b4 & 0x3F
                    if chr < 0x10000 || chr > 0x10FFFF {
                        result += [0xFFFD, 0xFFFD, 0xFFFD, 0xFFFD]
                    } else {
                        chr -= 0x10000
                        result += [UInt16(0xD800 + (chr >> 10)), UInt16(0xDC00 + (chr & 0x3FF))]
                    }
                    i += 12
                    continue
                }
            }
            result.append(0xFFFD)
            i += 3
        }
        return result
    }
}

/// mdurl 2.1.0 `parse(url, true)` and `format`, the url split into the parts markdown-it re-encodes.
nonisolated struct URLParts {
    var `protocol`: [UInt16]?
    var slashes = false
    var auth: [UInt16]?
    var port: [UInt16]?
    var hostname: [UInt16]?
    var hash: [UInt16]?
    var search: [UInt16]?
    var pathname: [UInt16]?

    private static let delims: [UInt16] = ["<", ">", "\"", "`", " ", "\r", "\n", "\t"].map { $0.utf16.first! }
    private static let unwise: [UInt16] = ["{", "}", "|", "\\", "^", "`"].map { $0.utf16.first! } + delims
    private static let autoEscape: [UInt16] = [0x27] + unwise
    private static let nonHostChars: [UInt16] = ["%", "/", "?", ";", "#"].map { $0.utf16.first! } + autoEscape
    private static let hostEndingChars: [UInt16] = [0x2F, 0x3F, 0x23]
    private static let slashedProtocol: [[UInt16]] = ["http", "https", "ftp", "gopher", "file", "http:", "https:", "ftp:", "gopher:", "file:"].map(\.units)

    private static func isHostPartChar(_ unit: UInt16) -> Bool {
        unit == 0x2B || unit == 0x2D || unit == 0x5F || (0x30...0x39).contains(unit) || (0x41...0x5A).contains(unit) || (0x61...0x7A).contains(unit)
    }

    /// `/^[+a-z0-9A-Z_-]{0,63}$/`
    private static func isHostPart(_ part: [UInt16]) -> Bool {
        part.count <= 63 && part.allSatisfy(isHostPartChar)
    }

    private static func isLineTerminator(_ unit: UInt16) -> Bool {
        unit == 0x0A || unit == 0x0D || unit == 0x2028 || unit == 0x2029
    }

    static func parse(_ url: [UInt16]) -> URLParts {
        var parts = URLParts()
        var rest = JSText.trim(url)
        // protocolPattern /^([a-z0-9.+-]+:)/i
        var proto: [UInt16]?
        var length = 0
        while length < rest.count {
            let unit = rest[length]
            let lower = (0x41...0x5A).contains(unit) ? unit | 0x20 : unit
            guard (0x61...0x7A).contains(lower) || (0x30...0x39).contains(lower) || unit == 0x2E || unit == 0x2B || unit == 0x2D else { break }
            length += 1
        }
        if length > 0, length < rest.count, rest[length] == 0x3A {
            proto = Array(rest[...length])
            parts.protocol = proto
            rest = Array(rest[(length + 1)...])
        }
        let lowerProto = proto.map(JSText.lowercased)
        let hostless = proto == "javascript:".units
        // slashes denote a host, as markdown-it asks
        let slashes = rest.count >= 2 && rest[0] == 0x2F && rest[1] == 0x2F
        if slashes, !hostless {
            rest = Array(rest[2...])
            parts.slashes = true
        }
        if !hostless, slashes || (proto != nil && !slashedProtocol.contains(proto!)) {
            var hostEnd = -1
            for char in hostEndingChars {
                let hec = JSText.indexOf(rest, char)
                if hec != -1, hostEnd == -1 || hec < hostEnd { hostEnd = hec }
            }
            let atSign = hostEnd == -1 ? JSText.lastIndexOf(rest, 0x40) : JSText.lastIndexOf(rest, 0x40, from: hostEnd)
            if atSign != -1 {
                parts.auth = Array(rest[..<atSign])
                rest = Array(rest[(atSign + 1)...])
            }
            hostEnd = -1
            for char in nonHostChars {
                let hec = JSText.indexOf(rest, char)
                if hec != -1, hostEnd == -1 || hec < hostEnd { hostEnd = hec }
            }
            if hostEnd == -1 { hostEnd = rest.count }
            if hostEnd > 0, rest[hostEnd - 1] == 0x3A { hostEnd -= 1 }
            let host = Array(rest[..<hostEnd])
            rest = Array(rest[hostEnd...])
            parts.parseHost(host)
            var hostname = parts.hostname ?? []
            let ipv6 = hostname.first == 0x5B && hostname.last == 0x5D
            if !ipv6 {
                let hostparts = hostname.split(separator: 0x2E, omittingEmptySubsequences: false).map(Array.init)
                for (i, part) in hostparts.enumerated() {
                    if part.isEmpty { continue }
                    if isHostPart(part) { continue }
                    let newpart = part.map { $0 > 127 ? 0x78 : $0 }
                    if isHostPart(newpart) { continue }
                    var validParts = Array(hostparts[..<i])
                    var notHost = Array(hostparts[(i + 1)...])
                    // hostnamePartStart /^([+a-z0-9A-Z_-]{0,63})(.*)$/ fails only when the part holds a line break
                    if !part.contains(where: isLineTerminator) {
                        var lead = 0
                        while lead < part.count, lead < 63, isHostPartChar(part[lead]) { lead += 1 }
                        validParts.append(Array(part[..<lead]))
                        notHost.insert(Array(part[lead...]), at: 0)
                    }
                    if !notHost.isEmpty { rest = Array(notHost.joined(separator: [0x2E])) + rest }
                    hostname = Array(validParts.joined(separator: [0x2E]))
                    break
                }
            }
            if hostname.count > 255 { hostname = [] }
            if ipv6 { hostname = Array(hostname.dropFirst().dropLast()) }
            parts.hostname = hostname
        }
        let hash = JSText.indexOf(rest, 0x23)
        if hash != -1 {
            parts.hash = Array(rest[hash...])
            rest = Array(rest[..<hash])
        }
        let qm = JSText.indexOf(rest, 0x3F)
        if qm != -1 {
            parts.search = Array(rest[qm...])
            rest = Array(rest[..<qm])
        }
        if !rest.isEmpty { parts.pathname = rest }
        if let lowerProto, slashedProtocol.contains(lowerProto), let hostname = parts.hostname, !hostname.isEmpty, parts.pathname?.isEmpty ?? true {
            parts.pathname = []
        }
        return parts
    }

    /// `parseHost`: a trailing `/:[0-9]*$/` is the port.
    private mutating func parseHost(_ input: [UInt16]) {
        var host = input
        var start = host.count
        while start > 0, (0x30...0x39).contains(host[start - 1]) { start -= 1 }
        if start > 0, host[start - 1] == 0x3A {
            let port = Array(host[start...])
            if !port.isEmpty { self.port = port }
            host = Array(host[..<(start - 1)])
        }
        if !host.isEmpty { hostname = host }
    }

    func format() -> [UInt16] {
        var result: [UInt16] = []
        result += `protocol` ?? []
        if slashes { result += [0x2F, 0x2F] }
        if let auth, !auth.isEmpty { result += auth + [0x40] }
        if let hostname, hostname.contains(0x3A) {
            result += [0x5B] + hostname + [0x5D]
        } else {
            result += hostname ?? []
        }
        if let port, !port.isEmpty { result += [0x3A] + port }
        result += pathname ?? []
        result += search ?? []
        result += hash ?? []
        return result
    }
}

/// punycode.js 2.3.1 `toASCII` and `toUnicode`. Both give nil where punycode.js throws.
nonisolated enum Punycode {
    private static let maxInt = 2_147_483_647
    private static let base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128

    static func toASCII(_ input: [UInt16]) -> [UInt16]? {
        mapDomain(input) { label in
            label.contains(where: { $0 > 0x7F }) ? encode(label).map { "xn--".units + $0 } : label
        }
    }

    static func toUnicode(_ input: [UInt16]) -> [UInt16]? {
        mapDomain(input) { label in
            JSText.startsWith(label, "xn--".units) ? decode(JSText.lowercased(Array(label[4...]))) : label
        }
    }

    private static func mapDomain(_ input: [UInt16], _ callback: ([UInt16]) -> [UInt16]?) -> [UInt16]? {
        let parts = input.split(separator: 0x40, omittingEmptySubsequences: false).map(Array.init)
        var result: [UInt16] = []
        var domain = input
        if parts.count > 1 {
            result = parts[0] + [0x40]
            domain = parts[1]
        }
        domain = domain.map { [0x3002, 0xFF0E, 0xFF61].contains($0) ? 0x2E : $0 }
        var encoded: [[UInt16]] = []
        for label in domain.split(separator: 0x2E, omittingEmptySubsequences: false) {
            guard let mapped = callback(Array(label)) else { return nil }
            encoded.append(mapped)
        }
        return result + Array(encoded.joined(separator: [0x2E]))
    }

    private static func adapt(_ input: Int, _ numPoints: Int, _ firstTime: Bool) -> Int {
        var k = 0
        var delta = firstTime ? input / damp : input >> 1
        delta += delta / numPoints
        while delta > ((base - tMin) * tMax) >> 1 {
            delta /= base - tMin
            k += base
        }
        return k + (base - tMin + 1) * delta / (delta + skew)
    }

    private static func basicToDigit(_ code: Int) -> Int {
        if code >= 0x30, code < 0x3A { return 26 + (code - 0x30) }
        if code >= 0x41, code < 0x5B { return code - 0x41 }
        if code >= 0x61, code < 0x7B { return code - 0x61 }
        return base
    }

    private static func digitToBasic(_ digit: Int) -> UInt16 {
        UInt16(digit + 22 + (digit < 26 ? 75 : 0))
    }

    private static func ucs2decode(_ string: [UInt16]) -> [Int] {
        var output: [Int] = []
        var counter = 0
        while counter < string.count {
            let value = Int(string[counter])
            counter += 1
            if value >= 0xD800, value <= 0xDBFF, counter < string.count {
                let extra = Int(string[counter])
                counter += 1
                if extra & 0xFC00 == 0xDC00 {
                    output.append(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000)
                } else {
                    output.append(value)
                    counter -= 1
                }
            } else {
                output.append(value)
            }
        }
        return output
    }

    private static func ucs2encode(_ points: [Int]) -> [UInt16]? {
        var out: [UInt16] = []
        for point in points {
            guard point >= 0, point <= 0x10FFFF else { return nil }
            if point > 0xFFFF {
                let value = point - 0x10000
                out += [UInt16(0xD800 + (value >> 10)), UInt16(0xDC00 + (value & 0x3FF))]
            } else {
                out.append(UInt16(point))
            }
        }
        return out
    }

    static func decode(_ input: [UInt16]) -> [UInt16]? {
        var output: [Int] = []
        var i = 0, n = initialN, bias = initialBias
        var basic = JSText.lastIndexOf(input, 0x2D)
        if basic < 0 { basic = 0 }
        for j in 0..<basic {
            guard input[j] < 0x80 else { return nil }
            output.append(Int(input[j]))
        }
        var index = basic > 0 ? basic + 1 : 0
        while index < input.count {
            let oldi = i
            var w = 1
            var k = base
            while true {
                guard index < input.count else { return nil }
                let digit = basicToDigit(Int(input[index]))
                index += 1
                guard digit < base else { return nil }
                guard digit <= (maxInt - i) / w else { return nil }
                i += digit * w
                let t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias)
                if digit < t { break }
                guard w <= maxInt / (base - t) else { return nil }
                w *= base - t
                k += base
            }
            let out = output.count + 1
            bias = adapt(i - oldi, out, oldi == 0)
            guard i / out <= maxInt - n else { return nil }
            n += i / out
            i %= out
            output.insert(n, at: i)
            i += 1
        }
        return ucs2encode(output)
    }

    static func encode(_ string: [UInt16]) -> [UInt16]? {
        let input = ucs2decode(string)
        var output: [UInt16] = input.filter { $0 < 0x80 }.map { UInt16($0) }
        var n = initialN, delta = 0, bias = initialBias
        let basicLength = output.count
        var handled = basicLength
        if basicLength > 0 { output.append(0x2D) }
        while handled < input.count {
            var m = maxInt
            for value in input where value >= n && value < m { m = value }
            let plusOne = handled + 1
            guard m - n <= (maxInt - delta) / plusOne else { return nil }
            delta += (m - n) * plusOne
            n = m
            for value in input {
                if value < n {
                    delta += 1
                    guard delta <= maxInt else { return nil }
                }
                if value == n {
                    var q = delta
                    var k = base
                    while true {
                        let t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias)
                        if q < t { break }
                        output.append(digitToBasic(t + (q - t) % (base - t)))
                        q = (q - t) / (base - t)
                        k += base
                    }
                    output.append(digitToBasic(q))
                    bias = adapt(delta, plusOne, handled == basicLength)
                    delta = 0
                    handled += 1
                }
            }
            delta += 1
            n += 1
        }
        return output
    }
}
