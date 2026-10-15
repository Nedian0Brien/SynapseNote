import AppKit

/// Draws a paragraph's `ParagraphDecoration` (list marker, quote bars,
/// thematic break) in its leading indent, then the text. TextKit 2's hook for
/// custom drawing is an `NSTextLayoutFragment` subclass returned from the
/// layout manager's delegate.
final class DecoratedLayoutFragment: NSTextLayoutFragment {
    var decoration: ParagraphDecoration? {
        guard let paragraph = textElement as? NSTextParagraph, paragraph.attributedString.length > 0 else { return nil }
        return (paragraph.attributedString.attribute(.synapseDecoration, at: 0, effectiveRange: nil) as? DecorationBox)?.value
    }

    private var containerWidth: CGFloat {
        textLayoutManager?.textContainer?.size.width ?? layoutFragmentFrame.maxX
    }

    /// Decorations draw left of the text, from the container's edge.
    override var renderingSurfaceBounds: CGRect {
        guard decoration != nil else { return super.renderingSurfaceBounds }
        let base = super.renderingSurfaceBounds
        return base.union(CGRect(x: -layoutFragmentFrame.minX, y: 0, width: containerWidth, height: layoutFragmentFrame.height))
    }

    /// The checkbox's frame in text container coordinates, for clicks.
    var checkboxFrame: CGRect? {
        guard case .checkbox = decoration?.marker, let rect = markerRect(origin: layoutFragmentFrame.origin) else { return nil }
        return rect
    }

    private func markerRect(origin: CGPoint) -> CGRect? {
        guard let decoration, let line = textLineFragments.first else { return nil }
        let containerLeft = origin.x - layoutFragmentFrame.minX
        let size = DecorationMetrics.checkboxSize
        let midY = origin.y + line.typographicBounds.midY
        let x = containerLeft + decoration.textIndent - DecorationMetrics.listStep + (DecorationMetrics.listStep - size) / 2 - 2
        return CGRect(x: x, y: midY - size / 2, width: size, height: size)
    }

    override func draw(at point: CGPoint, in context: CGContext) {
        if let decoration, !decoration.isEmpty, let line = textLineFragments.first {
            let containerLeft = point.x - layoutFragmentFrame.minX
            let midY = point.y + line.typographicBounds.midY
            NSGraphicsContext.saveGraphicsState()
            defer { NSGraphicsContext.restoreGraphicsState() }

            for depth in 0..<decoration.quoteDepth {
                NSColor.tertiaryLabelColor.setFill()
                CGRect(x: containerLeft + CGFloat(depth) * DecorationMetrics.quoteStep + 2, y: point.y,
                       width: 3, height: layoutFragmentFrame.height).fill()
            }

            if decoration.rule {
                NSColor.separatorColor.setFill()
                CGRect(x: containerLeft, y: midY - 0.5, width: containerWidth, height: 1).fill()
            }

            switch decoration.marker {
            case .bullet:
                NSColor.labelColor.setFill()
                let x = containerLeft + decoration.textIndent - DecorationMetrics.listStep / 2 - 4
                NSBezierPath(ovalIn: CGRect(x: x, y: midY - 2.5, width: 5, height: 5)).fill()
            case .ordered(let label):
                let font = NSFont.monospacedDigitSystemFont(ofSize: 15, weight: .regular)
                let text = NSAttributedString(string: label, attributes: [.font: font, .foregroundColor: NSColor.secondaryLabelColor])
                let size = text.size()
                let x = containerLeft + decoration.textIndent - 6 - size.width
                text.draw(at: CGPoint(x: x, y: point.y + line.typographicBounds.minY + (line.typographicBounds.height - size.height) / 2))
            case .checkbox(let checked):
                guard let box = markerRect(origin: point) else { break }
                let path = NSBezierPath(roundedRect: box, xRadius: 3.5, yRadius: 3.5)
                if checked {
                    NSColor.controlAccentColor.setFill()
                    path.fill()
                    let check = NSBezierPath()
                    check.move(to: CGPoint(x: box.minX + 3.2, y: box.midY))
                    check.line(to: CGPoint(x: box.minX + 6, y: box.maxY - 3.5))
                    check.line(to: CGPoint(x: box.maxX - 3, y: box.minY + 3.5))
                    NSColor.white.setStroke()
                    check.lineWidth = 1.8
                    check.stroke()
                } else {
                    NSColor.secondaryLabelColor.setStroke()
                    path.lineWidth = 1.3
                    path.stroke()
                }
            case nil:
                break
            }
        }
        super.draw(at: point, in: context)
    }
}

final class DecoratedLayoutManagerDelegate: NSObject, NSTextLayoutManagerDelegate {
    func textLayoutManager(
        _ textLayoutManager: NSTextLayoutManager,
        textLayoutFragmentFor location: any NSTextLocation,
        in textElement: NSTextElement
    ) -> NSTextLayoutFragment {
        DecoratedLayoutFragment(textElement: textElement, range: textElement.elementRange)
    }
}
