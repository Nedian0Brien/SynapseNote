import SwiftUI
#if os(macOS)
import AppKit
typealias PlatformImage = NSImage
#else
import UIKit
typealias PlatformImage = UIImage
#endif

/// The emoji the icon picker offers and the Fluent images pages are drawn with, the same set Morrow uses.
@MainActor
final class EmojiCatalog {
    static let shared = EmojiCatalog(folder: Bundle.main.resourceURL!.appending(path: "Emoji"))

    struct Entry: Identifiable, Hashable, Decodable {
        let emoji: String
        let label: String
        let group: Int
        let tags: [String]
        var id: String { emoji }

        private enum Keys: String, CodingKey { case e, l, g, t }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: Keys.self)
            emoji = try container.decode(String.self, forKey: .e)
            label = try container.decode(String.self, forKey: .l)
            group = try container.decode(Int.self, forKey: .g)
            tags = try container.decodeIfPresent([String].self, forKey: .t) ?? []
        }
    }

    /// The tabs of Morrow's EmojiPicker.
    static let groups: [(id: Int, label: String, icon: String)] = [
        (0, "Smileys", "😀"), (1, "People", "👋"), (3, "Nature", "🌿"), (4, "Food", "🍎"), (5, "Travel", "✈️"),
        (6, "Activities", "⚽"), (7, "Objects", "💡"), (8, "Symbols", "❤️"), (9, "Flags", "🏳️"),
    ]

    private let imageFolder: URL
    private let files: Set<String>
    private var images: [String: PlatformImage] = [:]
    /// Emoji with a Fluent image, in emojibase order.
    let entries: [Entry]

    init(folder: URL) {
        imageFolder = folder.appending(path: "emoji")
        let names = (try? FileManager.default.contentsOfDirectory(atPath: imageFolder.path(percentEncoded: false))) ?? []
        files = Set(names.filter { $0.hasSuffix(".webp") }.map { String($0.dropLast(5)) })
        let data = (try? Data(contentsOf: folder.appending(path: "emoji-index.json"))) ?? Data("[]".utf8)
        let all = (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
        let files = files
        entries = all.filter { Self.fileName(for: $0.emoji, in: files) != nil }
    }

    /// The image file for an emoji, trying the spellings the image set uses, as Morrow's `emojiSrc`.
    nonisolated static func fileName(for emoji: String, in files: Set<String>) -> String? {
        let points = emoji.unicodeScalars.map { String($0.value, radix: 16) }
        let plain = points.filter { $0 != "fe0f" }
        let candidates = [
            points.joined(separator: "-"),
            plain.joined(separator: "-"),
            (plain + ["fe0f"]).joined(separator: "-"),
            points.map { $0.count < 4 ? String(repeating: "0", count: 4 - $0.count) + $0 : $0 }.joined(separator: "-"),
        ]
        return candidates.first { files.contains($0) }
    }

    func image(for emoji: String) -> PlatformImage? {
        if let cached = images[emoji] { return cached }
        guard let name = Self.fileName(for: emoji, in: files),
              let image = PlatformImage(contentsOfFile: imageFolder.appending(path: "\(name).webp").path(percentEncoded: false))
        else { return nil }
        images[emoji] = image
        return image
    }

    func search(_ query: String, group: Int?) -> [Entry] {
        let words = query.lowercased().split(separator: " ").map(String.init)
        return entries.filter { entry in
            if words.isEmpty { return group == nil || entry.group == group }
            let haystack = ([entry.label] + entry.tags).joined(separator: " ").lowercased()
            return words.allSatisfy { haystack.contains($0) }
        }
    }

    // MARK: recently used, kept like Morrow's picker

    private static let recentKey = "recentEmoji"

    var recent: [String] {
        UserDefaults.standard.stringArray(forKey: Self.recentKey) ?? []
    }

    func remember(_ emoji: String) {
        var list = recent.filter { $0 != emoji }
        list.insert(emoji, at: 0)
        UserDefaults.standard.set(Array(list.prefix(24)), forKey: Self.recentKey)
    }
}

/// An emoji drawn with its Fluent image, or as text when the image set has none.
struct EmojiImage: View {
    let emoji: String
    var size: CGFloat = 16

    var body: some View {
        if let image = EmojiCatalog.shared.image(for: emoji) {
            #if os(macOS)
            Image(nsImage: image).resizable().interpolation(.high).frame(width: size, height: size)
            #else
            Image(uiImage: image).resizable().interpolation(.high).frame(width: size, height: size)
            #endif
        } else {
            Text(emoji).font(.system(size: size * 0.9))
        }
    }
}

/// Picks a page icon, or removes it.
struct EmojiPickerView: View {
    let current: String?
    let onPick: (String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var group: Int?

    private let catalog = EmojiCatalog.shared
    private let columns = [GridItem(.adaptive(minimum: 40), spacing: 4)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 4) {
                    if query.isEmpty && group == nil && !catalog.recent.isEmpty {
                        Section {
                            ForEach(catalog.recent, id: \.self) { emoji in cell(emoji, label: emoji) }
                        } header: {
                            sectionTitle("Recent")
                        }
                    }
                    Section {
                        ForEach(catalog.search(query, group: group)) { entry in cell(entry.emoji, label: entry.label) }
                    } header: {
                        if query.isEmpty && group == nil && !catalog.recent.isEmpty { sectionTitle("All") }
                    }
                }
                .padding()
            }
            .searchable(text: $query, prompt: "Search emoji")
            .safeAreaInset(edge: .top) { groupBar }
            .navigationTitle("Icon")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                if current != nil {
                    ToolbarItem(placement: .destructiveAction) {
                        Button("Remove Icon", role: .destructive) {
                            onPick(nil)
                            dismiss()
                        }
                    }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 480)
        #endif
    }

    private var groupBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Button("All") { group = nil }
                    .buttonStyle(.bordered)
                    .tint(group == nil ? .accentColor : .secondary)
                ForEach(EmojiCatalog.groups, id: \.id) { item in
                    Button {
                        group = item.id
                    } label: {
                        EmojiImage(emoji: item.icon, size: 18)
                    }
                    .buttonStyle(.bordered)
                    .tint(group == item.id ? .accentColor : .secondary)
                    .accessibilityLabel(item.label)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
        }
        .background(.bar)
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cell(_ emoji: String, label: String) -> some View {
        Button {
            catalog.remember(emoji)
            onPick(emoji)
            dismiss()
        } label: {
            EmojiImage(emoji: emoji, size: 28)
                .frame(width: 40, height: 40)
                .background(current == emoji ? Color.accentColor.opacity(0.2) : .clear, in: .rect(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
