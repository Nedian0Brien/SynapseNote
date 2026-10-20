import SwiftUI
import UniformTypeIdentifiers

/// The top of a page as Morrow's PageView draws it: icon, the add icon and add cover buttons, title and tags.
/// The cover is drawn above the page column, see `CoverBanner`.
struct PageHeaderView: View {
    let controller: EditorController
    let page: PageInfo
    let editable: Bool
    /// a database page has no tags field, as in Morrow's PageView
    var showsTags = true
    /// return or arrow down at the end of the title, to move into the page below it
    var onEnter: () -> Void = {}
    @State private var choosingCover = false

    /// Morrow's `.page-title` in the writing font chosen in the settings.
    static func titleFont(_ font: AppPreferences.Font) -> SwiftUI.Font {
        switch font {
        case .serif: .system(size: 40, weight: .bold, design: .serif)
        case .sans: .system(size: 40, weight: .semibold)
        case .mono: .system(size: 32, weight: .semibold, design: .monospaced)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let icon = page.icon {
                Button { controller.iconPage = page.id } label: {
                    EmojiImage(emoji: icon, size: 68)
                        .frame(width: 80, height: 80)
                        .shadow(color: page.cover != nil ? .black.opacity(0.18) : .clear, radius: 3, y: 2)
                }
                .buttonStyle(.plain)
                .disabled(!editable)
                .accessibilityLabel("Change icon")
                .padding(.leading, -8)
                // over the lower edge of the cover, as Morrow's has-cover page
                .padding(.top, page.cover != nil ? -40 : 0)
            }
            if editable, page.icon == nil || page.cover == nil {
                HStack(spacing: 4) {
                    if page.icon == nil {
                        Button("Add icon", systemImage: "face.smiling") { controller.iconPage = page.id }
                    }
                    if page.cover == nil {
                        Button("Add cover", systemImage: "photo") { choosingCover = true }
                            .popover(isPresented: $choosingCover) {
                                CoverPicker(controller: controller, page: page) { choosingCover = false }
                            }
                    }
                }
                .buttonStyle(.borderless)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.top, 8)
            }
            PageTitleField(controller: controller, page: page, editable: editable, onEnter: onEnter)
            if showsTags { PageTagsView(controller: controller, page: page, editable: editable) }
            // a database row's values (Morrow's findDatabaseOf: a page whose parent is a database)
            if let parent = page.parentId, controller.workspace.infos[parent]?.kind == "database" {
                RowPropertiesView(controller: controller, rowId: page.id, dbId: parent, editable: editable)
                    .padding(.bottom, 8)
            }
        }
    }
}

/// The page title, renamed as it is typed like Morrow's TitleField. The field keeps its own text while it has
/// focus: the new title comes back from the page a moment later, and setting the field to it then would break
/// a Korean syllable being composed. Every change typed here is sent, and the text is sent once more when the
/// field loses focus if the page has not caught up with it, so the last letter is never lost.
struct PageTitleField: View {
    let controller: EditorController
    let page: PageInfo
    let editable: Bool
    let onEnter: () -> Void
    @State private var draft = ""
    /// set while the field takes the page's title, so that change is not sent back
    @State private var syncing = false
    @FocusState private var focused: Bool

    var body: some View {
        if editable { field } else {
            Text(page.title.isEmpty ? "Untitled" : page.title)
                .font(PageHeaderView.titleFont(controller.preferences.font))
                .foregroundStyle(page.title.isEmpty ? .tertiary : .primary)
                .textSelection(.enabled)
                .accessibilityAddTraits(.isHeader)
                .padding(.top, 24)
                .padding(.bottom, 18)
        }
    }

    private var field: some View {
        TextField("Untitled", text: $draft, axis: .vertical)
            .font(PageHeaderView.titleFont(controller.preferences.font))
            .textFieldStyle(.plain)
            .focused($focused)
            .accessibilityLabel("Page title")
            .padding(.top, 24)
            .padding(.bottom, 18)
            .onAppear { take(page.title) }
            // the editor's arrow up at its first line
            .onChange(of: controller.titleFocus?.id) {
                if controller.titleFocus?.pageId == page.id { focused = true }
            }
            .onChange(of: page.title) { _, title in
                if !focused { take(title) }
            }
            .onChange(of: focused) { _, isFocused in
                if !isFocused, !draft.utf16.elementsEqual(page.title.utf16) { rename(draft) }
            }
            .onChange(of: draft) { _, value in
                if syncing {
                    syncing = false
                    return
                }
                // a title is one line: return moves into the page, as in Morrow
                if value.contains(where: \.isNewline) {
                    draft = value.filter { !$0.isNewline }
                    onEnter()
                    return
                }
                if !value.utf16.elementsEqual(page.title.utf16) { rename(value) }
            }
    }

    private func take(_ title: String) {
        guard !draft.utf16.elementsEqual(title.utf16) else { return }
        syncing = true
        draft = title
    }

    private func rename(_ title: String) {
        controller.perform(.rename(id: page.id, title: title))
    }
}

