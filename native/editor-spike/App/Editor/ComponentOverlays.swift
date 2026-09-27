import UIKit

/// Places a native view over each `<DatabaseView … />` line. The line's text
/// is collapsed by the styler and its paragraph is `componentHeight` tall; this
/// controller reads the laid-out fragment frame and puts the view there. The
/// view is a horizontally scrolling placeholder: real database content is out
/// of scope for the spike (it would come from the server's database API).
@MainActor
final class ComponentOverlays: NSObject, UIScrollViewDelegate {
    private weak var textView: UITextView?
    private var views: [Int: UIScrollView] = [:]  // keyed by line location

    /// Horizontal scroll offset of the first placeholder (UI tests read it).
    var firstOffsetX: CGFloat { views.sorted { $0.key < $1.key }.first?.value.contentOffset.x ?? -1 }
    private(set) var createdCount = 0
    /// Drags that began on a placeholder (UI tests read it).
    private(set) var dragBeganCount = 0

    /// Called when a placeholder scrolls (UI test state is republished).
    var onScroll: (() -> Void)?

    nonisolated func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        MainActor.assumeIsolated { dragBeganCount += 1 }
    }

    nonisolated func scrollViewDidScroll(_ scrollView: UIScrollView) {
        MainActor.assumeIsolated { onScroll?() }
    }

    /// Frames (text view coordinates) of the placeholders on screen.
    var frames: [CGRect] { views.values.filter { $0.superview != nil }.map(\.frame) }

    /// Class of the view that receives a touch at the first placeholder's
    /// center (UI tests read it to diagnose gesture routing).
    var firstHitClass: String {
        guard let textView, let view = views.sorted(by: { $0.key < $1.key }).first?.value else { return "none" }
        let center = CGPoint(x: view.frame.midX, y: view.frame.midY)
        return textView.hitTest(center, with: nil).map { String(describing: type(of: $0)) } ?? "nil"
    }

    init(textView: UITextView) {
        self.textView = textView
        super.init()
    }

    func update(lines: [MarkdownScanner.Line], folding: FoldingController) {
        guard let textView, let layoutManager = textView.textLayoutManager,
              let content = layoutManager.textContentManager else { return }
        var live = Set<Int>()
        for line in lines {
            guard case .component = line.kind, !folding.isHidden(line.range.location) else { continue }
            guard let location = content.location(content.documentRange.location, offsetBy: line.range.location),
                  let fragment = layoutManager.textLayoutFragment(for: location)
            else { continue }
            live.insert(line.range.location)
            let view = views[line.range.location] ?? makeView()
            views[line.range.location] = view
            var frame = fragment.layoutFragmentFrame
            frame.origin.x += textView.textContainerInset.left + textView.textContainer.lineFragmentPadding
            frame.origin.y += textView.textContainerInset.top
            frame.size.width = textView.bounds.width - textView.textContainerInset.left - textView.textContainerInset.right - 2 * textView.textContainer.lineFragmentPadding
            frame.size.height = LivePreviewStyler.componentHeight - 12
            if view.frame != frame { view.frame = frame }
            if view.superview == nil { textView.addSubview(view) }
        }
        for (key, view) in views where !live.contains(key) {
            view.removeFromSuperview()
            views[key] = nil
        }
    }

    private func makeView() -> UIScrollView {
        createdCount += 1
        let scroll = UIScrollView()
        scroll.delegate = self
        scroll.backgroundColor = .secondarySystemBackground
        scroll.layer.cornerRadius = 10
        scroll.showsHorizontalScrollIndicator = true
        scroll.alwaysBounceVertical = false
        scroll.accessibilityIdentifier = "database-view"
        var x: CGFloat = 12
        for i in 1...12 {
            let card = UILabel()
            card.text = "  Row \(i)  "
            card.font = .systemFont(ofSize: 15, weight: .medium)
            card.backgroundColor = .systemBackground
            card.layer.cornerRadius = 8
            card.layer.masksToBounds = true
            card.frame = CGRect(x: x, y: 12, width: 140, height: 96)
            card.textAlignment = .center
            scroll.addSubview(card)
            x += 152
        }
        scroll.contentSize = CGSize(width: x, height: 1)
        return scroll
    }
}

/// `UITextView` that reports layout passes so overlays can follow the text,
/// and keeps its text-interaction gestures (selection, loupe, drag) from
/// claiming touches that start on an embedded native view.
final class EditorTextView: UITextView {
    var onLayout: (() -> Void)?
    var embeddedViewFrames: () -> [CGRect] = { [] }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        if gestureRecognizer !== panGestureRecognizer {
            let point = gestureRecognizer.location(in: self)
            if embeddedViewFrames().contains(where: { $0.contains(point) }) { return false }
        }
        return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }
}
