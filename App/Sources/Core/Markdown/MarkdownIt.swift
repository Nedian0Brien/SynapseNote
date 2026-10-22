import Foundation

/// markdown-it 15.0.2 configured as Morrow's parse.ts configures it:
/// `new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough'])` plus Morrow's `wikilink`,
/// `math_inline`, `highlight` and `math_block` rules. `parse` gives the same token stream (the fields Morrow reads).
nonisolated enum MarkdownIt {
    static func parse(_ source: [UInt16]) -> [MDToken] {
        // core: normalize
        var src: [UInt16] = []
        src.reserveCapacity(source.count)
        var index = 0
        while index < source.count {
            let unit = source[index]
            if unit == 0x0D {
                src.append(0x0A)
                if index + 1 < source.count, source[index + 1] == 0x0A { index += 1 }
            } else if unit == 0 {
                src.append(0xFFFD)
            } else {
                src.append(unit)
            }
            index += 1
        }
        let env = MDEnv()
        // core: block
        guard !src.isEmpty else { return [] }
        let block = MDStateBlock(src: src, env: env)
        block.tokenize(block.line, block.lineMax)
        // core: strip_references
        let tokens = block.tokens.filter { $0.type != "reference_definition" }
        // core: inline
        for token in tokens where token.type == "inline" {
            token.children = MDStateInline.parse(token.content, env: env)
        }
        // core: text_join
        for token in tokens where token.type == "inline" {
            guard let children = token.children else { continue }
            for child in children where child.type == "text_special" { child.type = "text" }
            var joined: [MDToken] = []
            for child in children {
                if let last = joined.last, last.type == "text", child.type == "text" {
                    child.content = last.content + child.content
                    joined[joined.count - 1] = child
                } else {
                    joined.append(child)
                }
            }
            token.children = joined
        }
        return tokens
    }
}

// MARK: Morrow's rules (src/core/markdown/parse.ts)

