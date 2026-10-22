import SwiftUI
import WebKit
#if os(iOS)
import UIKit
#endif

/// Formulas and diagrams drawn as Morrow's editor draws them: KaTeX (Extras.ts `mathExtensions`, tiptap's
/// mathematics nodes) and Mermaid (Extras.ts `renderMermaid`, `configureMermaid`), from App/Renderers, in one
/// web view kept in the window behind the app's content. Each result is taken as a picture (`takeSnapshot`) and
/// kept, so a formula is drawn once for each look. Requests wait their turn; `version` changes when one is done.
@MainActor @Observable
final class WebRenderer {
    static let shared = WebRenderer()

    enum Kind: Hashable {
        case math(display: Bool)
        case diagram
    }

    struct Key: Hashable {
        var kind: Kind
        var source: String
        /// the text size a formula takes, in points
        var size: CGFloat
        var dark: Bool
        /// the room a diagram has, in points
        var width: CGFloat = 0
    }

    enum Result {
        /// the picture and, for an inline formula, how far its baseline is above its bottom
        case image(PlatformImage, descent: CGFloat)
        /// a formula KaTeX could not take, shown as written; a diagram's mistake
        case failed(String)
    }

    /// counts finished renderings, for views that show them to read
    private(set) var version = 0

    @ObservationIgnored private var done: [Key: Result] = [:]
    @ObservationIgnored private var queue: [Key] = []
    @ObservationIgnored private var working = false
    @ObservationIgnored private var webView: WKWebView?
    @ObservationIgnored private var mermaidLoaded = false

    private static let directory = Bundle.main.url(forResource: "Renderers", withExtension: nil)

    /// what is drawn for the key, asking for it when it is not drawn yet
    func result(_ key: Key) -> Result? {
        if let result = done[key] { return result }
        if !queue.contains(key) {
            queue.append(key)
            drain()
        }
        return nil
    }

    private func drain() {
        guard !working else { return }
        working = true
        Task {
            while !queue.isEmpty {
                let key = queue.removeFirst()
                if done[key] == nil { done[key] = await render(key) }
                version += 1
            }
            working = false
        }
    }

    // MARK: rendering

    private func render(_ key: Key) async -> Result {
        guard let webView = await prepared() else { return .failed(key.source) }
        let color = key.dark ? "#ececec" : "#1d1d1f"
        do {
            let measured: Any?
            switch key.kind {
            case .math(let display):
                measured = try await webView.callAsyncJavaScript("return await renderMath(source, display, size, color)",
                                                                  arguments: ["source": key.source, "display": display, "size": key.size, "color": color],
                                                                  contentWorld: .page)
            case .diagram:
                if !mermaidLoaded, let source = Self.text("mermaid.min.js") {
                    _ = try await webView.evaluateJavaScript(source)
                    mermaidLoaded = true
                }
                measured = try await webView.callAsyncJavaScript("return await renderDiagram(source, dark, width)",
                                                                  arguments: ["source": key.source, "dark": key.dark, "width": key.width],
                                                                  contentWorld: .page)
            }
            guard let box = measured as? [String: Any] else { return .failed(key.source) }
            if let error = box["error"] as? String { return .failed(error) }
            guard let width = (box["w"] as? NSNumber)?.doubleValue, let height = (box["h"] as? NSNumber)?.doubleValue, width > 0, height > 0 else {
                return .failed(key.source)
            }
            let configuration = WKSnapshotConfiguration()
            configuration.rect = CGRect(x: 0, y: 0, width: width, height: height)
            configuration.snapshotWidth = NSNumber(value: width)
            #if os(iOS)
            configuration.afterScreenUpdates = true
            #endif
            let image = try await webView.takeSnapshot(configuration: configuration)
            return .image(image, descent: (box["d"] as? NSNumber).map { CGFloat($0.doubleValue) } ?? 0)
        } catch {
            return .failed(key.source)
        }
    }

