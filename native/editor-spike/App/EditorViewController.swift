import UIKit

/// Spike configuration, read from launch arguments (`-serverURL ws://…`,
/// `-docName spike`, `-soakSeconds 600`), which UIKit exposes via UserDefaults.
struct SpikeConfig {
    let serverURL: URL
    let documentName: String
    let soakSeconds: TimeInterval
    let soakInsertOnly: Bool
    let soakPlainTokens: Bool

    static func fromDefaults(_ defaults: UserDefaults = .standard) -> SpikeConfig {
        SpikeConfig(
            serverURL: URL(string: defaults.string(forKey: "serverURL") ?? "ws://localhost:5180/collab")!,
            documentName: defaults.string(forKey: "docName") ?? "spike",
            soakSeconds: defaults.double(forKey: "soakSeconds"),
            soakInsertOnly: defaults.bool(forKey: "soakInsertOnly"),
            soakPlainTokens: defaults.bool(forKey: "soakPlainTokens")
        )
    }
}

@MainActor
final class EditorViewController: UIViewController {
    private let config = SpikeConfig.fromDefaults()
    private let doc = SpikeDoc()
    private let recorder = SoakRecorder()
    private let statusLabel = UILabel()
    private let textView = UITextView(usingTextLayoutManager: true)
    private var client: HocuspocusClient!
    private var binding: TextBinding!
    private var typer: SoakTyper?
    private var hashTimer: Timer?
    private var synced = false
    /// Markers already seen here. A marker arriving again means the server
    /// rewrote the span around it (logged as source `r`, not as latency).
    private var seenMarkers = Set<String>()

    private static let markerPattern = try! NSRegularExpression(pattern: "⟦([a-z]):(\\d{13})⟧")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        statusLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        statusLabel.textColor = .secondaryLabel
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        textView.font = .monospacedSystemFont(ofSize: 16, weight: .regular)
        textView.autocorrectionType = .no
        textView.autocapitalizationType = .none
        textView.smartQuotesType = .no
        textView.smartDashesType = .no
        textView.smartInsertDeleteType = .no
        textView.isEditable = false
        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.accessibilityIdentifier = "editor"
        view.addSubview(textView)

        NSLayoutConstraint.activate([
            statusLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            statusLabel.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            statusLabel.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            textView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 8),
            textView.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            textView.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
        ])

        client = HocuspocusClient(url: config.serverURL, documentName: config.documentName, doc: doc)
        binding = TextBinding(doc: doc, client: client, textView: textView)

        client.onLog = { [weak self] in self?.log($0) }
        binding.onLog = { [weak self] in self?.log($0) }
        client.onStatus = { [weak self] status in self?.statusChanged(status) }
        client.onRemoteDeltas = { [weak self] deltas in self?.binding.apply(deltas) }
        binding.onRemoteInsert = { [weak self] text, _ in self?.recordMarkers(in: text) }
        binding.onLocalEdit = { [weak self] elapsed, _, _ in self?.recorder.keystroke(ms: elapsed * 1000) }

        updateStatus("connecting")
        client.connect()

        hashTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.synced else { return }
                self.recorder.writeHash(of: self.doc.text())
            }
        }
    }

    private func statusChanged(_ status: HocuspocusClient.Status) {
        updateStatus(status.rawValue)
        guard status == .synced, !synced else { return }
        synced = true
        textView.isEditable = true
        log("synced \(doc.len()) utf16 units")
        if config.soakSeconds > 0 {
            let typer = SoakTyper(textView: textView, duration: config.soakSeconds, insertOnly: config.soakInsertOnly, plainTokens: config.soakPlainTokens)
            typer.onFinish = { [weak self] in
                self?.log("soak typing finished")
                self?.updateStatus("soak finished")
            }
            self.typer = typer
            typer.start()
            log("soak typing started for \(Int(config.soakSeconds))s")
        }
    }

    private func recordMarkers(in text: String) {
        let ns = text as NSString
        let now = SoakRecorder.nowMs()
        for match in Self.markerPattern.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let marker = ns.substring(with: match.range)
            let source = ns.substring(with: match.range(at: 1))
            guard let sent = Int(ns.substring(with: match.range(at: 2))) else { continue }
            if !seenMarkers.insert(marker).inserted {
                recorder.latency(source: "r", ms: 0)
                continue
            }
            if source != "a" { recorder.latency(source: source, ms: now - sent) }
        }
    }

    private func updateStatus(_ text: String) {
        statusLabel.text = "\(config.documentName) · \(text) · \(config.serverURL.absoluteString)"
    }

    private func log(_ message: String) {
        recorder.log(message)
        print("[spike] \(message)")
    }
}