nonisolated extension MDStateInline {
    /// `[[target#anchor|alias]]` and `![[embed]]`, before markdown links so the brackets are not read as one.
    /// WIKI = /^(!?)\[\[([^[\]\n]{0,400}?)\]\]/ on the next 810 units.
    func wikilink(_ silent: Bool) -> Bool {
        let start = pos
        let first = ch(start)
        if first != 0x21, first != 0x5B { return false }
        let limit = min(posMax, start + 810)
        func at(_ index: Int) -> Int { index < limit ? ch(index) : -1 }
        var index = start
        let embed = first == 0x21
        if embed { index += 1 }
        guard at(index) == 0x5B, at(index + 1) == 0x5B else { return false }
        index += 2
        let innerStart = index
        while true {
            let unit = at(index)
            if unit == 0x5D {
                guard at(index + 1) == 0x5D else { return false }
                break
            }
            if unit == -1 || unit == 0x5B || unit == 0x0A || index - innerStart >= 400 { return false }
            index += 1
        }
        let end = index + 2
        if !silent {
            let token = push("wikilink", "", 0)
            token.wiki = Self.parseWikiLink(Array(src[innerStart..<index]), embed: embed)
            token.markup = Array(src[start..<end])
        }
        pos = end
        return true
    }

    static func parseWikiLink(_ inner: [UInt16], embed: Bool) -> WikiLink {
        // tables escape the alias bar as \|, inner.search(/\\?\|/)
        var bar = JSText.indexOf(inner, 0x7C)
        if bar > 0, inner[bar - 1] == 0x5C { bar -= 1 }
        let head = bar == -1 ? inner : Array(inner[..<bar])
        var alias: [UInt16]?
        if bar != -1 {
            var rest = Array(inner[bar...])
            if rest.first == 0x5C { rest.removeFirst() }
            if rest.first == 0x7C { rest.removeFirst() }
            alias = rest
        }
        let hash = JSText.indexOf(head, 0x23)
        return WikiLink(
            target: JSText.string(JSText.trim(hash == -1 ? head : Array(head[..<hash]))),
            anchor: hash == -1 ? nil : JSText.string(JSText.trim(Array(head[(hash + 1)...]))),
            alias: alias.map { JSText.string(JSText.trim($0)) },
            embed: embed,
        )
    }

    /// `$inline$` with the usual rules that keep prices like $5 and $10 as text.
    func mathInline(_ silent: Bool) -> Bool {
        let start = pos
        if ch(start) != 0x24 { return false }
        let display = ch(start + 1) == 0x24
        let open = display ? 2 : 1
        let next = ch(start + open)
        if next == -1 || JSText.isSpace(UInt16(next)) || next == 0x24 { return false }
        let closer: [UInt16] = display ? [0x24, 0x24] : [0x24]
        var end = JSText.indexOf(src, closer, from: start + open)
        while end != -1, ch(end - 1) == 0x5C { end = JSText.indexOf(src, closer, from: end + 1) }
        if end == -1 || end + open > posMax { return false }
        let content = Array(src[(start + open)..<end])
        if let last = content.last, JSText.isSpace(last) { return false }
        if JSText.indexOf(content, [0x0A, 0x0A]) != -1 { return false }
        if !display, (0x30...0x39).contains(ch(end + 1)) { return false }
        if !silent {
            let token = push("math_inline", "math", 0)
            token.content = content
            token.markup = closer
        }
        pos = end + open
        return true
    }

    /// `==highlighted text==` as Obsidian writes it.
    func highlight(_ silent: Bool) -> Bool {
        let start = pos
        if ch(start) != 0x3D || ch(start + 1) != 0x3D { return false }
        if ch(start + 2) == 0x3D { return false }
        let end = JSText.indexOf(src, [0x3D, 0x3D], from: start + 2)
        if end == -1 || end + 2 > posMax || end == start + 2 { return false }
        let inner = src[(start + 2)..<end]
        if JSText.isSpace(inner.first!) || JSText.isSpace(inner.last!) { return false }
        if JSText.indexOf(Array(inner), [0x0A, 0x0A]) != -1 { return false }
        if !silent {
            push("mark_open", "mark", 1)
            let max = posMax
            pos = start + 2
            posMax = end
            tokenize()
            posMax = max
            push("mark_close", "mark", -1)
        }
        pos = end + 2
        return true
    }
}

nonisolated extension MDStateBlock {
    /// `$$` on its own line opens a display formula that runs until a line ending in `$$`.
    func mathBlock(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        if sCount[startLine] - blkIndent >= 4 { return false }
        let start = bMarks[startLine] + tShift[startLine]
        let max = eMarks[startLine]
        if !JSText.startsWith(src, [0x24, 0x24], at: start) { return false }
        let firstRest = JSText.trim(JSText.slice(src, start + 2, max))
        var line = startLine
        var parts: [[UInt16]] = []
        if JSText.endsWith(firstRest, [0x24, 0x24]), firstRest.count >= 2 {
            parts.append(Array(firstRest.dropLast(2)))
        } else {
            if !firstRest.isEmpty { parts.append(firstRest) }
            var closed = false
            while true {
                line += 1
                guard line < endLine else { break }
                let from = bMarks[line] + tShift[line]
                let to = eMarks[line]
                if from < to, sCount[line] < blkIndent { break }
                let text = JSText.slice(src, from, to)
                let trimmed = JSText.trimEnd(text)
                if JSText.endsWith(trimmed, [0x24, 0x24]) {
                    let before = Array(trimmed.dropLast(2))
                    if !JSText.trim(before).isEmpty { parts.append(before) }
                    closed = true
                    break
                }
                parts.append(JSText.slice(src, bMarks[line], to))
            }
            if !closed { return false }
        }
        if silent { return true }
        self.line = line + 1
        let token = push("math_block", "math", 0)
        token.block = true
        token.content = JSText.trim(Array(parts.joined(separator: [0x0A])))
        return true
    }
}
