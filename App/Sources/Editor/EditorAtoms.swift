import SwiftUI

/// How Morrow's editor shows the inline nodes it does not edit as text (PageLink.ts, Structure.ts) and the #tags
/// in text (Extras.ts `Tags`): a page link as the page's icon and title, a date as "@" and how the day reads, each
/// drawn as a text attachment in the block's text view.
enum EditorAtoms {
    /// what an atom shows and how
    struct Chip: Hashable {
        enum Look: Hashable {
            /// a page that exists: accent text on a soft accent background
            case page
            /// a link to a page in the trash or deleted, struck through
            case missing
            /// a written target with no page yet
            case unresolved
            case date
            case pastDate
            case today
        }

        var text: String
        var icon: String?
        var look: Look
        /// an embed link: `↳ ` before the icon and title (`.page-link.is-embed::before`)
        var embed = false
    }

    /// the workspace as the chips need it
    struct Lookup {
        /// the live title and icon of a page that is not in the trash
        var page: (String) -> (title: String, icon: String?)?
        /// the page a written target means, as Morrow's resolveLinkTarget finds it
        var resolve: (String) -> String?
        var today: String
    }

    /// PageLink's node view: the page's title, or the label, or the target, with the heading after "›" and an
    /// alias in place of all of it; Structure's date mention: "@" and describeDate
    /// `embed`: an embed link drawn with its page under it gets `↳ ` in front (`.page-link.is-embed::before`)
    static func chip(_ node: DocNode, _ lookup: Lookup, embed: Bool = false) -> Chip? {
        switch node.type {
        case "pageLink":
            let id = resolved(node, lookup)
            let page = id.flatMap(lookup.page)
            let target = node.attr("target")?.string ?? ""
            let label = node.attr("label")?.string ?? ""
            let name = page?.title ?? (!label.isEmpty ? label : !target.isEmpty ? target : "Missing page")
            let anchor = node.attr("anchor")?.string
            let text = node.attr("alias")?.string ?? (anchor.map { "\(name) › \($0)" } ?? name)
            let look: Chip.Look = id != nil ? .page : !target.isEmpty ? .unresolved : .missing
            return Chip(text: text, icon: page?.icon, look: look, embed: embed)
        case "dateMention":
            let key = node.attr("date")?.string ?? ""
            let look: Chip.Look = key == lookup.today ? .today : key < lookup.today && Daily.parseDateKey(key) != nil ? .pastDate : .date
            return Chip(text: "@\(DateMentions.describe(key))", icon: nil, look: look)
        default:
            return nil
        }
    }

    /// the page a link opens: its id while that page is there, otherwise what its target finds
    static func resolved(_ node: DocNode, _ lookup: Lookup) -> String? {
        if let id = node.attr("id")?.string, lookup.page(id) != nil { return id }
        guard let target = node.attr("target")?.string, !target.isEmpty else { return nil }
        return lookup.resolve(target)
    }

    // MARK: drawing

    @MainActor private static var cache: [String: PlatformImageBox] = [:]

    /// the chip drawn as a picture at the text's size, kept for reuse
    @MainActor static func image(_ chip: Chip, font: PlatformFont, dark: Bool) -> (image: PlatformImage, baseline: CGFloat)? {
        let key = "\(chip.hashValue)|\(font.pointSize)|\(font.fontName)|\(dark)"
        if let cached = cache[key] { return (cached.image, cached.baseline) }
        let view = ChipView(chip: chip, font: Font(font), size: font.pointSize)
            .environment(\.colorScheme, dark ? .dark : .light)
        let renderer = ImageRenderer(content: view)
        #if os(iOS)
        renderer.scale = UIScreen.main.scale
        guard let image = renderer.uiImage else { return nil }
        #else
        renderer.scale = NSScreen.main?.backingScaleFactor ?? 2
        guard let image = renderer.nsImage else { return nil }
        #endif
        let baseline = font.descender - 2
        cache[key] = PlatformImageBox(image: image, baseline: baseline)
        return (image, baseline)
    }

    /// a text attachment showing the chip on the text's baseline
    @MainActor static func attachment(_ chip: Chip, font: PlatformFont, dark: Bool) -> NSTextAttachment? {
        guard let (image, baseline) = image(chip, font: font, dark: dark) else { return nil }
        let attachment = NSTextAttachment()
        attachment.image = image
        attachment.bounds = CGRect(x: 0, y: baseline, width: image.size.width, height: image.size.height)
        return attachment
    }

    /// an attachment that takes no room, for a link whose live embed shows in its place (`.is-live > .page-link`)
    @MainActor static let nothing: NSTextAttachment = {
        let attachment = NSTextAttachment()
        #if os(iOS)
        attachment.image = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { _ in }
        #else
        attachment.image = NSImage(size: NSSize(width: 1, height: 1))
        #endif
        attachment.bounds = .zero
        return attachment
    }()

