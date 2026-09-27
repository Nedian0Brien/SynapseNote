import UIKit

/// Draws a paragraph's `Decoration` (bullet, checkbox, quote bar, code
/// background, disclosure triangle) in its leading indent, then the text.
/// TextKit 2's designated hook for custom drawing is an `NSTextLayoutFragment`
/// subclass returned from `NSTextLayoutManagerDelegate`.
final class DecoratedLayoutFragment: NSTextLayoutFragment {
    private var decoration: Decoration? {
        guard let paragraph = textElement as? NSTextParagraph, paragraph.attributedString.length > 0 else { return nil }
        return (paragraph.attributedString.attribute(.spikeDecoration, at: 0, effectiveRange: nil) as? DecorationBox)?.value
    }

    private var indent: CGFloat {
        guard let paragraph = textElement as? NSTextParagraph, paragraph.attributedString.length > 0,
              let style = paragraph.attributedString.attribute(.paragraphStyle, at: 0, effectiveRange: nil) as? NSParagraphStyle
        else { return LivePreviewStyler.indentStep }
        return style.firstLineHeadIndent
    }

    /// UIKit's TextKit 2 places a paragraph's head indent in the fragment's
    /// frame origin, so the drawing origin is where the text starts and the
    /// gutter lies at negative x. The surface grows left to cover it (and, for
    /// code, right to the container edge).
    private var containerWidth: CGFloat {
        textLayoutManager?.textContainer?.size.width ?? layoutFragmentFrame.maxX
    }

    override var renderingSurfaceBounds: CGRect {
        guard decoration != nil else { return super.renderingSurfaceBounds }
        let base = super.renderingSurfaceBounds
        let left = -layoutFragmentFrame.minX
        return base.union(CGRect(x: left, y: 0, width: containerWidth, height: layoutFragmentFrame.height))
    }

    override func draw(at point: CGPoint, in context: CGContext) {
        if let decoration, let firstLine = textLineFragments.first {
            let lineHeight = firstLine.typographicBounds.height
            let x = point.x - LivePreviewStyler.indentStep
            let midY = point.y + firstLine.typographicBounds.minY + lineHeight / 2
            context.saveGState()
            switch decoration {
            case .bullet:
                UIColor.label.setFill()
                context.fillEllipse(in: CGRect(x: x + 7, y: midY - 3, width: 6, height: 6))
            case .checkbox(let checked):
                let box = CGRect(x: x + 2, y: midY - 8, width: 16, height: 16)
                let path = UIBezierPath(roundedRect: box, cornerRadius: 4)
                if checked {
                    UIColor.systemBlue.setFill()
                    path.fill()
                    let check = UIBezierPath()
                    check.move(to: CGPoint(x: box.minX + 4, y: box.midY))
                    check.addLine(to: CGPoint(x: box.minX + 7, y: box.maxY - 4))
                    check.addLine(to: CGPoint(x: box.maxX - 3.5, y: box.minY + 4))
                    UIColor.white.setStroke()
                    check.lineWidth = 2
                    check.stroke()
                } else {
                    UIColor.secondaryLabel.setStroke()
                    path.lineWidth = 1.5
                    path.stroke()
                }
            case .quoteBar:
                UIColor.tertiaryLabel.setFill()
                context.fill(CGRect(x: x + 4, y: point.y, width: 3, height: layoutFragmentFrame.height))
            case .codeBackground:
                UIColor.secondarySystemBackground.setFill()
                context.fill(CGRect(x: point.x - layoutFragmentFrame.minX, y: point.y, width: containerWidth, height: layoutFragmentFrame.height))
            case .disclosure(let folded):
                let tri = UIBezierPath()
                let c = CGPoint(x: x + 10, y: midY)
                if folded {
                    tri.move(to: CGPoint(x: c.x - 3, y: c.y - 5))
                    tri.addLine(to: CGPoint(x: c.x + 4, y: c.y))
                    tri.addLine(to: CGPoint(x: c.x - 3, y: c.y + 5))
                } else {
                    tri.move(to: CGPoint(x: c.x - 5, y: c.y - 3))
                    tri.addLine(to: CGPoint(x: c.x + 5, y: c.y - 3))
                    tri.addLine(to: CGPoint(x: c.x, y: c.y + 4))
                }
                tri.close()
                UIColor.secondaryLabel.setFill()
                tri.fill()
            }
            context.restoreGState()
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
