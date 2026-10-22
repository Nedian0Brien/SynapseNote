import Foundation
import WebKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Prints a page into a PDF on A4 paper with margins of 0.6 inch, the sizes of Morrow's desktop export. The page
/// is HTML the app makes (Site.printPage), laid out in a web view off screen that reads the vault's pictures.
@MainActor
final class PDFExporter: NSObject, WKNavigationDelegate {
    enum Failure: LocalizedError {
        case notLoaded, noPages
        var errorDescription: String? {
            switch self {
            case .notLoaded: "The page could not be laid out for printing."
            case .noPages: "The printed page came out empty."
            }
        }
    }

    /// A4 in points, with margins of 0.6 inch.
    static let paper = CGSize(width: 595.28, height: 841.89)
    static let margin: CGFloat = 43.2

    private let access: VaultAccess
    private var loaded: CheckedContinuation<Bool, Never>?

    init(access: VaultAccess) {
        self.access = access
    }

    /// a page of HTML made by the app, printed with only the vault's files to read; it is loaded at the vault's
    /// address, as a page with no address (about:blank) printed empty
    func pdf(html document: String) async throws -> Data {
        let baseURL = URL(string: "\(VaultSchemeHandler.scheme)://vault/")
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        // backgrounds print, as Electron's printBackground does for Morrow: checkbox ticks and callouts are drawn with them
        configuration.preferences.shouldPrintBackgrounds = true
        let vault = VaultSchemeHandler(access: access)
        configuration.setURLSchemeHandler(SchemeAdapter { try vault.response(for: $0) }, forURLScheme: VaultSchemeHandler.scheme)
        let width = Self.paper.width - Self.margin * 2
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: width, height: Self.paper.height), configuration: configuration)
        webView.navigationDelegate = self
        #if os(iOS)
        // the page lays out only while the view is in a window, so it is put in one, never shown, before it loads
        guard let scene = UIApplication.shared.connectedScenes.lazy.compactMap({ $0 as? UIWindowScene }).first else {
            throw Failure.notLoaded
        }
        let window = UIWindow(windowScene: scene)
        window.frame = webView.frame
        window.addSubview(webView)
        defer { webView.removeFromSuperview() }
        #endif
        let finished = await withCheckedContinuation { continuation in
            loaded = continuation
            webView.loadHTMLString(document, baseURL: baseURL)
        }
        guard finished else { throw Failure.notLoaded }
        // fonts load when text first needs them and pictures load on their own; both are waited for
        _ = try? await webView.callAsyncJavaScript(
            """
            await document.fonts.ready;
            await Promise.all([...document.images].map((image) => image.complete ? null :
                new Promise((done) => { image.onload = done; image.onerror = done; })));
            """,
            contentWorld: .page
        )
        let data = try await print(webView)
        guard !data.isEmpty else { throw Failure.noPages }
        return data
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded?.resume(returning: true)
        loaded = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        loaded?.resume(returning: false)
        loaded = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        loaded?.resume(returning: false)
        loaded = nil
    }

    #if os(macOS)
    private func print(_ webView: WKWebView) async throws -> Data {
        let url = FileManager.default.temporaryDirectory.appending(path: "print-\(UUID().uuidString).pdf")
        defer { try? FileManager.default.removeItem(at: url) }
        // printing needs a window to run in; this one is never shown
        let window = NSWindow(contentRect: webView.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = webView
        let info = NSPrintInfo()
        info.paperSize = NSSize(width: Self.paper.width, height: Self.paper.height)
        info.topMargin = Self.margin
        info.bottomMargin = Self.margin
        info.leftMargin = Self.margin
        info.rightMargin = Self.margin
        info.horizontalPagination = .fit
        info.verticalPagination = .automatic
        info.jobDisposition = .save
        info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = url
        let operation = webView.printOperation(with: info)
        operation.showsPrintPanel = false
        operation.showsProgressPanel = false
        operation.view?.frame = webView.bounds
        let done = PrintDone()
        let succeeded = await withCheckedContinuation { continuation in
            done.continuation = continuation
            operation.runModal(for: window, delegate: done, didRun: #selector(PrintDone.printOperationDidRun(_:success:contextInfo:)), contextInfo: nil)
        }
        guard succeeded else { throw Failure.noPages }
        return try Data(contentsOf: url)
    }
    #else
    private func print(_ webView: WKWebView) async throws -> Data {
        // the view is in a window (see pdf(html:)), where the formatter can lay it out
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        let paper = CGRect(origin: .zero, size: Self.paper)
        // the renderer reads its paper and printable area through these keys when no printer sets them
        renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: paper.insetBy(dx: Self.margin, dy: Self.margin)), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, nil)
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: renderer.numberOfPages))
        for index in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: index, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        return data as Data
    }
    #endif
}

#if os(macOS)
/// Hears the end of a print run, which AppKit reports from its own thread.
private nonisolated final class PrintDone: NSObject, @unchecked Sendable {
    var continuation: CheckedContinuation<Bool, Never>?

    @objc func printOperationDidRun(_ operation: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
        continuation?.resume(returning: success)
        continuation = nil
    }
}
#endif

/// Answers a web view's requests for the vault's scheme.
private final class SchemeAdapter: NSObject, WKURLSchemeHandler {
    private let respond: (URL) throws -> (URLResponse, Data)

    init(respond: @escaping (URL) throws -> (URLResponse, Data)) {
        self.respond = respond
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        do {
            let (response, data) = try respond(url)
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        } catch {
            task.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}
