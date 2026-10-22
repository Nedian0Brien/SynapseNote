import ImageIO
import SwiftUI

/// The vault's first screen, as Morrow's `Home.tsx`: today, a few figures, recent pages, a year of writing,
/// pages worth seeing again and open tasks.
struct HomeView: View {
    let controller: EditorController
    @State private var facts: HomeFacts?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header
                if let facts {
                    stats(facts)
                    if facts.pages == 0 {
                        empty
                    } else if !facts.recent.isEmpty {
                        section("Jump back in") { RecentCards(controller: controller, ids: facts.recent) }
                    }
                    section("Your writing") { Heatmap(weeks: facts.weeks) }
                    memories(facts)
                    if facts.openTasks > 0 {
                        section("Open tasks", count: facts.openTasks) {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(facts.tasks) { TaskRow(controller: controller, task: $0, showsPage: true) }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
            .frame(maxWidth: 880, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        // every change to the workspace, saves included, asks again after a short pause
        .task(id: controller.revision) {
            if facts != nil { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled, let next = await controller.homeFacts() else { return }
            facts = next
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Date.now, format: .dateTime.weekday(.wide).day().month(.wide).year())
                .font(.subheadline)
                .foregroundStyle(.secondary)
            // morrow's home greeting, with the name from the settings
            Text(controller.preferences.name.isEmpty ? "\(Self.greeting(Date.now))." : "\(Self.greeting(Date.now)), \(controller.preferences.name).")
                .font(.largeTitle.weight(.semibold))
        }
    }

    /// Morrow's `greeting`.
    static func greeting(_ date: Date) -> String {
        let hour = Calendar.current.component(.hour, from: date)
        if hour < 5 { return "Good night" }
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        return "Good evening"
    }

    private func stats(_ facts: HomeFacts) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 170), spacing: 12)], spacing: 12) {
            Stat(symbol: "flame.fill", tint: .orange, value: facts.streak, label: "day streak")
            Stat(symbol: "doc.text", tint: .blue, value: facts.pages, label: facts.pages == 1 ? "page" : "pages")
            Stat(symbol: "pencil.line", tint: .green, value: facts.words, label: facts.words == 1 ? "word" : "words")
            Button { controller.go(to: .tasks) } label: {
                Stat(symbol: "checkmark.circle", tint: .purple, value: facts.openTasks, label: facts.openTasks == 1 ? "open task" : "open tasks")
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows every task")
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Your vault is empty").font(.title3.weight(.semibold))
            Text("Start with a blank page, or bring in notes you already have.").foregroundStyle(.secondary)
            HStack {
                Button("Create a Page", systemImage: "plus") { controller.createPage() }
                    .buttonStyle(.borderedProminent)
                Button("Import", systemImage: "arrow.up.doc") { controller.importMarkdown() }
                    .buttonStyle(.bordered)
            }
            .padding(.top, 4)
        }
    }

    @ViewBuilder
    private func memories(_ facts: HomeFacts) -> some View {
        let days = facts.onThisDay.compactMap { controller.workspace.infos[$0] }
        if !days.isEmpty || facts.rediscover != nil {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 24) { memoryColumns(days, facts.rediscover) }
                VStack(alignment: .leading, spacing: 28) { memoryColumns(days, facts.rediscover) }
            }
        }
    }

    @ViewBuilder
    private func memoryColumns(_ days: [PageInfo], _ again: HomeFacts.Rediscover?) -> some View {
        if !days.isEmpty {
            section("On this day") {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(days) { page in
                        Button { controller.go(to: .page(page.id)) } label: { PageLabel(page: page) }
                            .buttonStyle(.plain)
                    }
                }
            }
            .frame(minWidth: 260, maxWidth: .infinity, alignment: .leading)
        }
        if let again, let page = controller.workspace.infos[again.id] {
            section("Rediscover", symbol: "shuffle") {
                Button { controller.go(to: .page(page.id)) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(page.displayTitle).font(.headline)
                        Text("\(again.excerpt)…")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .lineLimit(4)
                            .multilineTextAlignment(.leading)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.fill.quinary, in: .rect(cornerRadius: 12))
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
            .frame(minWidth: 260, maxWidth: .infinity, alignment: .leading)
        }
    }

    private func section<Content: View>(_ title: String, count: Int? = nil, symbol: String? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                if let symbol { Image(systemName: symbol) }
                Text(title)
                if let count { Text("\(count)").foregroundStyle(.tertiary) }
            }
            .font(.caption.weight(.semibold))
            .textCase(.uppercase)
            .foregroundStyle(.secondary)
            .accessibilityAddTraits(.isHeader)
            content()
        }
    }
}