    // MARK: formulas

    /// an inline formula as KaTeX draws it, on the text's baseline; while it is drawn, and when KaTeX could not
    /// take it, its LaTeX as tiptap's `inline-math-error` shows it (the danger colour, monospaced, 0.85em)
    @MainActor static func formula(_ latex: String, font: PlatformFont, dark: Bool) -> NSTextAttachment? {
        let key = WebRenderer.Key(kind: .math(display: false), source: latex, size: font.pointSize, dark: dark)
        let attachment = NSTextAttachment()
        switch WebRenderer.shared.result(key) {
        case .image(let image, let descent):
            attachment.image = image
            attachment.bounds = CGRect(x: 0, y: -descent, width: image.size.width, height: image.size.height)
            return attachment
        case .failed(let text):
            return written(text.isEmpty ? latex : text, font: font, dark: dark, color: EditorStyle.highlight(.deletion), into: attachment)
        case nil:
            return written(latex, font: font, dark: dark, color: EditorStyle.faint, into: attachment)
        }
    }

    @MainActor private static func written(_ text: String, font: PlatformFont, dark: Bool, color: PlatformColor, into attachment: NSTextAttachment) -> NSTextAttachment? {
        let view = Text(text.isEmpty ? " " : text)
            .font(.system(size: font.pointSize * 0.85, design: .monospaced))
            .foregroundStyle(Color(color))
            .fixedSize()
            .environment(\.colorScheme, dark ? .dark : .light)
        let renderer = ImageRenderer(content: view)
        #if os(iOS)
        renderer.scale = UIScreen.main.scale
        guard let image = renderer.uiImage else { return nil }
        #else
        renderer.scale = NSScreen.main?.backingScaleFactor ?? 2
        guard let image = renderer.nsImage else { return nil }
        #endif
        attachment.image = image
        attachment.bounds = CGRect(x: 0, y: font.descender, width: image.size.width, height: image.size.height)
        return attachment
    }

    // MARK: tags

    /// Morrow's TAG_PATTERN: a # after the start, a space or "(", then letters, digits, _, - and /, with at least
    /// one that is not a digit
    static let tagPattern = try! NSRegularExpression(pattern: "(^|[\\s(])#([\\p{L}\\p{N}_\\-/]*[\\p{L}_\\-/][\\p{L}\\p{N}_\\-/]*)")

    /// the #tags in a block's text, outside code and links: the range of "#name" and the name
    static func tags(in text: NSAttributedString) -> [(range: NSRange, name: String)] {
        let string = text.string as NSString
        var out: [(NSRange, String)] = []
        for match in tagPattern.matches(in: text.string, range: NSRange(location: 0, length: string.length)) {
            let name = match.range(at: 2)
            let range = NSRange(location: name.location - 1, length: name.length + 1)
            var excluded = false
            text.enumerateAttribute(.editorMarks, in: range) { value, _, stop in
                if let marks = value as? EditorMarkSet, marks.has("code") || marks.has("link") {
                    excluded = true
                    stop.pointee = true
                }
            }
            if !excluded { out.append((range, string.substring(with: name))) }
        }
        return out
    }
}

private final class PlatformImageBox {
    let image: PlatformImage
    let baseline: CGFloat
    init(image: PlatformImage, baseline: CGFloat) {
        self.image = image
        self.baseline = baseline
    }
}

/// Morrow's `.page-link` and `.date-mention` as a SwiftUI view, drawn into the attachment's picture
private struct ChipView: View {
    let chip: EditorAtoms.Chip
    let font: Font
    let size: CGFloat

    var body: some View {
        HStack(spacing: size * 0.2) {
            if chip.embed { Text("↳").font(font.weight(.medium)).foregroundStyle(foreground).opacity(0.6) }
            if let icon = chip.icon { EmojiImage(emoji: icon, size: size * 0.95) }
            Text(chip.text)
                .font(font.weight(.medium))
                .strikethrough(chip.look == .missing)
                .foregroundStyle(foreground)
        }
        .padding(.horizontal, size * 0.22)
        .padding(.vertical, 1)
        .background(background, in: .rect(cornerRadius: 3))
        .fixedSize()
    }

    private var foreground: Color {
        switch chip.look {
        case .missing: Color.secondary.opacity(0.7)
        case .unresolved, .pastDate: .secondary
        default: .accentColor
        }
    }

    private var background: Color {
        switch chip.look {
        case .page, .today: Color.accentColor.opacity(0.14)
        case .missing, .unresolved: Color.secondary.opacity(0.12)
        case .date, .pastDate: .clear
        }
    }
}
