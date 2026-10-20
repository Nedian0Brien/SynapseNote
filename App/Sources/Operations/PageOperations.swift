import Foundation

/// Morrow's page operations (src/app/operations.ts): new pages, today's note and quick capture, templates, and the
/// trash with its toasts. They read the Swift session's workspace and send the commands operations.ts sends.
extension EditorController {
    static func newId() -> String { UUID().uuidString.lowercased() }

    /// Morrow's createPage: a page, database or canvas under a parent, opened with the caret in its title unless
    /// `open` is false; its parent opens in the sidebar. The id, or nil when no vault is open.
    @discardableResult
    func makePage(parent: String?, kind: PageKind = .page, title: String = "", index: Int? = nil, open: Bool = true) -> String? {
        guard phase == .ready else { return nil }
        let id = Self.newId()
        var command = JSObject([("type", "page.create"), ("id", .string(id)), ("parentId", parent.map(JSValue.string) ?? .null),
                                ("now", .number(JSEnvironment.now())), ("title", .string(title)), ("kind", .string(kind.rawValue))])
        if kind == .database { command["database"] = Database.defaultDatabase(Self.newId).json }
        if kind == .canvas { command["doc"] = .object(CanvasFile.canvasDoc(CanvasFile.emptyCanvas())) }
        if let index { command["index"] = .number(Double(index)) }
        perform(.raw(.object(command)))
        if let parent { expanded.insert(parent) }
        if open {
            go(to: .page(id))
            focusTitle(id)
        }
        return id
    }

    /// Morrow's ensureToday: the day's note, made from the daily template when there is none, in the journal,
    /// which is made first when there is none. The note's id and, when it was made now, its document.
    func ensureToday(_ date: Date = Date()) async -> (id: String, doc: DocNode?)? {
        guard phase == .ready, let state = await host?.workspace()?.state else { return nil }
        let key = Daily.dateKey(date)
        if let existing = Daily.findDailyNote(state, key) { return (existing.id, nil) }
        let now = JSEnvironment.now()
        let journalId: String
        var siblings: [PageMeta] = []
        if let journal = Daily.findJournal(state) {
            journalId = journal.id
            siblings = Tree.childrenOf(state.pages, journal.id)
        } else {
            journalId = Self.newId()
            perform(.raw(["type": "page.create", "id": .string(journalId), "parentId": .null, "now": .number(now),
                          "title": .string(Daily.journalTitle), "kind": "journal"]))
        }
        let id = Self.newId()
        let title = Daily.dailyTitle(date)
        let template = Templates.dailyTemplate(state)
        let templateDoc = template.flatMap { state.docs[$0.id] }
        let doc = templateDoc.map { Templates.applyTemplate($0, Templates.Values(title: title, date: date)) }
        var command = JSObject([("type", "page.create"), ("id", .string(id)), ("parentId", .string(journalId)), ("now", .number(now)),
                                ("title", .string(title)), ("dailyDate", .string(key)),
                                ("index", .number(Double(Daily.dailyInsertIndex(siblings, key))))])
        if let template {
            command["tags"] = .array(template.tags.map(JSValue.string))
            command["icon"] = template.icon.map(JSValue.string) ?? .null
        }
        if let doc { command["doc"] = .object(doc) }
        perform(.raw(.object(command)))
        expanded.insert(journalId)
        return (id, doc ?? Model.emptyDoc())
    }

    /// Morrow's openToday, for the day a date key names or today.
    func openToday(_ date: String? = nil) {
        let day = date.flatMap(Daily.parseDateKey) ?? Date()
        Task {
            guard let today = await ensureToday(day) else { return }
            go(to: .page(today.id))
        }
    }

    /// Morrow's captureToToday: the text at the end of today's note, the time in bold before the first paragraph,
    /// a part starting [ ] or [x] as a task; parts are split at blank lines. Then the CaptureDialog's toast.
    func capture(_ text: String) {
        let clean = JSText.trim(text)
        guard !clean.isEmpty else { return }
        Task {
            guard let today = await ensureToday() else { return }
            var doc = today.doc
            if doc == nil { doc = await host?.workspace()?.state.docs[today.id] }
            let next = Self.captured(clean, into: doc ?? .node("doc", ("content", [])), time: Self.captureTime(Date()))
            perform(.setDoc(id: today.id, doc: next))
            showToast("Added to today's note.")
        }
    }

    /// `new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })`. WebKit's JavaScriptCore
    /// writes a plain space where ICU puts a narrow no-break space before AM and PM (checked with jsc: en-US
    /// "09:05 AM", ko-KR "오전 09:05").
    static func captureTime(_ date: Date, locale: Locale = JSEnvironment.locale) -> String {
        date.formatted(Date.FormatStyle(locale: locale).hour(.twoDigits(amPM: .abbreviated)).minute(.twoDigits))
            .replacingOccurrences(of: "\u{202F}", with: " ")
    }