private struct Stat: View {
    let symbol: String
    let tint: Color
    let value: Int
    let label: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol).foregroundStyle(tint)
            Text(value, format: .number).font(.title3.weight(.semibold)).monospacedDigit()
            Text(label).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(tint.opacity(0.1), in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

/// Cards for recently opened or edited pages, each with one of Morrow's gradients, the same for a page every time.
private struct RecentCards: View {
    let controller: EditorController
    let ids: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 12)], spacing: 12) {
            ForEach(ids.compactMap { controller.workspace.infos[$0] }) { page in
                Button { controller.go(to: .page(page.id)) } label: { card(page) }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Open in New Tab", systemImage: "plus.square.on.square") { controller.openInNewTab(.page(page.id)) }
                    }
            }
        }
    }

    private func card(_ page: PageInfo) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CardCover(controller: controller, page: page)
                .frame(height: 64)
                .overlay(alignment: .bottomLeading) {
                    Group {
                        if let icon = page.icon {
                            EmojiImage(emoji: icon, size: 26)
                        } else {
                            Image(systemName: PageIcon.symbol(for: page))
                                .font(.title3)
                                .foregroundStyle(.white)
                        }
                    }
                    .padding(10)
                }
            VStack(alignment: .leading, spacing: 4) {
                Text(page.displayTitle).font(.headline).lineLimit(1)
                Text(meta(page)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            .padding(12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.fill.quinary)
        .clipShape(.rect(cornerRadius: 12))
        .contentShape(.rect)
    }

    private func meta(_ page: PageInfo) -> String {
        let path = controller.workspace.ancestors(of: page.id).reversed().map(\.displayTitle).joined(separator: " / ")
        let time = TrashView.relative(max(page.updatedAt, page.lastOpenedAt ?? 0))
        return path.isEmpty ? time : "\(path) · \(time)"
    }
}

/// A card's cover as Morrow's `PageCard` draws it: the page's own cover, a gradient or a picture, otherwise the
/// gradient the page id picks.
private struct CardCover: View {
    let controller: EditorController
    let page: PageInfo
    @State private var image: Image?

    var body: some View {
        Group {
            if let number = CoverGradient.number(ofCover: page.cover) {
                Rectangle().fill(CoverGradient.gradient(number))
            } else if page.cover != nil, let image {
                Color.clear.overlay { image.resizable().scaledToFill() }.clipped()
            } else {
                Rectangle().fill(CoverGradient.of(page.id))
            }
        }
        .task(id: page.cover) {
            image = nil
            guard let cover = page.cover, CoverGradient.number(ofCover: cover) == nil,
                  let data = await controller.vaultFile(cover)
            else { return }
            image = await Task.detached { CoverPicture.decode(data) }.value
        }
    }
}

/// A cover picture made small enough for a card.
nonisolated enum CoverPicture {
    static func decode(_ data: Data, maxPixels: Int = 800) -> Image? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return Image(decorative: cgImage, scale: 1)
    }
}

/// Morrow's twelve cover gradients, `color.css`.
enum CoverGradient {
    static let colors: [(UInt32, UInt32)] = [
        (0xffd3a5, 0xfd6585), (0xa1c4fd, 0xc2e9fb), (0x84fab0, 0x8fd3f4), (0xcfd9df, 0xe2ebf0),
        (0xa18cd1, 0xfbc2eb), (0xf6d365, 0xfda085), (0x43e97b, 0x38f9d7), (0x4facfe, 0x00f2fe),
        (0xfa709a, 0xfee140), (0x30cfd0, 0x330867), (0x0f2027, 0x2c5364), (0xe0c3fc, 0x8ec5fc),
    ]

