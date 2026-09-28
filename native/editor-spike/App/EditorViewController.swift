import UIKit

/// Spike configuration, read from launch arguments (`-serverURL ws://…`,
/// `-docName spike`, `-soakSeconds 600`, `-perfSeconds 60`), which UIKit
/// exposes via UserDefaults.
struct SpikeConfig {
    let serverURL: URL
    let documentName: String
    let soakSeconds: TimeInterval
    let soakInsertOnly: Bool
    let soakPlainTokens: Bool
    let perfSeconds: TimeInterval
    let caretLine: Int
    /// `-uiTest 1`: publish editor state as JSON on a `debug-state` element.
    let uiTest: Bool

    static func fromDefaults(_ defaults: UserDefaults = .standard) -> SpikeConfig {
        SpikeConfig(
            serverURL: URL(string: defaults.string(forKey: "serverURL") ?? "ws://localhost:5180/collab")!,
            documentName: defaults.string(forKey: "docName") ?? "spike",
            soakSeconds: defaults.double(forKey: "soakSeconds"),
            soakInsertOnly: defaults.bool(forKey: "soakInsertOnly"),
            soakPlainTokens: defaults.bool(forKey: "soakPlainTokens"),
            perfSeconds: defaults.double(forKey: "perfSeconds"),
            caretLine: defaults.integer(forKey: "caretLine"),
            uiTest: defaults.bool(forKey: "uiTest")
        )
    }
}

@MainActor
final class EditorViewController: UIViewController, UITextViewDelegate, UIGestureRecognizerDelegate {
    private let config = SpikeConfig.fromDefaults()
    private let doc = SpikeDoc()
    private let recorder = SoakRecorder()
    private let statusLabel = UILabel()
    private let textView = EditorTextView(usingTextLayoutManager: true)
    private let styler = LivePreviewStyler()
    private let folding = FoldingController()
    private let layoutDelegate = DecoratedLayoutManagerDelegate()
    private var overlays: ComponentOverlays!
    private var client: HocuspocusClient!
    private var binding: TextBinding!
    private var typer: SoakTyper?
    private var hashTimer: Timer?
    private var perfTimer: Timer?
    private var synced = false
    private var previousSelection = NSRange(location: 0, length: 0)
    /// Markers already seen here. A marker arriving again means the server
    /// rewrote the span around it (logged as source `r`, not as latency).
    private var seenMarkers = Set<String>()
    private let debugLabel = UILabel()
    private var debugPending = false
    private var textDragBeganCount = 0

    private static let markerPattern = try! NSRegularExpression(pattern: "⟦([a-z]):(\\d{13})⟧")

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        statusLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        statusLabel.textColor = .secondaryLabel
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.accessibilityIdentifier = "status"
        view.addSubview(statusLabel)
        if config.uiTest {
            debugLabel.frame = CGRect(x: 0, y: 0, width: 2, height: 2)
            debugLabel.alpha = 0.02
            debugLabel.isAccessibilityElement = true
            debugLabel.accessibilityIdentifier = "debug-state"
            view.addSubview(debugLabel)
        }

        textView.font = .systemFont(ofSize: 17)
        textView.autocorrectionType = .no
        textView.autocapitalizationType = .none
        textView.smartQuotesType = .no
        textView.smartDashesType = .no
        textView.smartInsertDeleteType = .no
        textView.isEditable = false
        textView.textContainerInset = UIEdgeInsets(top: 16, left: 24, bottom: 120, right: 24)
        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.accessibilityIdentifier = "editor"
        textView.delegate = self
        view.addSubview(textView)

