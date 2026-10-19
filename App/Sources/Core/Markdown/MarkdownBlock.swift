import Foundation

/// What a parse shares between its block and inline passes: the link reference definitions.
nonisolated final class MDEnv {
    struct Reference {
        let href: [UInt16]
        let title: [UInt16]
    }

    /// nil until the first definition, as markdown-it's `env.references` is undefined until then.
    var references: [JSKey: Reference]?
}

/// The block rules in the order markdown-it 15 runs them with Morrow's configuration
/// (`commonmark` preset, `table` enabled, `math_block` before `fence`).
nonisolated enum MDBlockRule: CaseIterable {
    case table, code, mathBlock, fence, blockquote, hr, list, reference, htmlBlock, heading, lheading, paragraph

    /// The rules that may end a paragraph (also a reference definition; their `alt` lists name both).
    static let paragraphTerminators: [MDBlockRule] = [.table, .mathBlock, .fence, .blockquote, .hr, .list, .htmlBlock, .heading]
    static let blockquoteTerminators: [MDBlockRule] = [.mathBlock, .fence, .blockquote, .hr, .list, .htmlBlock, .heading]
    static let listTerminators: [MDBlockRule] = [.mathBlock, .fence, .blockquote, .hr]
}

/// markdown-it's StateBlock and block rules (src/rules_block), ported line by line.
nonisolated final class MDStateBlock {
    let src: [UInt16]
    let env: MDEnv
    var tokens: [MDToken] = []
    var bMarks: [Int] = []
    var eMarks: [Int] = []
    var tShift: [Int] = []
    var sCount: [Int] = []
    var bsCount: [Int] = []
    var blkIndent = 0
    var line = 0
    var lineMax = 0
    var tight = false
    var listIndent = -1
    var parentType = "root"
    var level = 0

    static let maxNesting = 20

    init(src: [UInt16], env: MDEnv) {
        self.src = src
        self.env = env
        let s = src
        var start = 0, pos = 0, indent = 0, offset = 0
        var indentFound = false
        let len = s.count
        while pos < len {
            let ch = Int(s[pos])
            if !indentFound {
                if MD.isSpace(ch) {
                    indent += 1
                    if ch == 0x09 { offset += 4 - offset % 4 } else { offset += 1 }
                    pos += 1
                    continue
                } else {
                    indentFound = true
                }
            }
            if ch == 0x0A || pos == len - 1 {
                if ch != 0x0A { pos += 1 }
                bMarks.append(start)
                eMarks.append(pos)
                tShift.append(indent)
                sCount.append(offset)
                bsCount.append(0)
                indentFound = false
                indent = 0
                offset = 0
                start = pos + 1
            }
            pos += 1
        }
        bMarks.append(s.count)
        eMarks.append(s.count)
        tShift.append(0)
        sCount.append(0)
        bsCount.append(0)
        lineMax = bMarks.count - 1
    }

    func ch(_ index: Int) -> Int { src.at(index) }

    @discardableResult
    func push(_ type: String, _ tag: String, _ nesting: Int) -> MDToken {
        let token = MDToken(type, tag, nesting)
        token.block = true
        if nesting < 0 { level -= 1 }
        token.level = level
        if nesting > 0 { level += 1 }
        tokens.append(token)
        return token
    }

    func isEmpty(_ line: Int) -> Bool { bMarks[line] + tShift[line] >= eMarks[line] }

    func skipEmptyLines(_ from: Int) -> Int {
        var from = from
        while from < lineMax {
            if bMarks[from] + tShift[from] < eMarks[from] { break }
            from += 1
        }
        return from
    }

    func skipSpaces(_ pos: Int) -> Int {
        var pos = pos
        while pos < src.count, MD.isSpace(Int(src[pos])) { pos += 1 }
        return pos
    }

    func skipSpacesBack(_ pos: Int, _ min: Int) -> Int {
        var pos = pos
        if pos <= min { return pos }
        while pos > min {
            pos -= 1
            if !MD.isSpace(ch(pos)) { return pos + 1 }
        }
        return pos
    }

    func skipChars(_ pos: Int, _ code: Int) -> Int {
        var pos = pos
        while pos < src.count, Int(src[pos]) == code { pos += 1 }
        return pos
    }

    func skipCharsBack(_ pos: Int, _ code: Int, _ min: Int) -> Int {
        var pos = pos
        if pos <= min { return pos }
        while pos > min {
            pos -= 1
            if code != ch(pos) { return pos + 1 }
        }
        return pos
    }

    func getLines(_ begin: Int, _ end: Int, _ indent: Int, _ keepLastLF: Bool) -> [UInt16] {
        if begin >= end { return [] }
        var out: [UInt16] = []
        for line in begin..<end {
            var lineIndent = 0
            let lineStart = bMarks[line]
            var first = lineStart
            let last = line + 1 < end || keepLastLF ? eMarks[line] + 1 : eMarks[line]
            while first < last, lineIndent < indent {
                let ch = self.ch(first)
                if MD.isSpace(ch) {
                    if ch == 0x09 { lineIndent += 4 - (lineIndent + bsCount[line]) % 4 } else { lineIndent += 1 }
                } else if first - lineStart < tShift[line] {
                    lineIndent += 1
                } else {
                    break
                }
                first += 1
            }
            if lineIndent > indent { out += Array(repeating: 0x20, count: lineIndent - indent) }
            out += JSText.slice(src, first, last)
        }
        return out
    }

    // MARK: tokenize

    func tokenize(_ startLine: Int, _ endLine: Int) {
        var line = startLine
        var hasEmptyLines = false
        while line < endLine {
            line = skipEmptyLines(line)
            self.line = line
            if line >= endLine { break }
            if sCount[line] < blkIndent { break }
            if level >= Self.maxNesting {
                self.line = endLine
                break
            }
            let prevLine = self.line
            var ok = false
            for rule in MDBlockRule.allCases {
                ok = run(rule, line, endLine, false)
                if ok {
                    precondition(prevLine < self.line, "block rule didn't increment state.line")
                    break
                }
            }
            precondition(ok, "none of the block rules matched")
            tight = !hasEmptyLines
            if isEmpty(self.line - 1) { hasEmptyLines = true }
            line = self.line
            if line < endLine, isEmpty(line) {
                hasEmptyLines = true
                line += 1
                self.line = line
            }
        }
    }

    func run(_ rule: MDBlockRule, _ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        switch rule {
        case .table: table(startLine, endLine, silent)
        case .code: code(startLine, endLine)
        case .mathBlock: mathBlock(startLine, endLine, silent)
        case .fence: fence(startLine, endLine, silent)
        case .blockquote: blockquote(startLine, endLine, silent)
        case .hr: hr(startLine, endLine, silent)
        case .list: list(startLine, endLine, silent)
        case .reference: reference(startLine, endLine, silent)
        case .htmlBlock: htmlBlock(startLine, endLine, silent)
        case .heading: heading(startLine, endLine, silent)
        case .lheading: lheading(startLine, endLine)
        case .paragraph: paragraph(startLine, endLine)
        }
    }

    func terminates(_ rules: [MDBlockRule], _ line: Int, _ endLine: Int) -> Bool {
        rules.contains { run($0, line, endLine, true) }
    }

    // MARK: table

    private func getLine(_ line: Int) -> [UInt16] {
        JSText.slice(src, bMarks[line] + tShift[line], eMarks[line])
    }

    private static func escapedSplit(_ str: [UInt16]) -> [[UInt16]] {
        var result: [[UInt16]] = []
        let max = str.count
        var pos = 0
        var ch = str.at(pos)
        var isEscaped = false
        var lastPos = 0
        var current: [UInt16] = []
        while pos < max {
            if ch == 0x7C {
                if !isEscaped {
                    result.append(current + JSText.slice(str, lastPos, pos))
                    current = []
                    lastPos = pos + 1
                } else {
                    current += JSText.slice(str, lastPos, pos - 1)
                    lastPos = pos
                }
            }
            isEscaped = ch == 0x5C
            pos += 1
            ch = str.at(pos)
        }
        result.append(current + JSText.slice(str, lastPos))
        return result
    }

    /// `/^:?-+:?$/`
    private static func isAlignCell(_ t: [UInt16]) -> Bool {
        var units = t[...]
        if units.first == 0x3A { units = units.dropFirst() }
        if units.last == 0x3A { units = units.dropLast() }
        return !units.isEmpty && units.allSatisfy { $0 == 0x2D }
    }

    private func table(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        if startLine + 2 > endLine { return false }
        var nextLine = startLine + 1
        if sCount[nextLine] < blkIndent { return false }
        if sCount[nextLine] - blkIndent >= 4 { return false }
        var pos = bMarks[nextLine] + tShift[nextLine]
        if pos >= eMarks[nextLine] { return false }
        let firstCh = ch(pos)
        pos += 1
        if firstCh != 0x7C, firstCh != 0x2D, firstCh != 0x3A { return false }
        if pos >= eMarks[nextLine] { return false }
        let secondCh = ch(pos)
        pos += 1
        if secondCh != 0x7C, secondCh != 0x2D, secondCh != 0x3A, !MD.isSpace(secondCh) { return false }
        if firstCh == 0x2D, MD.isSpace(secondCh) { return false }
        while pos < eMarks[nextLine] {
            let ch = self.ch(pos)
            if ch != 0x7C, ch != 0x2D, ch != 0x3A, !MD.isSpace(ch) { return false }
            pos += 1
        }
        var lineText = getLine(startLine + 1)
        var columns = lineText.split(separator: 0x7C, omittingEmptySubsequences: false).map(Array.init)
        var aligns: [String] = []
        for (i, column) in columns.enumerated() {
            let t = JSText.trim(column)
            if t.isEmpty {
                if i == 0 || i == columns.count - 1 { continue } else { return false }
            }
            if !Self.isAlignCell(t) { return false }
            if t.last == 0x3A { aligns.append(t.first == 0x3A ? "center" : "right") }
            else if t.first == 0x3A { aligns.append("left") }
            else { aligns.append("") }
        }
        lineText = JSText.trim(getLine(startLine))
        if !lineText.contains(0x7C) { return false }
        if sCount[startLine] - blkIndent >= 4 { return false }
        columns = Self.escapedSplit(lineText)
        if !columns.isEmpty, columns[0].isEmpty { columns.removeFirst() }
        if !columns.isEmpty, columns[columns.count - 1].isEmpty { columns.removeLast() }
        let columnCount = columns.count
        if columnCount == 0 || columnCount != aligns.count { return false }
        if silent { return true }
        let oldParentType = parentType
        parentType = "table"
        push("table_open", "table", 1)
        push("thead_open", "thead", 1)
        push("tr_open", "tr", 1)
        for i in 0..<columns.count {
            let open = push("th_open", "th", 1)
            if !aligns[i].isEmpty { open.attrs = [("style", .string("text-align:\(aligns[i])".units))] }
            let inline = push("inline", "", 0)
            inline.content = JSText.trim(columns[i])
            inline.children = []
            push("th_close", "th", -1)
        }
        push("tr_close", "tr", -1)
        push("thead_close", "thead", -1)
        var hasBody = false
        var autocompletedCells = 0
        nextLine = startLine + 2
        while nextLine < endLine {
            if sCount[nextLine] < blkIndent { break }
            if terminates(MDBlockRule.blockquoteTerminators, nextLine, endLine) { break }
            lineText = JSText.trim(getLine(nextLine))
            if lineText.isEmpty { break }
            if sCount[nextLine] - blkIndent >= 4 { break }
            columns = Self.escapedSplit(lineText)
            if !columns.isEmpty, columns[0].isEmpty { columns.removeFirst() }
            if !columns.isEmpty, columns[columns.count - 1].isEmpty { columns.removeLast() }
            autocompletedCells += columnCount - columns.count
            if autocompletedCells > 65536 { break }
            if nextLine == startLine + 2 {
                push("tbody_open", "tbody", 1)
                hasBody = true
            }
            push("tr_open", "tr", 1)
            for i in 0..<columnCount {
                let open = push("td_open", "td", 1)
                if !aligns[i].isEmpty { open.attrs = [("style", .string("text-align:\(aligns[i])".units))] }
                let inline = push("inline", "", 0)
                inline.content = i < columns.count ? JSText.trim(columns[i]) : []
                inline.children = []
                push("td_close", "td", -1)
            }
            push("tr_close", "tr", -1)
            nextLine += 1
        }
        if hasBody { push("tbody_close", "tbody", -1) }
        push("table_close", "table", -1)
        parentType = oldParentType
        line = nextLine
        return true
    }

    // MARK: code, fence

    private func code(_ startLine: Int, _ endLine: Int) -> Bool {
        if sCount[startLine] - blkIndent < 4 { return false }
        var nextLine = startLine + 1
        var last = nextLine
        while nextLine < endLine {
            if isEmpty(nextLine) {
                nextLine += 1
                continue
            }
            if sCount[nextLine] - blkIndent >= 4 {
                nextLine += 1
                last = nextLine
                continue
            }
            break
        }
        line = last
        let token = push("code_block", "code", 0)
        token.content = getLines(startLine, last, 4 + blkIndent, false) + [0x0A]
        return true
    }

    private func fence(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        var pos = bMarks[startLine] + tShift[startLine]
        var max = eMarks[startLine]
        if sCount[startLine] - blkIndent >= 4 { return false }
        if pos + 3 > max { return false }
        let marker = ch(pos)
        if marker != 0x7E, marker != 0x60 { return false }
        var mem = pos
        pos = skipChars(pos, marker)
        var len = pos - mem
        if len < 3 { return false }
        let markup = JSText.slice(src, mem, pos)
        let params = JSText.slice(src, pos, max)
        if marker == 0x60, params.contains(0x60) { return false }
        if silent { return true }
        var nextLine = startLine
        var haveEndMarker = false
        while true {
            nextLine += 1
            if nextLine >= endLine { break }
            pos = bMarks[nextLine] + tShift[nextLine]
            mem = pos
            max = eMarks[nextLine]
            if pos < max, sCount[nextLine] < blkIndent { break }
            if ch(pos) != marker { continue }
            if sCount[nextLine] - blkIndent >= 4 { continue }
            pos = skipChars(pos, marker)
            if pos - mem < len { continue }
            pos = skipSpaces(pos)
            if pos < max { continue }
            haveEndMarker = true
            break
        }
        len = sCount[startLine]
        line = nextLine + (haveEndMarker ? 1 : 0)
        let token = push("fence", "code", 0)
        token.info = params
        token.content = getLines(startLine + 1, nextLine, len, true)
        token.markup = markup
        return true
    }

    // MARK: blockquote

    private func blockquote(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        var pos = bMarks[startLine] + tShift[startLine]
        var max = eMarks[startLine]
        let oldLineMax = lineMax
        if sCount[startLine] - blkIndent >= 4 { return false }
        if ch(pos) != 0x3E { return false }
        if silent { return true }
        var oldBMarks: [Int] = [], oldBSCount: [Int] = [], oldSCount: [Int] = [], oldTShift: [Int] = []
        let oldParentType = parentType
        parentType = "blockquote"
        var lastLineEmpty = false
        var nextLine = startLine
        while nextLine < endLine {
            let isOutdented = sCount[nextLine] < blkIndent
            pos = bMarks[nextLine] + tShift[nextLine]
            max = eMarks[nextLine]
            if pos >= max { break }
            let marker = ch(pos)
            pos += 1
            if marker == 0x3E, !isOutdented {
                var initial = sCount[nextLine] + 1
                var spaceAfterMarker: Bool
                var adjustTab = false
                if ch(pos) == 0x20 {
                    pos += 1
                    initial += 1
                    adjustTab = false
                    spaceAfterMarker = true
                } else if ch(pos) == 0x09 {
                    spaceAfterMarker = true
                    if (bsCount[nextLine] + initial) % 4 == 3 {
                        pos += 1
                        initial += 1
                        adjustTab = false
                    } else {
                        adjustTab = true
                    }
                } else {
                    spaceAfterMarker = false
                }
                var offset = initial
                oldBMarks.append(bMarks[nextLine])
                bMarks[nextLine] = pos
                while pos < max {
                    let ch = self.ch(pos)
                    if MD.isSpace(ch) {
                        if ch == 0x09 { offset += 4 - (offset + bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4 } else { offset += 1 }
                    } else {
                        break
                    }
                    pos += 1
                }
                lastLineEmpty = pos >= max
                oldBSCount.append(bsCount[nextLine])
                bsCount[nextLine] = sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0)
                oldSCount.append(sCount[nextLine])
                sCount[nextLine] = offset - initial
                oldTShift.append(tShift[nextLine])
                tShift[nextLine] = pos - bMarks[nextLine]
                nextLine += 1
                continue
            }
            if lastLineEmpty { break }
            if terminates(MDBlockRule.blockquoteTerminators, nextLine, endLine) {
                lineMax = nextLine
                if blkIndent != 0 {
                    oldBMarks.append(bMarks[nextLine])
                    oldBSCount.append(bsCount[nextLine])
                    oldTShift.append(tShift[nextLine])
                    oldSCount.append(sCount[nextLine])
                    sCount[nextLine] -= blkIndent
                }
                break
            }
            oldBMarks.append(bMarks[nextLine])
            oldBSCount.append(bsCount[nextLine])
            oldTShift.append(tShift[nextLine])
            oldSCount.append(sCount[nextLine])
            sCount[nextLine] = -1
            nextLine += 1
        }
        let oldIndent = blkIndent
        blkIndent = 0
        push("blockquote_open", "blockquote", 1).markup = [0x3E]
        tokenize(startLine, nextLine)
        push("blockquote_close", "blockquote", -1).markup = [0x3E]
        lineMax = oldLineMax
        parentType = oldParentType
        for i in 0..<oldTShift.count {
            bMarks[i + startLine] = oldBMarks[i]
            tShift[i + startLine] = oldTShift[i]
            sCount[i + startLine] = oldSCount[i]
            bsCount[i + startLine] = oldBSCount[i]
        }
        blkIndent = oldIndent
        return true
    }

    // MARK: hr

    private func hr(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        let max = eMarks[startLine]
        if sCount[startLine] - blkIndent >= 4 { return false }
        var pos = bMarks[startLine] + tShift[startLine]
        let marker = ch(pos)
        pos += 1
        if marker != 0x2A, marker != 0x2D, marker != 0x5F { return false }
        var cnt = 1
        while pos < max {
            let ch = self.ch(pos)
            pos += 1
            if ch != marker, !MD.isSpace(ch) { return false }
            if ch == marker { cnt += 1 }
        }
        if cnt < 3 { return false }
        if silent { return true }
        line = startLine + 1
        let token = push("hr", "hr", 0)
        token.markup = Array(repeating: UInt16(marker), count: cnt)
        return true
    }

    // MARK: list

    private func skipBulletListMarker(_ startLine: Int) -> Int {
        let max = eMarks[startLine]
        var pos = bMarks[startLine] + tShift[startLine]
        let marker = ch(pos)
        pos += 1
        if marker != 0x2A, marker != 0x2D, marker != 0x2B { return -1 }
        if pos < max, !MD.isSpace(ch(pos)) { return -1 }
        return pos
    }

    private func skipOrderedListMarker(_ startLine: Int) -> Int {
        let start = bMarks[startLine] + tShift[startLine]
        let max = eMarks[startLine]
        var pos = start
        if pos + 1 >= max { return -1 }
        var ch = self.ch(pos)
        pos += 1
        if ch < 0x30 || ch > 0x39 { return -1 }
        while true {
            if pos >= max { return -1 }
            ch = self.ch(pos)
            pos += 1
            if ch >= 0x30, ch <= 0x39 {
                if pos - start >= 10 { return -1 }
                continue
            }
            if ch == 0x29 || ch == 0x2E { break }
            return -1
        }
        if pos < max, !MD.isSpace(self.ch(pos)) { return -1 }
        return pos
    }

    private func markTightParagraphs(_ idx: Int) {
        let level = self.level + 2
        var i = idx + 2
        let l = tokens.count - 2
        while i < l {
            if tokens[i].level == level, tokens[i].type == "paragraph_open" {
                tokens[i + 2].hidden = true
                tokens[i].hidden = true
                i += 2
            }
            i += 1
        }
    }

    private func list(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        var nextLine = startLine
        var tight = true
        if sCount[nextLine] - blkIndent >= 4 { return false }
        if listIndent >= 0, sCount[nextLine] - listIndent >= 4, sCount[nextLine] < blkIndent { return false }
        var isTerminatingParagraph = false
        if silent, parentType == "paragraph", sCount[nextLine] >= blkIndent { isTerminatingParagraph = true }
        let isOrdered: Bool
        var markerValue = 0.0
        var start = 0
        var posAfterMarker = skipOrderedListMarker(nextLine)
        if posAfterMarker >= 0 {
            isOrdered = true
            start = bMarks[nextLine] + tShift[nextLine]
            markerValue = MD.parseDigits(src[start..<(posAfterMarker - 1)], radix: 10)
            if isTerminatingParagraph, markerValue != 1 { return false }
        } else {
            posAfterMarker = skipBulletListMarker(nextLine)
            if posAfterMarker >= 0 { isOrdered = false } else { return false }
        }
        if isTerminatingParagraph, skipSpaces(posAfterMarker) >= eMarks[nextLine] { return false }
        if silent { return true }
        let markerCharCode = UInt16(ch(posAfterMarker - 1))
        let listTokIdx = tokens.count
        var token: MDToken
        if isOrdered {
            token = push("ordered_list_open", "ol", 1)
            if markerValue != 1 { token.attrs = [("start", .number(markerValue))] }
        } else {
            token = push("bullet_list_open", "ul", 1)
        }
        token.markup = [markerCharCode]
        var prevEmptyEnd = false
        let oldParentType = parentType
        parentType = "list"
        while nextLine < endLine {
            var pos = posAfterMarker
            let max = eMarks[nextLine]
            let initial = sCount[nextLine] + posAfterMarker - (bMarks[nextLine] + tShift[nextLine])
            var offset = initial
            while pos < max {
                let ch = self.ch(pos)
                if ch == 0x09 { offset += 4 - (offset + bsCount[nextLine]) % 4 }
                else if ch == 0x20 { offset += 1 }
                else { break }
                pos += 1
            }
            let contentStart = pos
            var indentAfterMarker = contentStart >= max ? 1 : offset - initial
            if indentAfterMarker > 4 { indentAfterMarker = 1 }
            let indent = initial + indentAfterMarker
            token = push("list_item_open", "li", 1)
            token.markup = [markerCharCode]
            if isOrdered { token.info = JSText.slice(src, start, posAfterMarker - 1) }
            let oldTight = self.tight
            let oldTShift = tShift[nextLine]
            let oldSCount = sCount[nextLine]
            let oldListIndent = listIndent
            listIndent = blkIndent
            blkIndent = indent
            self.tight = true
            tShift[nextLine] = contentStart - bMarks[nextLine]
            sCount[nextLine] = offset
            if contentStart >= max, isEmpty(nextLine + 1) {
                line = min(line + 2, endLine)
            } else {
                tokenize(nextLine, endLine)
            }
            if !self.tight || prevEmptyEnd { tight = false }
            prevEmptyEnd = line - nextLine > 1 && isEmpty(line - 1)
            blkIndent = listIndent
            listIndent = oldListIndent
            tShift[nextLine] = oldTShift
            sCount[nextLine] = oldSCount
            self.tight = oldTight
            token = push("list_item_close", "li", -1)
            token.markup = [markerCharCode]
            nextLine = line
            if nextLine >= endLine { break }
            if sCount[nextLine] < blkIndent { break }
            if sCount[nextLine] - blkIndent >= 4 { break }
            if terminates(MDBlockRule.listTerminators, nextLine, endLine) { break }
            if isOrdered {
                posAfterMarker = skipOrderedListMarker(nextLine)
                if posAfterMarker < 0 { break }
                start = bMarks[nextLine] + tShift[nextLine]
            } else {
                posAfterMarker = skipBulletListMarker(nextLine)
                if posAfterMarker < 0 { break }
            }
            if Int(markerCharCode) != ch(posAfterMarker - 1) { break }
        }
        token = isOrdered ? push("ordered_list_close", "ol", -1) : push("bullet_list_close", "ul", -1)
        token.markup = [markerCharCode]
        line = nextLine
        parentType = oldParentType
        if tight { markTightParagraphs(listTokIdx) }
        return true
    }

    // MARK: reference

    private func reference(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        var pos = bMarks[startLine] + tShift[startLine]
        var max = eMarks[startLine]
        var nextLine = startLine + 1
        if sCount[startLine] - blkIndent >= 4 { return false }
        if ch(pos) != 0x5B { return false }

        func getNextLine(_ nextLine: Int) -> [UInt16]? {
            let endLine = lineMax
            if nextLine >= endLine || isEmpty(nextLine) { return nil }
            var isContinuation = false
            if sCount[nextLine] - blkIndent > 3 { isContinuation = true }
            if sCount[nextLine] < 0 { isContinuation = true }
            if !isContinuation {
                let oldParentType = parentType
                parentType = "reference"
                let terminate = terminates(MDBlockRule.paragraphTerminators, nextLine, endLine)
                parentType = oldParentType
                if terminate { return nil }
            }
            return JSText.slice(src, bMarks[nextLine] + tShift[nextLine], eMarks[nextLine] + 1)
        }

        var str = JSText.slice(src, pos, max + 1)
        max = str.count
        var labelEnd = -1
        pos = 1
        while pos < max {
            let ch = str.at(pos)
            if ch == 0x5B {
                return false
            } else if ch == 0x5D {
                labelEnd = pos
                break
            } else if ch == 0x0A {
                if let lineContent = getNextLine(nextLine) {
                    str += lineContent
                    max = str.count
                    nextLine += 1
                }
            } else if ch == 0x5C {
                pos += 1
                if pos < max, str.at(pos) == 0x0A, let lineContent = getNextLine(nextLine) {
                    str += lineContent
                    max = str.count
                    nextLine += 1
                }
            }
            pos += 1
        }
        if labelEnd < 0 || str.at(labelEnd + 1) != 0x3A { return false }
        pos = labelEnd + 2
        while pos < max {
            let ch = str.at(pos)
            if ch == 0x0A {
                if let lineContent = getNextLine(nextLine) {
                    str += lineContent
                    max = str.count
                    nextLine += 1
                }
            } else if MD.isSpace(ch) {
            } else {
                break
            }
            pos += 1
        }
        let destRes = MD.parseLinkDestination(str, pos, max)
        if !destRes.ok { return false }
        let href = MarkdownURL.normalizeLink(destRes.str)
        if !MarkdownURL.validateLink(href) { return false }
        pos = destRes.pos
        let destEndPos = pos
        let destEndLineNo = nextLine
        let start = pos
        while pos < max {
            let ch = str.at(pos)
            if ch == 0x0A {
                if let lineContent = getNextLine(nextLine) {
                    str += lineContent
                    max = str.count
                    nextLine += 1
                }
            } else if MD.isSpace(ch) {
            } else {
                break
            }
            pos += 1
        }
        var titleRes = MD.parseLinkTitle(str, pos, max)
        while titleRes.canContinue {
            guard let lineContent = getNextLine(nextLine) else { break }
            str += lineContent
            pos = max
            max = str.count
            nextLine += 1
            titleRes = MD.parseLinkTitle(str, pos, max, titleRes)
        }
        var title: [UInt16]
        if pos < max, start != pos, titleRes.ok {
            title = titleRes.str
            pos = titleRes.pos
        } else {
            title = []
            pos = destEndPos
            nextLine = destEndLineNo
        }
        while pos < max {
            if !MD.isSpace(str.at(pos)) { break }
            pos += 1
        }
        if pos < max, str.at(pos) != 0x0A, !title.isEmpty {
            title = []
            pos = destEndPos
            nextLine = destEndLineNo
            while pos < max {
                if !MD.isSpace(str.at(pos)) { break }
                pos += 1
            }
        }
        if pos < max, str.at(pos) != 0x0A { return false }
        let label = MD.normalizeReference(JSText.slice(str, 1, labelEnd))
        if label.isEmpty { return false }
        if silent { return true }
        if env.references == nil { env.references = [:] }
        let key = JSKey(JSText.string(label))
        if env.references![key] == nil { env.references![key] = MDEnv.Reference(href: href, title: title) }
        let token = push("reference_definition", "", 0)
        token.hidden = true
        line = nextLine
        return true
    }

    // MARK: html_block

    private static let blockNames = [
        "address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", "center", "col", "colgroup",
        "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
        "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "iframe", "legend",
        "li", "link", "main", "menu", "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param",
        "search", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track", "ul",
    ]

    static let openTag = #"<[A-Za-z][A-Za-z0-9\-]*(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|'[^']*'|"[^"]*"))?)*\s*\/?>"#
    static let closeTag = #"<\/[A-Za-z][A-Za-z0-9\-]*\s*>"#

    /// HTML_SEQUENCES: how a block of raw HTML starts, how it ends (nil: at a blank line), and whether it may
    /// end a paragraph.
    private static let htmlSequences: [(open: JSRegex, close: JSRegex?, interrupts: Bool)] = [
        (JSRegex(#"^<(script|pre|style|textarea)(?=(\s|>|$))"#, ignoreCase: true), JSRegex(#"<\/(script|pre|style|textarea)>"#, ignoreCase: true), true),
        (JSRegex(#"^<!--"#), JSRegex(#"-->"#), true),
        (JSRegex(#"^<\?"#), JSRegex(#"\?>"#), true),
        (JSRegex(#"^<![A-Za-z]"#), JSRegex(#">"#), true),
        (JSRegex(#"^<!\[CDATA\["#), JSRegex(#"\]\]>"#), true),
        (JSRegex("^</?(\(blockNames.joined(separator: "|")))(?=(\\s|/?>|$))", ignoreCase: true), nil, true),
        (JSRegex("^(?:\(openTag)|\(closeTag))\\s*$"), nil, false),
    ]

    private func htmlBlock(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        var pos = bMarks[startLine] + tShift[startLine]
        var max = eMarks[startLine]
        if sCount[startLine] - blkIndent >= 4 { return false }
        if ch(pos) != 0x3C { return false }
        var lineText = JSText.slice(src, pos, max)
        guard let sequence = Self.htmlSequences.first(where: { $0.open.test(lineText) }) else { return false }
        if silent { return sequence.interrupts }
        var nextLine = startLine + 1
        let endsOnBlankLine = sequence.close == nil
        func closes(_ text: [UInt16]) -> Bool { sequence.close.map { $0.test(text) } ?? text.isEmpty }
        if !closes(lineText) {
            while nextLine < endLine {
                if sCount[nextLine] < blkIndent, endsOnBlankLine || !isEmpty(nextLine) { break }
                pos = bMarks[nextLine] + tShift[nextLine]
                max = eMarks[nextLine]
                lineText = JSText.slice(src, pos, max)
                if closes(lineText) {
                    if !lineText.isEmpty { nextLine += 1 }
                    break
                }
                nextLine += 1
            }
        }
        line = nextLine
        let token = push("html_block", "", 0)
        token.content = getLines(startLine, nextLine, blkIndent, true)
        return true
    }

    // MARK: heading, lheading, paragraph

    private func heading(_ startLine: Int, _ endLine: Int, _ silent: Bool) -> Bool {
        var pos = bMarks[startLine] + tShift[startLine]
        var max = eMarks[startLine]
        if sCount[startLine] - blkIndent >= 4 { return false }
        var ch = self.ch(pos)
        if ch != 0x23 || pos >= max { return false }
        var level = 1
        pos += 1
        ch = self.ch(pos)
        while ch == 0x23, pos < max, level <= 6 {
            level += 1
            pos += 1
            ch = self.ch(pos)
        }
        if level > 6 || (pos < max && !MD.isSpace(ch)) { return false }
        if silent { return true }
        max = skipSpacesBack(max, pos)
        let tmp = skipCharsBack(max, 0x23, pos)
        if tmp > pos, MD.isSpace(self.ch(tmp - 1)) { max = tmp }
        line = startLine + 1
        let marks = Array(repeating: UInt16(0x23), count: level)
        push("heading_open", "h\(level)", 1).markup = marks
        let inline = push("inline", "", 0)
        inline.content = MD.asciiTrim(JSText.slice(src, pos, max))
        inline.children = []
        push("heading_close", "h\(level)", -1).markup = marks
        return true
    }

    private func lheading(_ startLine: Int, _ endLine: Int) -> Bool {
        if sCount[startLine] - blkIndent >= 4 { return false }
        let oldParentType = parentType
        parentType = "paragraph"
        var level = 0
        var marker = 0
        var nextLine = startLine + 1
        scan: while nextLine < endLine, !isEmpty(nextLine) {
            if sCount[nextLine] - blkIndent > 3 { nextLine += 1; continue }
            if sCount[nextLine] >= blkIndent {
                var pos = bMarks[nextLine] + tShift[nextLine]
                let max = eMarks[nextLine]
                if pos < max {
                    marker = ch(pos)
                    if marker == 0x2D || marker == 0x3D {
                        pos = skipChars(pos, marker)
                        pos = skipSpaces(pos)
                        if pos >= max {
                            level = marker == 0x3D ? 1 : 2
                            break scan
                        }
                    }
                }
            }
            if sCount[nextLine] < 0 { nextLine += 1; continue }
            if terminates(MDBlockRule.paragraphTerminators, nextLine, endLine) { break }
            nextLine += 1
        }
        if level == 0 {
            parentType = oldParentType
            return false
        }
        let content = MD.asciiTrim(getLines(startLine, nextLine, blkIndent, false))
        line = nextLine + 1
        push("heading_open", "h\(level)", 1).markup = [UInt16(marker)]
        let inline = push("inline", "", 0)
        inline.content = content
        inline.children = []
        push("heading_close", "h\(level)", -1).markup = [UInt16(marker)]
        parentType = oldParentType
        return true
    }

    private func paragraph(_ startLine: Int, _ endLine: Int) -> Bool {
        let oldParentType = parentType
        var nextLine = startLine + 1
        parentType = "paragraph"
        while nextLine < endLine, !isEmpty(nextLine) {
            if sCount[nextLine] - blkIndent > 3 { nextLine += 1; continue }
            if sCount[nextLine] < 0 { nextLine += 1; continue }
            if terminates(MDBlockRule.paragraphTerminators, nextLine, endLine) { break }
            nextLine += 1
        }
        let content = MD.asciiTrim(getLines(startLine, nextLine, blkIndent, false))
        line = nextLine
        push("paragraph_open", "p", 1)
        let inline = push("inline", "", 0)
        inline.content = content
        inline.children = []
        push("paragraph_close", "p", -1)
        parentType = oldParentType
        return true
    }
}
