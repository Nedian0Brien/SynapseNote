import AppKit
import SwiftUI

/// Hosts a document's `SourceTextView` in SwiftUI.
struct EditorView: NSViewRepresentable {
    let controller: DocumentController
    var onReady: (SourceTextView) -> Void = { _ in }

    func makeNSView(context: Context) -> NSScrollView {
        let textView = SourceTextView(usingTextLayoutManager: true)
        textView.configure()
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.textContainer?.widthTracksTextView = true

        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.drawsBackground = false
        scrollView.documentView = textView

        controller.attach(textView)
        DispatchQueue.main.async {
            textView.window?.makeFirstResponder(textView)
            onReady(textView)
        }
        return scrollView
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {}
}