    /// captureToToday's document: the existing blocks, an empty first paragraph left out, then the new ones
    static func captured(_ clean: String, into doc: DocNode, time: String) -> DocNode {
        let task = JSRegex(#"^\[( |x)\]\s*"#, ignoreCase: true)
        // clean.split(/\n{2,}/)
        let units = clean.units
        var parts: [[UInt16]] = []
        var last = 0
        for gap in JSRegex(#"\n{2,}"#).all(units) {
            parts.append(Array(units[last..<gap.range.lowerBound]))
            last = gap.range.upperBound
        }
        parts.append(Array(units[last...]))
        let blocks: [JSValue] = parts.enumerated().map { index, part in
            let match = task.exec(part)
            let body = match.map { Array(part[$0.range.upperBound...]) } ?? part
            var lines: [JSValue] = []
            for (i, line) in JSText.split(JSText.string(body), on: 0x0A).enumerated() {
                if i > 0 { lines.append(.object(.node("hardBreak"))) }
                if !line.isEmpty { lines.append(.object(JSObject([("type", "text"), ("text", .string(line))]))) }
            }
            let content: [JSValue] = index == 0 && match == nil
                ? [.object(JSObject([("type", "text"), ("text", .string("\(time) ")), ("marks", [.object(.node("bold"))])]))] + lines
                : lines
            guard let match else { return .object(.node("paragraph", ("content", .array(content)))) }
            let checked = match.group(1).map(JSText.string) != " "
            return .object(.node("taskList", ("content", [.object(.node("taskItem", ("attrs", ["checked": .bool(checked)]),
                                                                       ("content", [.object(.node("paragraph", ("content", .array(content))))])))])))
        }
        let existing = doc.content ?? []
        let kept = existing.count == 1 && existing[0].type == "paragraph" && (existing[0].content ?? []).isEmpty ? [] : existing
        return doc.with("content", .array(kept.map(JSValue.object) + blocks))
    }

    // MARK: templates

    /// Morrow's createTemplatesPage: the templates page, made when there is none, opened
    func openTemplates() {
        Task {
            guard let state = await host?.workspace()?.state else { return }
            if let existing = Templates.findTemplatesPage(state) {
                go(to: .page(existing.id))
                return
            }
            guard let id = makePage(parent: nil, kind: .templates, title: Templates.templatesTitle, open: false) else { return }
            expanded.insert(id)
            go(to: .page(id))
        }
    }

    /// as Morrow's template dialog does when there are no templates: a new template in the templates page, or the
    /// templates page itself when there is none
    func newTemplate() {
        Task {
            guard let state = await host?.workspace()?.state else { return }
            if let container = Templates.findTemplatesPage(state) {
                makePage(parent: container.id, title: "New template")
            } else {
                openTemplates()
            }
        }
    }

    /// Morrow's createFromTemplate: an untitled page that starts as a copy of the template, its {{title}} and
    /// {{date}} filled in, with the template's icon, tags and, for a database, its database
    func createPage(fromTemplate templateId: String, parent: String? = nil) {
        Task {
            guard let state = await host?.workspace()?.state, let template = state.pages[templateId] else { return }
            let id = Self.newId()
            let now = Date()
            let doc = Templates.applyTemplate(state.docs[templateId] ?? Model.emptyDoc(),
                                              Templates.Values(title: Model.displayTitle(nil), date: now))
            var command = JSObject([("type", "page.create"), ("id", .string(id)), ("parentId", parent.map(JSValue.string) ?? .null),
                                    ("now", .number((now.timeIntervalSince1970 * 1000).rounded(.down))), ("title", ""),
                                    ("icon", template.icon.map(JSValue.string) ?? .null), ("tags", .array(template.tags.map(JSValue.string))),
                                    ("doc", .object(doc))])
            if template.kind == .database, let database = template.database {
                command["kind"] = "database"
                command["database"] = database.json
            }
            perform(.raw(.object(command)))
            if let parent { expanded.insert(parent) }
            go(to: .page(id))
            focusTitle(id)
        }
    }

    /// Morrow's saveAsTemplate: a copy of the page in the templates page, made quietly when there is none, and
    /// a toast that opens it
    func saveAsTemplate(_ pageId: String) {
        Task {
            guard let state = await host?.workspace()?.state, let page = state.pages[pageId] else { return }
            guard let container = Templates.findTemplatesPage(state)?.id
                    ?? makePage(parent: nil, kind: .templates, title: Templates.templatesTitle, open: false) else { return }
            let copy = Self.newId()
            let title = Model.displayTitle(page)
            perform(.raw(["type": "page.create", "id": .string(copy), "parentId": .string(container), "now": .number(JSEnvironment.now()),
                          "title": .string(title), "icon": page.icon.map(JSValue.string) ?? .null,
                          "tags": .array(page.tags.map(JSValue.string)), "doc": .object(state.docs[pageId] ?? Model.emptyDoc())]))
            showToast("Saved “\(title)” as a template.", action: ("Open", { [weak self] in self?.go(to: .page(copy)) }))
        }
    }

    // MARK: the trash

    /// Morrow's trashPage: a page on screen, or under one, gives way to its parent or Home; the toast undoes it
    func trash(_ pageId: String) {
        guard let page = workspace.infos[pageId] else { return }
        let viewingAffected = selection.map { $0 == pageId || workspace.ancestors(of: $0).contains { $0.id == pageId } } ?? false
        perform(.raw(["type": "page.trash", "id": .string(pageId), "now": .number(JSEnvironment.now())]))
        if viewingAffected {
            if let parent = page.parentId, !workspace.isTrashed(parent) { go(to: .page(parent)) } else { go(to: .home) }
        }
        showToast("Moved “\(page.displayTitle)” to the trash", action: ("Undo", { [weak self] in
            self?.perform(.restore(id: pageId))
            if viewingAffected { self?.go(to: .page(pageId)) }
        }))
    }

    /// Morrow's restorePage, with its toast that opens the page
    func restorePage(_ pageId: String) {
        guard let page = workspace.infos[pageId] else { return }
        perform(.restore(id: pageId))
        showToast("Restored “\(page.displayTitle)”", action: ("Open", { [weak self] in self?.go(to: .page(pageId)) }))
    }
}