        NSLayoutConstraint.activate([
            statusLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            statusLabel.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            statusLabel.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            textView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 8),
            textView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            textView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
        ])

        // TextKit 2 hooks: custom fragments draw decorations; the content
        // storage delegate skips folded paragraphs.
        textView.textLayoutManager?.delegate = layoutDelegate
        (textView.textLayoutManager?.textContentManager as? NSTextContentStorage)?.delegate = folding
        folding.styler = styler
        styler.isFolded = { [folding] in folding.isFolded($0) }
        overlays = ComponentOverlays(textView: textView)
        textView.embeddedViewFrames = { [weak self] in self?.overlays.frames ?? [] }
        overlays.onScroll = { [weak self] in self?.scheduleDebugState() }
        textView.onLayout = { [weak self] in
            self?.updateOverlays()
            self?.scheduleDebugState()
        }

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.delegate = self
        textView.addGestureRecognizer(tap)

        client = HocuspocusClient(url: config.serverURL, documentName: config.documentName, doc: doc)
        binding = TextBinding(doc: doc, client: client, textView: textView)

        client.onLog = { [weak self] in self?.log($0) }
        binding.onLog = { [weak self] in self?.log($0) }
        client.onStatus = { [weak self] status in self?.statusChanged(status) }
        client.onRemoteDeltas = { [weak self] deltas in self?.binding.apply(deltas) }
        binding.onRemoteInsert = { [weak self] text, _ in self?.recordMarkers(in: text) }
        binding.onLocalEdit = { [weak self] elapsed, _, _ in self?.recorder.keystroke("sync", ms: elapsed * 1000) }
        binding.onCharactersEdited = { [weak self] storage, range, delta in
            self?.charactersEdited(storage, range: range, delta: delta)
        }

        updateStatus("connecting")
        client.connect()

        hashTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.synced else { return }
                self.recorder.writeHash(of: self.doc.text())
            }
        }
    }

    // MARK: - Editing hooks

    private func charactersEdited(_ storage: NSTextStorage, range: NSRange, delta: Int) {
        let start = CACurrentMediaTime()
        folding.charactersEdited(editedRange: range, delta: delta)
        styler.charactersEdited(storage, editedRange: range, delta: delta, selection: textView.selectedRange)
        folding.recomputeHiddenRanges()
        if !binding.applyingRemote {
            recorder.keystroke("style", ms: (CACurrentMediaTime() - start) * 1000)
        }
        textView.setNeedsLayout()
    }

    func textViewDidChangeSelection(_ textView: UITextView) {
        snapCaretOutOfComponents()
        styler.selectionChanged(textView.textStorage, selection: textView.selectedRange)
        previousSelection = textView.selectedRange
        scheduleDebugState()
    }

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        textDragBeganCount += 1
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        scheduleDebugState()
    }

    // MARK: - UI test state

    private func scheduleDebugState() {
        guard config.uiTest, !debugPending else { return }
        debugPending = true
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
                self?.debugPending = false
                self?.publishDebugState()
            }
        }
    }

    /// Line frames in window coordinates, selection, and text identity, so a
    /// UI test can tap real positions and compare with the server.
    private func publishDebugState() {
        guard let layoutManager = textView.textLayoutManager, let content = layoutManager.textContentManager else { return }
        var lines: [[String: Any]] = []
        for (i, line) in styler.index.lines.enumerated() {
            var entry: [String: Any] = ["i": i, "kind": "\(line.kind)", "loc": line.range.location, "len": line.range.length]
            if !folding.isHidden(line.range.location),
               let location = content.location(content.documentRange.location, offsetBy: line.range.location),
               let fragment = layoutManager.textLayoutFragment(for: location),
               fragment.rangeInElement.location.compare(location) != .orderedDescending {
                var f = fragment.layoutFragmentFrame
                f.origin.x += textView.textContainerInset.left
                f.origin.y += textView.textContainerInset.top
                let w = textView.convert(f, to: nil)
                entry["frame"] = [w.minX, w.minY, w.width, w.height]
            }
            lines.append(entry)
        }
        let text = doc.text()
        let state: [String: Any] = [
            "selection": [textView.selectedRange.location, textView.selectedRange.length],
            "active": styler.activeLines.sorted(),
            "folded": folding.foldedOpeners.sorted(),
            "textHash": SoakRecorder.sha256(text),
            "viewMatchesDoc": text == textView.textStorage.string,
            "dbOffsetX": overlays.firstOffsetX,
            "dbCreated": overlays.createdCount,
            "dbHit": overlays.firstHitClass,
            "dbDragBegan": overlays.dragBeganCount,
            "textDragBegan": textDragBeganCount,
            "textOffsetY": textView.contentOffset.y,
            "lines": lines,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: state), let json = String(data: data, encoding: .utf8) {
            debugLabel.accessibilityValue = json
        }
    }

    /// A `<DatabaseView … />` line is one unit: a caret landing inside it moves
    /// to its far side in the direction of travel.
    private func snapCaretOutOfComponents() {
        let selection = textView.selectedRange
        guard selection.length == 0, let i = styler.index.lineIndex(at: selection.location) else { return }
        let line = styler.index.lines[i]
        guard case .component = line.kind,
              selection.location > line.range.location, selection.location <= NSMaxRange(line.range)
        else { return }
        let forward = selection.location >= previousSelection.location
        let target = forward ? min(NSMaxRange(line.fullRange), textView.textStorage.length) : line.range.location
        textView.selectedRange = NSRange(location: target, length: 0)
    }

    private func updateOverlays() {
        overlays.update(lines: styler.index.lines, folding: folding)
    }

    // MARK: - Taps: checkboxes and accordion headers

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

    @objc private func handleTap(_ tap: UITapGestureRecognizer) {
        guard let layoutManager = textView.textLayoutManager, let content = layoutManager.textContentManager else { return }
        var point = tap.location(in: textView)
        point.x -= textView.textContainerInset.left
        point.y -= textView.textContainerInset.top
        guard let fragment = layoutManager.textLayoutFragment(for: point),
              let location = fragment.textElement?.elementRange?.location
        else { return }
        let offset = content.offset(from: content.documentRange.location, to: location)
        guard let i = styler.index.lineIndex(at: offset) else { return }
        let line = styler.index.lines[i]
        let inGutter = point.x - fragment.layoutFragmentFrame.minX < LivePreviewStyler.indentStep + 8

        switch line.kind {
        case .task(let checked, let box) where inGutter:
            toggleTask(box: box, checked: checked)
        case .accordionOpen where inGutter || !styler.activeLines.contains(i):
            toggleFold(lineIndex: i)
        default:
            break
        }
    }

    /// Replace the one character between `[` and `]`; the binding sends it.
    func toggleTask(box: Int, checked: Bool) {
        let selection = textView.selectedRange
        let storage = textView.textStorage
        storage.beginEditing()
        storage.replaceCharacters(in: NSRange(location: box, length: 1), with: checked ? " " : "x")
        storage.endEditing()
        textView.selectedRange = selection
        log("task toggled at \(box) → \(checked ? "[ ]" : "[x]")")
    }

    func toggleFold(lineIndex i: Int) {
        let line = styler.index.lines[i]
        folding.toggle(opener: line.range.location)
        let storage = textView.textStorage
        storage.beginEditing()
        styler.restyle(storage, lines: [i])
        storage.endEditing()
        if let layoutManager = textView.textLayoutManager {
            layoutManager.invalidateLayout(for: layoutManager.documentRange)
        }
        textView.setNeedsLayout()
        textView.layoutIfNeeded()
        updateOverlays()
        log("accordion at \(line.range.location) \(folding.isFolded(line.range.location) ? "folded" : "unfolded")")
    }

    // MARK: - Sync status, soak, perf

    private func statusChanged(_ status: HocuspocusClient.Status) {
        updateStatus(status.rawValue)
        guard status == .synced, !synced else { return }
        synced = true
        textView.isEditable = true
        log("synced \(doc.len()) utf16 units, \(styler.index.lines.count) lines")
        if config.soakSeconds > 0 {
            let typer = SoakTyper(textView: textView, duration: config.soakSeconds, insertOnly: config.soakInsertOnly, plainTokens: config.soakPlainTokens)
            typer.onFinish = { [weak self, weak typer] in
                self?.recorder.writeInserted(units: typer?.insertedUnits ?? 0, markers: typer?.insertedMarkers ?? 0)
                self?.log("soak typing finished")
                self?.updateStatus("soak finished")
            }
            self.typer = typer
            typer.start()
            log("soak typing started for \(Int(config.soakSeconds))s")
        }
        if config.caretLine > 0 { placeCaret(atLine: config.caretLine) }
        if config.perfSeconds > 0 { startPerf() }
    }

    private func placeCaret(atLine n: Int) {
        let lines = styler.index.lines
        guard !lines.isEmpty else { return }
        let line = lines[min(n, lines.count - 1)]
        textView.becomeFirstResponder()
        textView.selectedRange = NSRange(location: NSMaxRange(line.range), length: 0)
        textView.scrollRangeToVisible(textView.selectedRange)
    }

    /// R6: type at the caret 10 times a second and time each keystroke from
    /// `replace` through a synchronous layout pass.
    private func startPerf() {
        if config.caretLine == 0 { placeCaret(atLine: styler.index.lines.count / 2) }
        let started = Date()
        var n = 0
        let tokens = ["a", "b", " ", "c", "*", "d", "`"]
        perfTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                guard let self else { return }
                if Date().timeIntervalSince(started) > self.config.perfSeconds {
                    timer.invalidate()
                    self.log("perf finished after \(n) keystrokes")
                    self.updateStatus("perf finished")
                    return
                }
                n += 1
                let t0 = CACurrentMediaTime()
                if n % 5 == 0, let range = self.textView.selectedTextRange,
                   let start = self.textView.position(from: range.start, offset: -1),
                   let del = self.textView.textRange(from: start, to: range.start) {
                    self.textView.replace(del, withText: "")
                } else if let range = self.textView.selectedTextRange {
                    self.textView.replace(range, withText: tokens[n % tokens.count])
                }
                self.textView.layoutIfNeeded()
                self.recorder.keystroke("full", ms: (CACurrentMediaTime() - t0) * 1000)
            }
        }
        log("perf typing started for \(Int(config.perfSeconds))s")
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