/// The tags property of a page under its title, as Morrow's PageTags.
struct PageTagsView: View {
    let controller: EditorController
    let page: PageInfo
    let editable: Bool
    @State private var adding = false
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        if !page.tags.isEmpty || editable {
            FlowLayout(spacing: 6) {
                ForEach(page.tags, id: \.self) { tag in
                    PageTagChip(tag: tag, colorful: controller.preferences.colorful,
                                open: { controller.go(to: .tag(tag)) },
                                remove: editable ? { save(page.tags.filter { $0 != tag }) } : nil)
                }
                if editable {
                    if adding {
                        TextField("tag", text: $draft)
                            .textFieldStyle(.plain)
                            .font(.subheadline)
                            .frame(width: 120)
                            .focused($focused)
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            #endif
                            .accessibilityLabel("New tag")
                            .onSubmit { add() }
                            .onChange(of: draft) { _, value in
                                // a comma finishes a tag, as in Morrow
                                if value.contains(",") { add() }
                            }
                            .onChange(of: focused) { _, isFocused in
                                if !isFocused {
                                    add()
                                    adding = false
                                }
                            }
                            .onKeyPress(.escape) {
                                draft = ""
                                adding = false
                                return .handled
                            }
                            // backspace in the empty field takes the last tag off, as in Morrow
                            .onKeyPress(.delete) {
                                guard draft.isEmpty, !page.tags.isEmpty else { return .ignored }
                                save(Array(page.tags.dropLast()))
                                return .handled
                            }
                            .onAppear { focused = true }
                    } else {
                        Button(page.tags.isEmpty ? "Add tag" : "Tag", systemImage: "plus") { adding = true }
                            .buttonStyle(.borderless)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.top, -6)
            .padding(.bottom, 18)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Tags")
        }
    }

    private func save(_ tags: [String]) {
        controller.perform(.setTags(id: page.id, tags: tags))
    }

    /// Morrow's add: the text split at commas and spaces, each part made a tag
    private func add() {
        let tags = draft.split(whereSeparator: { $0 == "," || $0.isWhitespace }).compactMap { Frontmatter.normalizeTag(String($0)) }
        if !tags.isEmpty { save(page.tags + tags) }
        draft = ""
    }
}

/// A tag under a page title: the accent colour, or Morrow's colour for the tag when colourful tags are on.
struct PageTagChip: View {
    let tag: String
    let colorful: Bool
    let open: () -> Void
    let remove: (() -> Void)?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let color = Tags.tagColor(tag)
        HStack(spacing: 2) {
            Button("#\(tag)", action: open)
                .buttonStyle(.plain)
            if let remove {
                Button("Remove tag \(tag)", systemImage: "xmark", action: remove)
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .font(.caption2.weight(.semibold))
                    .padding(3)
            }
        }
        .font(.subheadline)
        .padding(.leading, 8)
        .padding(.trailing, remove == nil ? 8 : 4)
        .padding(.vertical, 1)
        .foregroundStyle(colorful ? AnyShapeStyle(color == "yellow" ? Color(hex: 0x2b2100) : .white) : AnyShapeStyle(.tint))
        .background(colorful ? AnyShapeStyle(TagColor.solid(color, dark: colorScheme == .dark)) : AnyShapeStyle(.tint.opacity(0.14)), in: .capsule)
    }
}

/// Morrow's CoverBanner: the gradient or picture across the top of the page, with Change cover.
struct CoverBanner: View {
    let controller: EditorController
    let page: PageInfo
    let editable: Bool
    @State private var image: Image?
    @State private var choosing = false

    var body: some View {
        if let cover = page.cover {
            ZStack(alignment: .bottomTrailing) {
                if let number = CoverGradient.number(ofCover: cover) {
                    Rectangle().fill(CoverGradient.gradient(number))
                } else if let image {
                    Color.clear.overlay { image.resizable().scaledToFill() }.clipped()
                } else {
                    Rectangle().fill(.quaternary)
                }
                if editable {
                    Button("Change cover") { choosing = true }
                        .buttonStyle(.bordered)
                        .tint(.primary)
                        .controlSize(.small)
                        .padding(.trailing, 24)
                        .padding(.bottom, 12)
                        .popover(isPresented: $choosing) {
                            CoverPicker(controller: controller, page: page) { choosing = false }
                        }
                }
            }
            .frame(maxWidth: .infinity)
            // clamp(160px, 28vh, 260px)
            .containerRelativeFrame(.vertical) { height, _ in min(max(height * 0.28, 160), 260) }
            .task(id: cover) {
                image = nil
                guard CoverGradient.number(ofCover: cover) == nil, let data = await controller.vaultFile(cover) else { return }
                image = await Task.detached { CoverPicture.decode(data, maxPixels: 2400) }.value
            }
        }
    }
}

/// Morrow's CoverPicker: twelve gradients, a picture from the device, or no cover.
struct CoverPicker: View {
    let controller: EditorController
    let page: PageInfo
    let done: () -> Void
    @State private var pickingImage = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                ForEach(1...CoverGradient.colors.count, id: \.self) { number in
                    let cover = "gradient-\(number)"
                    Button { pick(cover) } label: {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(CoverGradient.gradient(number))
                            .frame(height: 44)
                            .overlay {
                                if page.cover == cover { RoundedRectangle(cornerRadius: 6).strokeBorder(.tint, lineWidth: 2) }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Gradient \(number)")
                    .accessibilityAddTraits(page.cover == cover ? .isSelected : [])
                }
            }
            HStack {
                Button("Use an image", systemImage: "photo") { pickingImage = true }
                if page.cover != nil {
                    Button("Remove", systemImage: "trash", role: .destructive) { pick(nil) }
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(16)
        .frame(width: 320)
        .fileImporter(isPresented: $pickingImage, allowedContentTypes: [.image]) { result in
            guard case .success(let url) = result else { return }
            Task {
                if let id = await controller.storeImage(url) { pick(id) }
            }
        }
    }

    private func pick(_ cover: String?) {
        controller.perform(.setCover(id: page.id, cover: cover))
        done()
    }
}
