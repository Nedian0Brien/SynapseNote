import SwiftUI

/// Every checklist item from the vault's pages, as Morrow's `TasksView`: open, done or all, grouped by page.
struct TasksView: View {
    let controller: EditorController
    @State private var all: [TaskRef] = []
    @State private var loaded = false
    @State private var filter = Filter.open

    enum Filter: Hashable {
        case open, done, all
    }

    var body: some View {
        let open = all.filter { !$0.checked }.count
        let shown = all.filter { filter == .all || (filter == .open) != $0.checked }
        CollectionScreen(title: "Tasks", detail: "Every checklist item from your pages, in one place. Ticking one here updates its page.") {
            Picker("Show", selection: $filter) {
                Text("Open (\(open))").tag(Filter.open)
                Text("Done (\(all.count - open))").tag(Filter.done)
                Text("All (\(all.count))").tag(Filter.all)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(maxWidth: 360)
        } content: {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity)
            } else if shown.isEmpty {
                ContentUnavailableView {
                    Label(all.isEmpty ? "No tasks yet" : filter == .open ? "Nothing left to do" : "Nothing here", systemImage: "checklist")
                } description: {
                    if all.isEmpty {
                        Text("Type [ ] at the start of a line, or choose Checklist from the / menu, to add one to any page.")
                    }
                }
            } else {
                LazyVStack(alignment: .leading, spacing: 20) {
                    ForEach(groups(shown), id: \.pageId) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            if let page = controller.workspace.infos[group.pageId] {
                                Button { controller.go(to: .page(page.id)) } label: {
                                    PageLabel(page: page).font(.headline)
                                }
                                .buttonStyle(.plain)
                            }
                            ForEach(group.tasks) { task in
                                TaskRow(controller: controller, task: task)
                            }
                        }
                    }
                }
            }
        }
        // asked again after a short pause whenever the workspace changes
        .task(id: controller.revision) {
            if loaded { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled else { return }
            let next = await controller.tasks()
            guard !Task.isCancelled else { return }
            all = next
            loaded = true
        }
    }

    private struct Group {
        let pageId: String
        let tasks: [TaskRef]
    }

    /// In the order the pages first appear, as Morrow's grouped `TaskList`.
    private func groups(_ tasks: [TaskRef]) -> [Group] {
        var order: [String] = []
        var byPage: [String: [TaskRef]] = [:]
        for task in tasks {
            if byPage[task.pageId] == nil { order.append(task.pageId) }
            byPage[task.pageId, default: []].append(task)
        }
        return order.map { Group(pageId: $0, tasks: byPage[$0]!) }
    }
}

/// A checklist item: the box changes the page, the words open it at the item.
struct TaskRow: View {
    let controller: EditorController
    let task: TaskRef
    var showsPage = false

    var body: some View {
        HStack(spacing: 10) {
            Button {
                controller.perform(.setTaskChecked(pageId: task.pageId, index: task.index, checked: !task.checked))
            } label: {
                Image(systemName: task.checked ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(task.checked ? Color.accentColor : .secondary)
                    .font(.title3)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(task.text.isEmpty ? "Untitled task" : task.text)
            .accessibilityValue(task.checked ? "Done" : "Not done")
            Button {
                controller.go(to: .page(task.pageId), find: task.text.isEmpty ? nil : task.text)
            } label: {
                Text(task.text.isEmpty ? "Untitled task" : task.text)
                    .strikethrough(task.checked)
                    .foregroundStyle(task.text.isEmpty || task.checked ? .secondary : .primary)
                    .multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
            Spacer(minLength: 8)
            if showsPage, let page = controller.workspace.infos[task.pageId] {
                Text(page.displayTitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }
}

/// A full-column screen over the editor with a heading, a line about it and its content, as Morrow's
/// collection views. A plain view: a navigation stack over the editor rebuilds its web view.
struct CollectionScreen<Accessory: View, Content: View>: View {
    let title: String
    let detail: String?
    @ViewBuilder let accessory: () -> Accessory
    @ViewBuilder let content: () -> Content

    init(title: String, detail: String? = nil, @ViewBuilder accessory: @escaping () -> Accessory = { EmptyView() }, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.detail = detail
        self.accessory = accessory
        self.content = content
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title).font(.largeTitle.weight(.semibold))
                    if let detail { Text(detail).foregroundStyle(.secondary) }
                    accessory()
                }
                content()
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
            .frame(maxWidth: 880, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }
}