    /// the web view with the page loaded, placed in the window behind everything
    private func prepared() async -> WKWebView? {
        if let webView, webView.window != nil { return webView }
        let webView = self.webView ?? makeWebView()
        self.webView = webView
        guard attach(webView) else { return nil }
        // the page is loaded once; a web view moved to another window keeps it
        if webView.url == nil {
            webView.loadHTMLString(Self.page(), baseURL: nil)
            for _ in 0..<100 {
                if (try? await webView.evaluateJavaScript("typeof renderMath")) as? String == "function" { break }
                try? await Task.sleep(for: .milliseconds(50))
            }
            // every katex font loaded before the first formula, as a font still loading draws nothing
            _ = try? await webView.callAsyncJavaScript("await Promise.all([...document.fonts].map((font) => font.load().catch(() => null)))",
                                                       contentWorld: .page)
        }
        return webView
    }

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1200, height: 1200), configuration: configuration)
        #if os(iOS)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        // the window's safe area would push the page down under the status bar, out of the pictured rect
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isUserInteractionEnabled = false
        webView.accessibilityElementsHidden = true
        #else
        webView.setValue(false, forKey: "drawsBackground")
        webView.alphaValue = 0
        webView.setAccessibilityElement(false)
        #endif
        return webView
    }

    private func attach(_ webView: WKWebView) -> Bool {
        #if os(iOS)
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        guard let window = windows.first(where: \.isKeyWindow) ?? windows.first else { return false }
        if webView.superview !== window { window.insertSubview(webView, at: 0) }
        return true
        #else
        guard let content = (NSApp.keyWindow ?? NSApp.windows.first(where: \.isVisible))?.contentView else { return false }
        if webView.superview !== content { content.addSubview(webView, positioned: .below, relativeTo: nil) }
        return true
        #endif
    }

    // MARK: the page

    private static func text(_ name: String) -> String? {
        guard let url = directory?.appending(path: name) else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    /// katex's stylesheet with its fonts in place, its scripts, and the two functions the renderer calls
    private static func page() -> String {
        var css = text("katex.min.css") ?? ""
        if let fonts = directory?.appending(path: "fonts"), let names = try? FileManager.default.contentsOfDirectory(atPath: fonts.path) {
            for name in names where name.hasSuffix(".woff2") {
                guard let data = try? Data(contentsOf: fonts.appending(path: name)) else { continue }
                css = css.replacingOccurrences(of: "url(fonts/\(name))", with: "url(data:font/woff2;base64,\(data.base64EncodedString()))")
            }
        }
        let katex = text("katex.min.js") ?? ""
        return """
        <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>\(css)
        html, body { margin: 0; padding: 0; background: transparent; }
        #out { position: absolute; left: 0; top: 0; display: inline-block; font-family: -apple-system, system-ui, sans-serif; }
        #out .katex-display { margin: 0; }
        #out svg { display: block; max-width: 100%; height: auto; }
        </style></head><body><div id="out"></div>
        <script>\(katex)</script>
        <script>\(script)</script>
        </body></html>
        """
    }

    /// renderMath: the formula as tiptap's mathematics nodes render it, with the options Morrow gives them;
    /// renderDiagram: Morrow's renderMermaid and configureMermaid
    private static let script = #"""
    const out = document.getElementById('out');
    // the box that holds everything drawn, as katex's struts and big operators reach outside their parents
    const size = () => {
      const top = out.getBoundingClientRect();
      let right = top.right, bottom = top.bottom;
      for (const element of out.querySelectorAll('*')) {
        const box = element.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        right = Math.max(right, box.right);
        bottom = Math.max(bottom, box.bottom);
      }
      return { w: Math.ceil(right - top.left), h: Math.ceil(bottom - top.top) };
    };
    // katex's fonts load when first used and draw nothing until then (font-display: block); two frames more
    // so what is measured is painted
    const settled = async () => {
      // reading the layout starts the loads of the fonts it needs, which fonts.ready then waits for
      out.getBoundingClientRect();
      await document.fonts.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    };
    async function renderMath(source, display, fontSize, color) {
      out.style.width = '';
      out.style.fontSize = fontSize + 'px';
      out.style.color = color;
      try {
        out.innerHTML = katex.renderToString(source, display
          ? { throwOnError: false, displayMode: true, strict: false }
          : { throwOnError: false, strict: false });
      } catch {
        return { error: source };
      }
      // a zero-size mark on the baseline gives how far the formula reaches below it
      const mark = document.createElement('span');
      mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      (out.querySelector('.katex') || out).appendChild(mark);
      await settled();
      const box = size();
      const baseline = mark.getBoundingClientRect().top - out.getBoundingClientRect().top;
      mark.remove();
      return { w: box.w, h: box.h, d: Math.max(0, box.h - baseline) };
    }
    let diagramCount = 0;
    let diagramTheme = null;
    async function renderDiagram(source, dark, width) {
      if (diagramTheme !== dark) {
        diagramTheme = dark;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: 'Inter Variable, system-ui, sans-serif',
          themeVariables: dark
            ? { background: '#191919', primaryColor: '#1d2b3f', primaryBorderColor: '#4c8df6', primaryTextColor: '#e8e8e8',
                secondaryColor: '#2a2140', tertiaryColor: '#202020', lineColor: '#8b9099', textColor: '#e8e8e8', fontSize: '14px' }
            : { background: '#ffffff', primaryColor: '#e9f2fe', primaryBorderColor: '#2f80ed', primaryTextColor: '#1f2328',
                secondaryColor: '#f1eafe', tertiaryColor: '#f7f7f5', lineColor: '#8a8f98', textColor: '#1f2328', fontSize: '14px' },
        });
      }
      try {
        const { svg } = await mermaid.render('morrow-diagram-' + ++diagramCount, source);
        out.style.width = width + 'px';
        out.style.fontSize = '';
        out.innerHTML = svg;
        await settled();
        const drawn = out.querySelector('svg');
        const box = drawn ? drawn.getBoundingClientRect() : out.getBoundingClientRect();
        out.style.width = Math.ceil(box.width) + 'px';
        return { w: Math.ceil(box.width), h: Math.ceil(box.height) };
      } catch (error) {
        document.querySelectorAll('[id^="dmorrow-diagram-"]').forEach((element) => element.remove());
        return { error: 'This diagram has a mistake: ' + (error instanceof Error ? error.message.split('\n')[0] : 'unknown') };
      }
    }
    """#
}
