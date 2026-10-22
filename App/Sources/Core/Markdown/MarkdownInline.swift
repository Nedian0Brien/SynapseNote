import Foundation

/// The inline rules in the order markdown-it 15 runs them with Morrow's configuration: the `commonmark` preset
/// with `strikethrough` enabled, `math_inline` after `backticks`, `highlight` after `strikethrough` and
/// `wikilink` before `link`.
nonisolated enum MDInlineRule: CaseIterable {
    case text, newline, escape, backticks, mathInline, strikethrough, highlight, emphasis, wikilink, link, image,
         autolink, htmlInline, entity
}

nonisolated final class MDDelimiter {
    let marker: Int
    var length: Int
    let token: Int
    var end: Int
    var open: Bool
    var close: Bool

    init(marker: Int, length: Int, token: Int, end: Int, open: Bool, close: Bool) {
        self.marker = marker
        self.length = length
        self.token = token
        self.end = end
        self.open = open
        self.close = close
    }
}

/// The delimiters of one nesting level; tokens that open a level keep a reference to theirs, as `tokens_meta`.
nonisolated final class MDDelimiterList {
    var items: [MDDelimiter] = []
}

/// markdown-it's StateInline, ParserInline and inline rules (src/rules_inline), ported line by line.
nonisolated final class MDStateInline {
    let src: [UInt16]
    let env: MDEnv
    var tokens: [MDToken] = []
    var tokensMeta: [MDDelimiterList?] = []
    var pos = 0
    var posMax: Int
    var level = 0
    var pending: [UInt16] = []
    var pendingLevel = 0
    var cache: [Int: Int] = [:]
    var backticks: [Int: Int] = [:]
    var backticksScanned = false
    var linkLevel = 0
    var delimiters = MDDelimiterList()
    var prevDelimiters: [MDDelimiterList] = []
    private(set) lazy var subject = JSRegex.Subject(src)

    static let maxNesting = 20

    init(src: [UInt16], env: MDEnv) {
        self.src = src
        self.env = env
        posMax = src.count
    }

    /// `ParserInline.parse`: the tokens of one inline token's content.
    static func parse(_ src: [UInt16], env: MDEnv) -> [MDToken] {
        let state = MDStateInline(src: src, env: env)
        state.tokenize()
        state.linkPairs()
        state.strikethroughPostProcess()
        state.emphasisPostProcess()
        state.fragmentsJoin()
        return state.tokens
    }

    func ch(_ index: Int) -> Int { src.at(index) }

    @discardableResult
    func pushPending() -> MDToken {
        let token = MDToken("text", "", 0)
        token.content = pending
        token.level = pendingLevel
        tokens.append(token)
        pending = []
        return token
    }

    @discardableResult
    func push(_ type: String, _ tag: String, _ nesting: Int) -> MDToken {
        if !pending.isEmpty { pushPending() }
        let token = MDToken(type, tag, nesting)
        var meta: MDDelimiterList?
        if nesting < 0 {
            level -= 1
            delimiters = prevDelimiters.removeLast()
        }
        token.level = level
        if nesting > 0 {
            level += 1
            prevDelimiters.append(delimiters)
            delimiters = MDDelimiterList()
            meta = delimiters
        }
        pendingLevel = level
        tokens.append(token)
        tokensMeta.append(meta)
        return token
    }

    struct Scanned {
        let canOpen: Bool
        let canClose: Bool
        let length: Int
    }

    func scanDelims(_ start: Int, _ canSplitWord: Bool) -> Scanned {
        let max = posMax
        let marker = ch(start)
        var lastChar: Int
        if start == 0 {
            lastChar = 0x20
        } else if start == 1 {
            lastChar = ch(0)
            if lastChar & 0xF800 == 0xD800 { lastChar = 0xFFFD }
        } else {
            lastChar = ch(start - 1)
            if lastChar & 0xFC00 == 0xDC00 {
                let highSurr = ch(start - 2)
                lastChar = highSurr & 0xFC00 == 0xD800 ? 0x10000 + ((highSurr - 0xD800) << 10) + (lastChar - 0xDC00) : 0xFFFD
            } else if lastChar & 0xFC00 == 0xD800 {
                lastChar = 0xFFFD
            }
        }
        var pos = start
        while pos < max, ch(pos) == marker { pos += 1 }
        let count = pos - start
        var nextChar = pos < max ? ch(pos) : 0x20
        if nextChar & 0xFC00 == 0xD800 {
            let lowSurr = ch(pos + 1)
            nextChar = lowSurr >= 0 && lowSurr & 0xFC00 == 0xDC00 ? 0x10000 + ((nextChar - 0xD800) << 10) + (lowSurr - 0xDC00) : 0xFFFD
        } else if nextChar & 0xFC00 == 0xDC00 {
            nextChar = 0xFFFD
        }
        let isLastPunctChar = MD.isMdAsciiPunct(lastChar) || MD.isPunctCharCode(lastChar)
        let isNextPunctChar = MD.isMdAsciiPunct(nextChar) || MD.isPunctCharCode(nextChar)
        let isLastWhiteSpace = MD.isWhiteSpace(lastChar)
        let isNextWhiteSpace = MD.isWhiteSpace(nextChar)
        let leftFlanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar)
        let rightFlanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar)
        return Scanned(
            canOpen: leftFlanking && (canSplitWord || !rightFlanking || isLastPunctChar),
            canClose: rightFlanking && (canSplitWord || !leftFlanking || isNextPunctChar),
            length: count,
        )
    }

    // MARK: ParserInline

    func run(_ rule: MDInlineRule, _ silent: Bool) -> Bool {
        switch rule {
        case .text: text(silent)
        case .newline: newline(silent)
        case .escape: escape(silent)
        case .backticks: backtick(silent)
        case .mathInline: mathInline(silent)
        case .strikethrough: strikethroughTokenize(silent)
        case .highlight: highlight(silent)
        case .emphasis: emphasisTokenize(silent)
        case .wikilink: wikilink(silent)
        case .link: link(silent)
        case .image: image(silent)
        case .autolink: autolink(silent)
        case .htmlInline: htmlInline(silent)
        case .entity: entity(silent)
        }
    }

    func skipToken() {
        let pos = self.pos
        if let cached = cache[pos] {
            self.pos = cached
            return
        }
        var ok = false
        if level < Self.maxNesting {
            for rule in MDInlineRule.allCases {
                level += 1
                ok = run(rule, true)
                level -= 1
                if ok {
                    precondition(pos < self.pos, "inline rule didn't increment state.pos")
                    break
                }
            }
        } else {
            self.pos = posMax
        }
        if !ok { self.pos += 1 }
        cache[pos] = self.pos
    }

    func tokenize() {
        let end = posMax
        while pos < end {
            let prevPos = pos
            var ok = false
            if level < Self.maxNesting {
                for rule in MDInlineRule.allCases {
                    ok = run(rule, false)
                    if ok {
                        precondition(prevPos < pos, "inline rule didn't increment state.pos")
                        break
                    }
                }
            }
            if ok {
                if pos >= end { break }
                continue
            }
            pending.append(src[pos])
            pos += 1
        }
        if !pending.isEmpty { pushPending() }
    }

    // MARK: helpers

    func parseLinkLabel(_ start: Int, _ disableNested: Bool) -> Int {
        let max = posMax
        let oldPos = pos
        pos = start + 1
        var level = 1
        var found = false
        while pos < max {
            let marker = ch(pos)
            if marker == 0x5D {
                level -= 1
                if level == 0 {
                    found = true
                    break
                }
            }
            let prevPos = pos
            skipToken()
            if marker == 0x5B {
                if prevPos == pos - 1 {
                    level += 1
                } else if disableNested {
                    pos = oldPos
                    return -1
                }
            }
        }
        var labelEnd = -1
        if found { labelEnd = pos }
        pos = oldPos
        return labelEnd
    }

    // MARK: text, newline, escape

    private static func isTerminatorChar(_ ch: Int) -> Bool {
        switch ch {
        case 0x0A, 0x21, 0x23, 0x24, 0x25, 0x26, 0x2A, 0x2B, 0x2D, 0x3A, 0x3C, 0x3D, 0x3E, 0x40, 0x5B, 0x5C, 0x5D, 0x5E,
             0x5F, 0x60, 0x7B, 0x7D, 0x7E: true
        default: false
        }
    }

    private func text(_ silent: Bool) -> Bool {
        var pos = self.pos
        while pos < posMax, !Self.isTerminatorChar(ch(pos)) { pos += 1 }
        if pos == self.pos { return false }
        if !silent { pending += src[self.pos..<pos] }
        self.pos = pos
        return true
    }

    private func newline(_ silent: Bool) -> Bool {
        var pos = self.pos
        if ch(pos) != 0x0A { return false }
        let pmax = pending.count - 1
        let max = posMax
        if !silent {
            if pmax >= 0, pending[pmax] == 0x20 {
                if pmax >= 1, pending[pmax - 1] == 0x20 {
                    var ws = pmax - 1
                    while ws >= 1, pending[ws - 1] == 0x20 { ws -= 1 }
                    pending = Array(pending[..<ws])
                    push("hardbreak", "br", 0)
                } else {
                    pending.removeLast()
                    push("softbreak", "br", 0)
                }
            } else {
                push("softbreak", "br", 0)
            }
        }
        pos += 1
        while pos < max, MD.isSpace(ch(pos)) { pos += 1 }
        self.pos = pos
        return true
    }

    private static let escaped = Set("\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".utf16)

    private func escape(_ silent: Bool) -> Bool {
        var pos = self.pos
        let max = posMax
        if ch(pos) != 0x5C { return false }
        pos += 1
        if pos >= max { return false }
        var ch1 = ch(pos)
        if ch1 == 0x0A {
            if !silent { push("hardbreak", "br", 0) }
            pos += 1
            while pos < max {
                ch1 = ch(pos)
                if !MD.isSpace(ch1) { break }
                pos += 1
            }
            self.pos = pos
            return true
        }
        if ch1 == 0x20 {
            if !silent {
                let token = push("text_special", "", 0)
                token.content = [0x5C]
                token.markup = [0x5C]
                token.info = "escape".units
            }
            self.pos = pos
            return true
        }
        var escapedStr = [src[pos]]
        if ch1 >= 0xD800, ch1 <= 0xDBFF, pos + 1 < max {
            let ch2 = ch(pos + 1)
            if ch2 >= 0xDC00, ch2 <= 0xDFFF {
                escapedStr.append(src[pos + 1])
                pos += 1
            }
        }
        let origStr = [0x5C] + escapedStr
        if !silent {
            let token = push("text_special", "", 0)
            token.content = ch1 < 256 && Self.escaped.contains(UInt16(ch1)) ? escapedStr : origStr
            token.markup = origStr
            token.info = "escape".units
        }
        self.pos = pos + 1
        return true
    }

    // MARK: backticks

    private func backtick(_ silent: Bool) -> Bool {
        let start = pos
        if ch(start) != 0x60 { return false }
        let max = posMax
        var pos = start + 1
        while pos < max, ch(pos) == 0x60 { pos += 1 }
        let marker = Array(src[start..<pos])
        let openerLength = marker.count
        if !backticksScanned {
            // the last run of each length
            var runs: [Int: Int] = [:]
            var at = 0
            while true {
                at = JSText.indexOf(src, 0x60, from: at)
                if at == -1 { break }
                let runStart = at
                at += 1
                while ch(at) == 0x60 { at += 1 }
                runs[at - runStart] = runStart
            }
            backticks = runs
            backticksScanned = true
        }
        if (backticks[openerLength] ?? -1) >= pos {
            var matchEnd = pos
            while true {
                let matchStart = JSText.indexOf(src, 0x60, from: matchEnd)
                if matchStart == -1 || matchStart >= max { break }
                matchEnd = matchStart + 1
                while ch(matchEnd) == 0x60 { matchEnd += 1 }
                if matchEnd > max { break }
                if matchEnd - matchStart == openerLength {
                    if !silent {
                        let token = push("code_inline", "code", 0)
                        token.markup = marker
                        var content = src[pos..<matchStart].map { $0 == 0x0A ? 0x20 : $0 }
                        if content.first == 0x20, content.last == 0x20, content.contains(where: { $0 != 0x20 }) {
                            content = Array(content.dropFirst().dropLast())
                        }
                        token.content = content
                    }
                    self.pos = matchEnd
                    return true
                }
            }
        }
        if !silent { pending += marker }
        self.pos = pos
        return true
    }

    // MARK: strikethrough

    private func strikethroughTokenize(_ silent: Bool) -> Bool {
        let start = pos
        let marker = ch(start)
        if silent { return false }
        if marker != 0x7E { return false }
        let scanned = scanDelims(pos, true)
        var len = scanned.length
        let ch = UInt16(marker)
        if len < 2 { return false }
        if len % 2 == 1 {
            push("text", "", 0).content = [ch]
            len -= 1
        }
        var i = 0
        while i < len {
            push("text", "", 0).content = [ch, ch]
            delimiters.items.append(MDDelimiter(marker: marker, length: 0, token: tokens.count - 1, end: -1,
                                                open: scanned.canOpen, close: scanned.canClose))
            i += 2
        }
        pos += scanned.length
        return true
    }

    private func strikethroughPostProcess(_ delimiters: MDDelimiterList) {
        var loneMarkers: [Int] = []
        for startDelim in delimiters.items {
            if startDelim.marker != 0x7E { continue }
            if startDelim.end == -1 { continue }
            let endDelim = delimiters.items[startDelim.end]
            var token = tokens[startDelim.token]
            token.type = "s_open"
            token.tag = "s"
            token.nesting = 1
            token.markup = [0x7E, 0x7E]
            token.content = []
            token = tokens[endDelim.token]
            token.type = "s_close"
            token.tag = "s"
            token.nesting = -1
            token.markup = [0x7E, 0x7E]
            token.content = []
            let before = tokens[endDelim.token - 1]
            if before.type == "text", before.content == [0x7E] { loneMarkers.append(endDelim.token - 1) }
        }
        while let i = loneMarkers.popLast() {
            var j = i + 1
            while j < tokens.count, tokens[j].type == "s_close" { j += 1 }
            j -= 1
            if i != j { tokens.swapAt(i, j) }
        }
    }

    func strikethroughPostProcess() {
        strikethroughPostProcess(delimiters)
        for meta in tokensMeta { if let meta { strikethroughPostProcess(meta) } }
    }

    // MARK: emphasis

    private func emphasisTokenize(_ silent: Bool) -> Bool {
        let start = pos
        let marker = ch(start)
        if silent { return false }
        if marker != 0x5F, marker != 0x2A { return false }
        let scanned = scanDelims(pos, marker == 0x2A)
        for _ in 0..<scanned.length {
            push("text", "", 0).content = [UInt16(marker)]
            delimiters.items.append(MDDelimiter(marker: marker, length: scanned.length, token: tokens.count - 1, end: -1,
                                                open: scanned.canOpen, close: scanned.canClose))
        }
        pos += scanned.length
        return true
    }

    private func emphasisPostProcess(_ list: MDDelimiterList) {
        let delimiters = list.items
        var i = delimiters.count - 1
        while i >= 0 {
            let startDelim = delimiters[i]
            if startDelim.marker != 0x5F && startDelim.marker != 0x2A || startDelim.end == -1 {
                i -= 1
                continue
            }
            let endDelim = delimiters[startDelim.end]
            let isStrong = i > 0
                && delimiters[i - 1].end == startDelim.end + 1
                && delimiters[i - 1].marker == startDelim.marker
                && delimiters[i - 1].token == startDelim.token - 1
                && delimiters[startDelim.end + 1].token == endDelim.token + 1
            let ch = UInt16(startDelim.marker)
            let open = tokens[startDelim.token]
            open.type = isStrong ? "strong_open" : "em_open"
            open.tag = isStrong ? "strong" : "em"
            open.nesting = 1
            open.markup = isStrong ? [ch, ch] : [ch]
            open.content = []
            let close = tokens[endDelim.token]
            close.type = isStrong ? "strong_close" : "em_close"
            close.tag = isStrong ? "strong" : "em"
            close.nesting = -1
            close.markup = isStrong ? [ch, ch] : [ch]
            close.content = []
            if isStrong {
                tokens[delimiters[i - 1].token].content = []
                tokens[delimiters[startDelim.end + 1].token].content = []
                i -= 1
            }
            i -= 1
        }
    }

    func emphasisPostProcess() {
        emphasisPostProcess(delimiters)
        for meta in tokensMeta { if let meta { emphasisPostProcess(meta) } }
    }

    // MARK: balance_pairs, fragments_join

    private static func processDelimiters(_ list: MDDelimiterList) {
        let delimiters = list.items
        let max = delimiters.count
        if max == 0 { return }
        var openersBottom: [Int: [Int]] = [:]
        var headerIdx = 0
        var lastTokenIdx = -2
        var jumps: [Int] = []
        for closerIdx in 0..<max {
            let closer = delimiters[closerIdx]
            jumps.append(0)
            if delimiters[headerIdx].marker != closer.marker || lastTokenIdx != closer.token - 1 { headerIdx = closerIdx }
            lastTokenIdx = closer.token
            if !closer.close { continue }
            if openersBottom[closer.marker] == nil { openersBottom[closer.marker] = [-1, -1, -1, -1, -1, -1] }
            let minOpenerIdx = openersBottom[closer.marker]![(closer.open ? 3 : 0) + closer.length % 3]
            var openerIdx = headerIdx - jumps[headerIdx] - 1
            var newMinOpenerIdx = openerIdx
            while openerIdx > minOpenerIdx {
                let opener = delimiters[openerIdx]
                if opener.marker != closer.marker {
                    openerIdx -= jumps[openerIdx] + 1
                    continue
                }
                if opener.open, opener.end < 0 {
                    var isOddMatch = false
                    if opener.close || closer.open {
                        if (opener.length + closer.length) % 3 == 0 {
                            if opener.length % 3 != 0 || closer.length % 3 != 0 { isOddMatch = true }
                        }
                    }
                    if !isOddMatch {
                        let lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0
                        jumps[closerIdx] = closerIdx - openerIdx + lastJump
                        jumps[openerIdx] = lastJump
                        closer.open = false
                        opener.end = closerIdx
                        opener.close = false
                        newMinOpenerIdx = -1
                        lastTokenIdx = -2
                        break
                    }
                }
                openerIdx -= jumps[openerIdx] + 1
            }
            if newMinOpenerIdx != -1 {
                openersBottom[closer.marker]![(closer.open ? 3 : 0) + closer.length % 3] = newMinOpenerIdx
            }
        }
    }

    func linkPairs() {
        Self.processDelimiters(delimiters)
        for meta in tokensMeta { if let meta { Self.processDelimiters(meta) } }
    }

    func fragmentsJoin() {
        var level = 0
        var last = 0
        let max = tokens.count
        var curr = 0
        while curr < max {
            if tokens[curr].nesting < 0 { level -= 1 }
            tokens[curr].level = level
            if tokens[curr].nesting > 0 { level += 1 }
            if tokens[curr].type == "text", curr + 1 < max, tokens[curr + 1].type == "text" {
                tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content
            } else {
                if curr != last { tokens[last] = tokens[curr] }
                last += 1
            }
            curr += 1
        }
        if curr != last { tokens.removeSubrange(last...) }
    }

    // MARK: link, image

    private func skipLinkSpace(_ pos: inout Int, _ max: Int) {
        while pos < max {
            let code = ch(pos)
            if !MD.isSpace(code), code != 0x0A { break }
            pos += 1
        }
    }

    private func link(_ silent: Bool) -> Bool {
        var href: [UInt16] = []
        var title: [UInt16] = []
        var label: [UInt16]?
        var start = pos
        var parseReference = true
        if ch(pos) != 0x5B { return false }
        let oldPos = pos
        let max = posMax
        let labelStart = pos + 1
        let labelEnd = parseLinkLabel(pos, true)
        if labelEnd < 0 { return false }
        var pos = labelEnd + 1
        if pos < max, ch(pos) == 0x28 {
            parseReference = false
            pos += 1
            skipLinkSpace(&pos, max)
            if pos >= max { return false }
            start = pos
            var res = MD.parseLinkDestination(src, pos, posMax)
            if res.ok {
                href = MarkdownURL.normalizeLink(res.str)
                if MarkdownURL.validateLink(href) { pos = res.pos } else { href = [] }
                start = pos
                skipLinkSpace(&pos, max)
                let titleRes = MD.parseLinkTitle(src, pos, posMax)
                if pos < max, start != pos, titleRes.ok {
                    title = titleRes.str
                    pos = titleRes.pos
                    skipLinkSpace(&pos, max)
                }
                res = MD.LinkResult()
            }
            if pos >= max || ch(pos) != 0x29 { parseReference = true }
            pos += 1
        }
        if parseReference {
            guard let references = env.references else { return false }
            if pos < max, ch(pos) == 0x5B {
                start = pos + 1
                pos = parseLinkLabel(pos, false)
                if pos >= 0 {
                    label = JSText.slice(src, start, pos)
                    pos += 1
                } else {
                    pos = labelEnd + 1
                }
            } else {
                pos = labelEnd + 1
            }
            if label?.isEmpty ?? true { label = JSText.slice(src, labelStart, labelEnd) }
            let key = MD.normalizeReference(label!)
            guard let ref = references[JSKey(JSText.string(key))] else {
                self.pos = oldPos
                return false
            }
            href = ref.href
            title = ref.title
        }
        if !silent {
            self.pos = labelStart
            posMax = labelEnd
            let open = push("link_open", "a", 1)
            open.attrs = [("href", .string(href))]
            if !title.isEmpty { open.attrs.append(("title", .string(title))) }
            linkLevel += 1
            tokenize()
            linkLevel -= 1
            push("link_close", "a", -1)
        }
        self.pos = pos
        posMax = max
        return true
    }

    private func image(_ silent: Bool) -> Bool {
        var href: [UInt16] = []
        var title: [UInt16] = []
        var label: [UInt16]?
        let oldPos = pos
        let max = posMax
        if ch(pos) != 0x21 { return false }
        if ch(pos + 1) != 0x5B { return false }
        let labelStart = pos + 2
        let labelEnd = parseLinkLabel(pos + 1, false)
        if labelEnd < 0 { return false }
        var pos = labelEnd + 1
        if pos < max, ch(pos) == 0x28 {
            pos += 1
            skipLinkSpace(&pos, max)
            if pos >= max { return false }
            var start = pos
            let res = MD.parseLinkDestination(src, pos, posMax)
            if res.ok {
                href = MarkdownURL.normalizeLink(res.str)
                if MarkdownURL.validateLink(href) { pos = res.pos } else { href = [] }
            }
            start = pos
            skipLinkSpace(&pos, max)
            let titleRes = MD.parseLinkTitle(src, pos, posMax)
            if pos < max, start != pos, titleRes.ok {
                title = titleRes.str
                pos = titleRes.pos
                skipLinkSpace(&pos, max)
            } else {
                title = []
            }
            if pos >= max || ch(pos) != 0x29 {
                self.pos = oldPos
                return false
            }
            pos += 1
        } else {
            guard let references = env.references else { return false }
            if pos < max, ch(pos) == 0x5B {
                let start = pos + 1
                pos = parseLinkLabel(pos, false)
                if pos >= 0 {
                    label = JSText.slice(src, start, pos)
                    pos += 1
                } else {
                    pos = labelEnd + 1
                }
            } else {
                pos = labelEnd + 1
            }
            if label?.isEmpty ?? true { label = JSText.slice(src, labelStart, labelEnd) }
            let key = MD.normalizeReference(label!)
            guard let ref = references[JSKey(JSText.string(key))] else {
                self.pos = oldPos
                return false
            }
            href = ref.href
            title = ref.title
        }
        if !silent {
            // markdown-it also parses the label into children; Morrow reads only `content`
            let content = JSText.slice(src, labelStart, labelEnd)
            let token = push("image", "img", 0)
            token.attrs = [("src", .string(href)), ("alt", .string([]))]
            token.children = []
            token.content = content
            if !title.isEmpty { token.attrs.append(("title", .string(title))) }
        }
        self.pos = pos
        posMax = max
        return true
    }

    // MARK: autolink, html_inline, entity

    private static let emailRE = JSRegex(#"^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$"#)
    private static let autolinkRE = JSRegex(#"^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$"#)

    private func autolink(_ silent: Bool) -> Bool {
        var pos = self.pos
        if ch(pos) != 0x3C { return false }
        let start = self.pos
        let max = posMax
        while true {
            pos += 1
            if pos >= max { return false }
            let ch = self.ch(pos)
            if ch == 0x3C { return false }
            if ch == 0x3E { break }
        }
        let url = Array(src[(start + 1)..<pos])
        var fullUrl: [UInt16]?
        if Self.autolinkRE.test(url) {
            fullUrl = MarkdownURL.normalizeLink(url)
        } else if Self.emailRE.test(url) {
            fullUrl = MarkdownURL.normalizeLink("mailto:".units + url)
        }
        guard let fullUrl else { return false }
        if !MarkdownURL.validateLink(fullUrl) { return false }
        if !silent {
            let open = push("link_open", "a", 1)
            open.attrs = [("href", .string(fullUrl))]
            open.markup = "autolink".units
            open.info = "auto".units
            push("text", "", 0).content = MarkdownURL.normalizeLinkText(url)
            let close = push("link_close", "a", -1)
            close.markup = "autolink".units
            close.info = "auto".units
        }
        self.pos += url.count + 2
        return true
    }

    static let htmlTagRE = JSRegex(
        "^(?:\(MDStateBlock.openTag)|\(MDStateBlock.closeTag)|<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->|<[?][\\s\\S]*?[?]>|<![A-Za-z][^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)"
    )

    private func htmlInline(_ silent: Bool) -> Bool {
        let max = posMax
        let pos = self.pos
        if ch(pos) != 0x3C || pos + 2 >= max { return false }
        let ch = self.ch(pos + 1)
        let lc = ch | 0x20
        if ch != 0x21, ch != 0x3F, ch != 0x2F, !(lc >= 0x61 && lc <= 0x7A) { return false }
        guard let match = Self.htmlTagRE.exec(subject, from: pos, anchored: true) else { return false }
        if !silent {
            let token = push("html_inline", "", 0)
            token.content = match.text
            let lower = JSText.asciiLower(token.content)
            // /^<a[>\s]/i and /^<\/a\s*>/i
            if lower.count >= 3, lower[0] == 0x3C, lower[1] == 0x61, lower[2] == 0x3E || JSText.isSpace(lower[2]) { linkLevel += 1 }
            if lower.count >= 4, lower[0] == 0x3C, lower[1] == 0x2F, lower[2] == 0x61,
               lower[3...].drop(while: JSText.isSpace).first == 0x3E { linkLevel -= 1 }
        }
        self.pos += match.range.count
        return true
    }

    private static func isAsciiAlnum(_ c: Int) -> Bool {
        (0x30...0x39).contains(c) || (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c)
    }

    private static func isAsciiLetter(_ c: Int) -> Bool { (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) }

    private static func isHexDigit(_ c: Int) -> Bool {
        (0x30...0x39).contains(c) || (0x41...0x46).contains(c) || (0x61...0x66).contains(c)
    }

    private func entity(_ silent: Bool) -> Bool {
        let pos = self.pos
        let max = posMax
        if ch(pos) != 0x26 { return false }
        if pos + 1 >= max { return false }
        if ch(pos + 1) == 0x23 {
            // /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i
            var end = -1
            var hex = false
            if ch(pos + 2) | 0x20 == 0x78 {
                var at = pos + 3
                while at < src.count, at - (pos + 3) < 6, Self.isHexDigit(ch(at)) { at += 1 }
                if at > pos + 3, ch(at) == 0x3B { end = at; hex = true }
            }
            if end < 0 {
                var at = pos + 2
                while at < src.count, at - (pos + 2) < 7, (0x30...0x39).contains(ch(at)) { at += 1 }
                if at > pos + 2, ch(at) == 0x3B { end = at }
            }
            guard end >= 0 else { return false }
            if !silent {
                let digits = src[(pos + (hex ? 3 : 2))..<end]
                let code = MD.entityCode(MD.parseDigits(digits, radix: hex ? 16 : 10))
                let token = push("text_special", "", 0)
                token.content = MD.isValidEntityCode(code) ? MD.fromCodePoint(code) : MD.fromCodePoint(0xFFFD)
                token.markup = Array(src[pos...end])
                token.info = "entity".units
            }
            self.pos += end - pos + 1
            return true
        }
        // /^&([a-z][a-z0-9]{1,31});/i
        guard Self.isAsciiLetter(ch(pos + 1)) else { return false }
        var at = pos + 2
        while at < src.count, at - (pos + 2) < 31, Self.isAsciiAlnum(ch(at)) { at += 1 }
        guard at > pos + 2, ch(at) == 0x3B else { return false }
        let match = Array(src[pos...at])
        let decoded = MD.decodeHTMLStrict(match)
        guard decoded != match else { return false }
        if !silent {
            let token = push("text_special", "", 0)
            token.content = decoded
            token.markup = match
            token.info = "entity".units
        }
        self.pos += match.count
        return true
    }
}
