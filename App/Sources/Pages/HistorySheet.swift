import SwiftUI

/// Morrow's HistoryDialog: the page's versions, what changed since one of them (core diff over the Markdown) or
/// that version as the editor draws it, and Restore this version.
struct HistorySheet: View {
    let controller: EditorController
    let page: PageInfo
    @State private var versions: [Snapshot]?
    @State private var selected = 0
    @State private var mode = Mode.changes
    @State private var current: DocNode?
    @Environment(\.dismiss) private var dismiss

    enum Mode: String, CaseIterable, Identifiable {
        case changes, version
        var id: String { rawValue }
        var label: String { self == .changes ? "Changes since then" : "That version" }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let versions {
                    if versions.isEmpty {
                        ContentUnavailableView("No versions yet", systemImage: "clock.arrow.circlepath",
                                               description: Text("SynapseNote keeps a version of a page every ten minutes while you edit it."))
                    } else {
                        layout(versions)
                    }
                } else {
                    ProgressView("Loading versions…").frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("History of “\(page.displayTitle)”")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
        .frame(minWidth: 640, minHeight: 480)
        .task {
            versions = await controller.versions(page.id)
            current = await controller.editorDoc(page.id)
        }
    }

    @ViewBuilder private func layout(_ versions: [Snapshot]) -> some View {
        HStack(alignment: .top, spacing: 0) {
            List(Array(versions.enumerated()), id: \.element.id, selection: Binding(get: { selected }, set: { selected = $0 ?? selected })) { index, version in
                VStack(alignment: .leading, spacing: 2) {
                    Text(Date(timeIntervalSince1970: version.createdAt / 1000).formatted(date: .abbreviated, time: .shortened))
                    Text("\(HistoryText.relative(version.createdAt)) · \(HistoryText.words(version.doc).formatted()) words")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .tag(index)
            }
            .listStyle(.plain)
            .frame(width: 240)
            Divider()
            VStack(alignment: .leading, spacing: 12) {
                Picker("Show", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                let version = versions[min(selected, versions.count - 1)]
                ScrollView {
                    if mode == .changes {
                        DiffRows(rows: HistoryText.rows(Diff.diffLines(MarkdownSerialize.docToMarkdown(version.doc),
                                                                       MarkdownSerialize.docToMarkdown(current ?? Model.emptyDoc()))))
                    } else {
                        VersionPreview(controller: controller, version: version)
                    }
                }
                HStack {
                    Spacer()
                    Button("Restore this version") {
                        controller.restoreVersion(version)
                        dismiss()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(16)
        }
    }
}

/// a version drawn by the editor, read only
private struct VersionPreview: View {
    let controller: EditorController
    let version: Snapshot

    var body: some View {
        let store = EditorStore(controller: controller, pageId: version.pageId, version: version.doc)
        if store.failed {
            Text("This version cannot be shown.").foregroundStyle(.secondary)
        } else {
            BlockList(store: store, nodes: store.doc.content ?? [], path: [], context: .init(), depth: 0)
                .id(version.id)
        }
    }
}

/// Morrow's DiffView: removed lines in red, added in green, long unchanged stretches folded
private struct DiffRows: View {
    let rows: [HistoryText.Row]

    var body: some View {
        if rows.allSatisfy({ if case .line(let line) = $0 { line.kind == .same } else { false } }) {
            Text("This version is the same as the page now.").foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    switch row {
                    case .gap(let count):
                        Text("\(count) unchanged line\(count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 4)
                    case .line(let line):
                        HStack(alignment: .top, spacing: 6) {
                            Text(line.kind == .added ? "+" : line.kind == .removed ? "−" : " ")
                                .accessibilityHidden(true)
                            Text(line.text.isEmpty ? " " : line.text)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .font(.system(size: 13, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(line.kind == .added ? Color.green.opacity(0.15) : line.kind == .removed ? Color.red.opacity(0.15) : .clear)
                        .accessibilityLabel(line.kind == .added ? "Added: \(line.text)" : line.kind == .removed ? "Removed: \(line.text)" : line.text)
                    }
                }
            }
        }
    }
}

/// what the history dialog writes: Morrow's DiffView rows, word counts and relativeTime
enum HistoryText {
    enum Row: Equatable {
        case line(Diff.Line)
        case gap(Int)
    }

    /// DiffView: an unchanged run longer than six lines folds to a gap, keeping two lines next to each change
    /// (none before the first row, none after the end)
    static func rows(_ lines: [Diff.Line]) -> [Row] {
        var rows: [Row] = []
        var run: [Diff.Line] = []
        func flush(_ end: Bool) {
            if run.count > 6 {
                let before = !rows.isEmpty
                if before { rows += run.prefix(2).map(Row.line) }
                rows.append(.gap(run.count - (before ? 2 : 0) - (end ? 0 : 2)))
                if !end { rows += run.suffix(2).map(Row.line) }
            } else {
                rows += run.map(Row.line)
            }
            run = []
        }
        for line in lines {
            if line.kind == .same {
                run.append(line)
            } else {
                flush(false)
                rows.append(.line(line))
            }
        }
        flush(true)
        return rows
    }

    /// `docToPlainText(doc).split(/\s+/).filter(Boolean).length`
    static func words(_ doc: DocNode) -> Int {
        JSRegex(#"\S+"#).all(Doc.docToPlainText(doc).units).count
    }

    /// Morrow's relativeTime: just now under 45 seconds, then minutes, hours and days, then the date
    static func relative(_ milliseconds: Double, now: Date = Date()) -> String {
        let seconds = ((milliseconds - now.timeIntervalSince1970 * 1000) / 1000).rounded()
        let abs = Swift.abs(seconds)
        if abs < 45 { return "just now" }
        let formatter = RelativeDateTimeFormatter()
        formatter.dateTimeStyle = .named
        if abs < 3600 { return formatter.localizedString(from: DateComponents(minute: Int((seconds / 60).rounded()))) }
        if abs < 86400 { return formatter.localizedString(from: DateComponents(hour: Int((seconds / 3600).rounded()))) }
        if abs < 86400 * 7 { return formatter.localizedString(from: DateComponents(day: Int((seconds / 86400).rounded()))) }
        let date = Date(timeIntervalSince1970: milliseconds / 1000)
        return abs > 86400 * 300
            ? date.formatted(.dateTime.day().month(.abbreviated).year())
            : date.formatted(.dateTime.day().month(.abbreviated))
    }
}
