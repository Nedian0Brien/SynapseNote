import SwiftUI

/// Flashcards due today, as Morrow's `ReviewView`: the front, then the answer, then a grade from Again to Easy.
struct ReviewView: View {
    let controller: EditorController
    @State private var data: ReviewData?
    /// Fixed when the session starts, so grading a card does not reshuffle the rest.
    @State private var queue: [String]?
    @State private var shown = false
    @State private var done = 0

    private struct Grade {
        let value: String
        let label: String
        let key: Character
        let hint: String
    }

    private static let grades = [
        Grade(value: "again", label: "Again", key: "1", hint: "Forgot it"),
        Grade(value: "hard", label: "Hard", key: "2", hint: "Barely"),
        Grade(value: "good", label: "Good", key: "3", hint: "Remembered"),
        Grade(value: "easy", label: "Easy", key: "4", hint: "Instantly"),
    ]

    private var active: [String] { queue ?? data?.due ?? [] }

    /// Space and 1 to 4 are plain keys; while search or a sheet takes typing, they type instead.
    private var keysFree: Bool { !controller.showingPalette && controller.encryptingPage == nil && !controller.choosingTemplate }

    private var current: Flashcard? {
        guard let first = active.first else { return nil }
        return data?.cards.first { $0.id == first }
    }

    var body: some View {
        let cards = data?.cards ?? []
        CollectionScreen(title: "Review", detail: "Write question :: answer on its own line in any page and it becomes a flashcard. Cards come back just before you would forget them.") {
            HStack(spacing: 8) {
                Chip(text: "\(active.count) due", tint: .blue)
                Chip(text: "\(done) reviewed", tint: .green)
                Chip(text: "\(cards.count) card\(cards.count == 1 ? "" : "s")", tint: .secondary)
            }
        } content: {
            if data == nil {
                ProgressView().frame(maxWidth: .infinity)
            } else if cards.isEmpty {
                ContentUnavailableView("No flashcards yet", systemImage: "graduationcap", description: Text("Add a line like “Capital of France :: Paris” to any page."))
            } else if let current {
                card(current)
            } else {
                ContentUnavailableView("All done for today", systemImage: "party.popper", description: Text("New cards and reviews show up here when they are due."))
            }
        }
        .task(id: controller.revision) {
            guard let next = await controller.review() else { return }
            data = next
        }
    }

    private func card(_ card: Flashcard) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(card.front).font(.title2.weight(.semibold))
            if shown {
                Divider()
                Text(card.back).font(.title3)
                HStack(spacing: 8) {
                    ForEach(Self.grades, id: \.value) { grade in
                        Button { self.grade(card, grade.value) } label: {
                            VStack(spacing: 2) {
                                Text(grade.label).fontWeight(.semibold)
                                Text("\(grade.hint) · \(String(grade.key))").font(.caption).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .keyboardShortcut(keysFree ? KeyboardShortcut(KeyEquivalent(grade.key), modifiers: []) : nil)
                    }
                }
            } else {
                Button("Show Answer") { shown = true }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(keysFree ? KeyboardShortcut(.space, modifiers: []) : nil)
            }
            if let source = controller.workspace.infos[card.pageId] {
                Button("From \(source.displayTitle)") { controller.go(to: .page(source.id), find: card.front) }
                    .buttonStyle(.borderless)
                    .font(.callout)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.fill.quinary, in: .rect(cornerRadius: 14))
    }

    private func grade(_ card: Flashcard, _ value: String) {
        let current = active
        controller.grade(card.id, value)
        done += 1
        shown = false
        // a forgotten card comes back at the end of today's session
        queue = value == "again" ? Array(current.dropFirst()) + [card.id] : Array(current.dropFirst())
    }
}

private struct Chip: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.opacity(0.15), in: .capsule)
    }
}
