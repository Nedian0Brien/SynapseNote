import SwiftUI

/// Beside the open page: its headings, the pages that link to it and the pages that name it without a link,
/// what Morrow's `PageView` shows around and under the page.
struct PageInspector: View {
    let controller: EditorController
    let pageId: String
    @State private var headings: [Heading] = []
    @State private var links: [Backlink] = []
    @State private var mentions: [Mention]?
    @State private var findingMentions = false

    private var title: String { controller.workspace.infos[pageId]?.displayTitle ?? "Untitled" }

    var body: some View {
        List {
            Section("On This Page") {
                if headings.isEmpty {
                    Text("Headings in the page appear here.").foregroundStyle(.secondary)
                }
                ForEach(headings) { heading in
                    Button(heading.text) { controller.scrollToHeading(heading.index) }
                        .buttonStyle(.plain)
                        .padding(.leading, CGFloat(heading.level - 1) * 12)
                        .lineLimit(2)
                }
            }
            Section(links.isEmpty ? "Linked From" : "Linked from \(links.count) page\(links.count == 1 ? "" : "s")") {
                if links.isEmpty {
                    Text("No other page links here.").foregroundStyle(.secondary)
                }
                ForEach(links) { link in
                    if let page = controller.workspace.infos[link.id] {
                        LinkRow(page: page, context: link.context) { controller.go(to: .page(page.id)) }
                    }
                }
            }
            Section("Unlinked Mentions") {
                if findingMentions {
                    if let mentions {
                        if mentions.isEmpty {
                            Text("No other page mentions it.").foregroundStyle(.secondary)
                        }
                        ForEach(mentions) { mention in
                            if let page = controller.workspace.infos[mention.id] {
                                LinkRow(page: page, context: mention.context) { controller.go(to: .page(page.id), find: title) }
                            }
                        }
                    } else {
                        ProgressView()
                    }
                    Button("Hide") { findingMentions = false }
                } else {
                    Button("Find pages that mention “\(title)” without linking") { findingMentions = true }
                }
            }
        }
        #if os(macOS)
        .listStyle(.sidebar)
        #endif
        // looked up again whenever the workspace changes, after a short pause; mentions read every page, so
        // only while they are asked for
        .task(id: Lookup(pageId: pageId, revision: controller.revision, mentions: findingMentions)) {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let nextHeadings = await controller.outline(of: pageId)
            let nextLinks = await controller.backlinks(of: pageId)
            let nextMentions = findingMentions ? await controller.mentions(of: pageId) : nil
            guard !Task.isCancelled else { return }
            headings = nextHeadings
            links = nextLinks
            mentions = nextMentions
        }
        .onChange(of: pageId) {
            findingMentions = false
            mentions = nil
        }
    }

    private struct Lookup: Equatable {
        let pageId: String
        let revision: Int
        let mentions: Bool
    }
}

private struct LinkRow: View {
    let page: PageInfo
    let context: String?
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 2) {
                PageLabel(page: page).font(.body.weight(.medium))
                if let context, !context.isEmpty {
                    Text(context).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}