    /// Gradient one to twelve.
    static func gradient(_ number: Int) -> LinearGradient {
        let (from, to) = colors[(number - 1 + colors.count) % colors.count]
        return LinearGradient(colors: [Color(hex: from), Color(hex: to)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// The gradient Morrow's `cardGradient` picks for a page without a cover.
    static func of(_ pageId: String) -> LinearGradient {
        gradient(number(for: pageId))
    }

    /// The gradient a `gradient-N` cover names, nil for a picture or none.
    static func number(ofCover cover: String?) -> Int? {
        guard let cover, cover.hasPrefix("gradient-"), let number = Int(cover.dropFirst(9)), (1...colors.count).contains(number) else { return nil }
        return number
    }

    /// `(hash * 31 + code) >>> 0` over the id, then one of twelve.
    static func number(for pageId: String) -> Int {
        var hash: UInt32 = 0
        for unit in pageId.utf16 { hash = hash &* 31 &+ UInt32(unit) }
        return Int(hash % UInt32(colors.count)) + 1
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
    }
}

/// A year of writing, one square a day, as Morrow's `Heatmap`. Narrow screens scroll it, today in view.
private struct Heatmap: View {
    let weeks: [[HomeFacts.Day]]
    @State private var width: CGFloat = 0
    private let gap: CGFloat = 3

    var body: some View {
        let days = weeks.joined().filter { !$0.future }
        let most = max(1, days.map(\.count).max() ?? 1)
        let active = days.filter { $0.count > 0 }.count
        let side = max(10, (width - gap * CGFloat(max(0, weeks.count - 1))) / CGFloat(max(1, weeks.count)))
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: gap) {
                        ForEach(weeks.indices, id: \.self) { index in
                            Text(index > 0 && index < weeks.count - 2 ? month(index) : "")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize()
                                .frame(width: side, alignment: .leading)
                        }
                    }
                    HStack(spacing: gap) {
                        ForEach(weeks.indices, id: \.self) { index in
                            VStack(spacing: gap) {
                                ForEach(weeks[index], id: \.key) { day in
                                    Square(level: day.future ? nil : Self.level(day.count, most: most), side: side)
                                        .help(day.future ? "" : "\(Self.label(day.key)): \(day.count) save\(day.count == 1 ? "" : "s")")
                                }
                            }
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
            .defaultScrollAnchor(.trailing)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .accessibilityElement()
            .accessibilityLabel("Writing on \(active) days in the last year")
            HStack {
                Text("Wrote on \(active.formatted()) \(active == 1 ? "day" : "days") in the last year")
                Spacer()
                HStack(spacing: 3) {
                    Text("Less")
                    ForEach(0..<5) { Square(level: $0, side: 10) }
                    Text("More")
                }
                .accessibilityHidden(true)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.fill.quinary, in: .rect(cornerRadius: 12))
    }

    /// A month name over the first week that starts in that month.
    private func month(_ index: Int) -> String {
        let first = weeks[index][0].key
        if index > 0, weeks[index - 1][0].key.dropFirst(5).prefix(2) == first.dropFirst(5).prefix(2) { return "" }
        guard let date = Self.date(first) else { return "" }
        return date.formatted(.dateTime.month(.abbreviated))
    }

    static func level(_ count: Int, most: Int) -> Int {
        count == 0 ? 0 : min(4, Int((Double(count) / Double(most) * 4).rounded(.up)))
    }

    static func date(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// Morrow's `dayLabel`.
    static func label(_ key: String) -> String {
        date(key)?.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) ?? key
    }
}

private struct Square: View {
    /// Nothing for days still to come, otherwise zero to four.
    let level: Int?
    let side: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(fill)
            .frame(width: side, height: side)
    }

    private var fill: AnyShapeStyle {
        switch level {
        case nil: AnyShapeStyle(.clear)
        case 0: AnyShapeStyle(.fill.tertiary)
        // morrow's color-mix of the accent at 30, 55 and 78 percent, then the accent itself
        case 1: AnyShapeStyle(Color.accentColor.opacity(0.3))
        case 2: AnyShapeStyle(Color.accentColor.opacity(0.55))
        case 3: AnyShapeStyle(Color.accentColor.opacity(0.78))
        default: AnyShapeStyle(Color.accentColor)
        }
    }
}
