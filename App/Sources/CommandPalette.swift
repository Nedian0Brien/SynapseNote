import SwiftUI

/// Search and commands, as Morrow's `CommandPalette.tsx`: recent pages and actions before anything is typed,
/// pages found by the search with a few actions after, and only actions once the query starts with `>`.
struct CommandPalette: View {
    @Bindable var controller: EditorController
    @State private var query = ""
    @State private var hits: [SearchHit] = []
    @State private var recent: [String] = []
    @State private var active = 0
    @FocusState private var focused: Bool

    private enum Entry: Identifiable {
        case page(PageInfo, group: String, detail: String, snippet: SearchHit.Snippet?, find: String?)
        case action(AppAction)

        var id: String {
            switch self {
            case .page(let page, _, _, _, _): "page:\(page.id)"
            case .action(let action): "action:\(action.id)"
            }
        }

        var group: String {
            switch self {
            case .page(_, let group, _, _, _): group
            case .action: "Actions"
            }
        }
    }

    /// Morrow's `foldText`: no accents, no case.
    static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
    }

    private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var actions: [Entry] {
        var actionQuery = trimmed
        if actionQuery.hasPrefix(">") { actionQuery.removeFirst() }
        let wanted = Self.fold(actionQuery.trimmingCharacters(in: .whitespaces))
        return AppAction.all
            .filter { $0.id != "search" && $0.isEnabled(controller) }
            .filter { wanted.isEmpty || Self.fold("\($0.label(controller)) \($0.keywords) \($0.group.rawValue)").contains(wanted) }
            .map(Entry.action)
    }

    private var entries: [Entry] {
        let workspace = controller.workspace
        if trimmed.hasPrefix(">") { return actions }
        if trimmed.isEmpty {
            let pages = recent.compactMap { workspace.infos[$0] }.map { page in
                Entry.page(page, group: "Recent", detail: path(page.id), snippet: nil, find: nil)
            }
            return pages + actions
        }
        let pages = hits.compactMap { hit -> Entry? in
            guard let page = workspace.infos[hit.id] else { return nil }
            return .page(page, group: "Pages", detail: hit.path.joined(separator: " / "),
                         snippet: hit.titleMatch ? nil : hit.snippet, find: hit.titleMatch ? nil : hit.firstMatch)
        }
        return pages + actions.prefix(5)
    }

    private func path(_ id: String) -> String {
        controller.workspace.ancestors(of: id).reversed().map(\.displayTitle).joined(separator: " / ")
    }

    var body: some View {
        let entries = entries
        ZStack(alignment: .top) {
            Color.black.opacity(0.25)
                .ignoresSafeArea()
                .onTapGesture { close() }
                .accessibilityHidden(true)
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Search pages, or type > for commands", text: $query)
                        .textFieldStyle(.plain)
                        .font(.title3)
                        .focused($focused)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        #endif
                        .onSubmit { choose(entries.indices.contains(active) ? entries[active] : nil) }
                        .onKeyPress(.downArrow) {
                            active = min(entries.count - 1, active + 1)
                            return .handled
                        }
                        .onKeyPress(.upArrow) {
                            active = max(0, active - 1)
                            return .handled
                        }
                        .onKeyPress(.escape) {
                            close()
                            return .handled
                        }
                }
                .padding(14)
                Divider()
                list(entries)
            }
            .background(.regularMaterial, in: .rect(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.separator))
            .shadow(radius: 24, y: 8)
            .frame(maxWidth: 640)
            .padding(.horizontal, 16)
            .padding(.top, 64)
            .accessibilityAddTraits(.isModal)
            .accessibilityLabel("Search and commands")
        }
        .onAppear { focused = true }
        .onChange(of: query) { active = 0 }
        .task(id: trimmed) {
            // a newer query cancels this one, so an answer that comes back late is not shown
            if trimmed.hasPrefix(">") { return }
            if trimmed.isEmpty {
                let ids = await controller.recentlyOpened(limit: 6)
                if !Task.isCancelled { recent = ids }
                return
            }
            let found = await controller.search(trimmed, limit: 30)
            if !Task.isCancelled { hits = found }
        }
    }

    private func list(_ entries: [Entry]) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    if entries.isEmpty {
                        Text(trimmed.isEmpty ? "Nothing here yet." : "No pages or actions match “\(trimmed)”.")
                            .foregroundStyle(.secondary)
                            .padding(14)
                    }
                    ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                        if index == 0 || entries[index - 1].group != entry.group {
                            Text(entry.group)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 14)
                                .padding(.top, 10)
                                .padding(.bottom, 2)
                        }
                        Button { choose(entry) } label: { row(entry, isActive: index == active) }
                            .buttonStyle(.plain)
                            .id(entry.id)
                            .onHover { if $0 { active = index } }
                    }
                }
                .padding(.vertical, 6)
            }
            .frame(maxHeight: 420)
            .fixedSize(horizontal: false, vertical: true)
            .onChange(of: active) {
                if entries.indices.contains(active) { proxy.scrollTo(entries[active].id) }
            }
        }
    }

    private func row(_ entry: Entry, isActive: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            switch entry {
            case .page(let page, _, let detail, let snippet, _):
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        PageLabel(page: page)
                        if !detail.isEmpty {
                            Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    if let snippet {
                        Text("\(snippet.before)\(Text(snippet.match).bold().foregroundStyle(.primary))\(snippet.after)")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 0)
            case .action(let action):
                Label(action.label(controller), systemImage: action.symbol)
                Spacer(minLength: 0)
                if let shortcut = action.shortcut {
                    Text(shortcut.label).font(.callout).foregroundStyle(.secondary).monospaced()
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(isActive ? Color.accentColor.opacity(0.18) : .clear, in: .rect(cornerRadius: 8))
        .padding(.horizontal, 6)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    private func choose(_ entry: Entry?) {
        guard let entry else { return }
        close()
        switch entry {
        case .page(let page, _, _, _, let find):
            controller.go(to: .page(page.id), find: find)
        case .action(let action):
            action.perform(controller)
        }
    }

    private func close() {
        controller.showingPalette = false
    }
}
