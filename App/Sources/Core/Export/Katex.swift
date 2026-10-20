import Foundation
import JavaScriptCore

/// KaTeX's `renderToString`, run in JavaScriptCore from App/Renderers/katex.min.js, for what Morrow renders with
/// it outside the editor: published sites and PDFs take formulas as MathML (`output: 'mathml'`), which browsers
/// show without KaTeX's fonts (operations.ts publishSite).
nonisolated enum Katex {
    /// `katex.renderToString(latex, { output: 'mathml', displayMode, throwOnError: false })`
    static func mathML(_ latex: String, display: Bool) -> String {
        engine.render(latex, display: display)
    }

    private static let engine = Engine()

    private final class Engine: @unchecked Sendable {
        private let lock = NSLock()
        private let context: JSContext?

        init() {
            let context = JSContext()
            if let url = Bundle.main.url(forResource: "Renderers/katex.min", withExtension: "js"),
               let source = try? String(contentsOf: url, encoding: .utf8) {
                context?.evaluateScript(source, withSourceURL: url)
            }
            let ready = context?.evaluateScript("typeof katex === 'object'")?.toBool() == true
            self.context = ready ? context : nil
        }

        func render(_ latex: String, display: Bool) -> String {
            lock.lock()
            defer { lock.unlock() }
            guard let context, let render = context.objectForKeyedSubscript("katex")?.objectForKeyedSubscript("renderToString"),
                  let options = JavaScriptCore.JSValue(object: ["output": "mathml", "displayMode": display, "throwOnError": false], in: context),
                  let html = render.call(withArguments: [latex, options])?.toString(), context.exception == nil else {
                context?.exception = nil
                // what the published page shows when there is no renderer, as site.ts without renderMath
                return display ? "<pre>\(Site.escape(latex))</pre>" : "<code class=\"math\">\(Site.escape(latex))</code>"
            }
            return html
        }
    }
}
