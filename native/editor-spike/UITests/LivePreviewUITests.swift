import CryptoKit
import XCTest

/// Drives the spike app on a simulator against the local dev server (R3–R5).
///
/// Each test opens its own copy of `fixtures/spike.md` named
/// `<SPIKE_UI_DOC_PREFIX>-<test>` — the host creates them before the run
/// (`TEST_RUNNER_SPIKE_UI_DOC_PREFIX` in the xcodebuild environment). Taps use
/// the line frames the app publishes on its `debug-state` element.
final class LivePreviewUITests: XCTestCase {
    private let server = URL(string: "http://localhost:5180")!
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
    }

    // MARK: - Helpers

    private struct Line: Decodable {
        let i: Int
        let kind: String
        let loc: Int
        let len: Int
        let frame: [Double]?
        var rect: CGRect? { frame.map { CGRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) } }
    }

    private struct State: Decodable {
        let selection: [Int]
        let active: [Int]
        let folded: [Int]
        let textHash: String
        let viewMatchesDoc: Bool
        let dbOffsetX: Double
        let dbCreated: Int
        let dbHit: String
        let dbDragBegan: Int
        let textDragBegan: Int
        let textOffsetY: Double
        let lines: [Line]
    }

    private func docName(_ test: String) -> String {
        let prefix = ProcessInfo.processInfo.environment["SPIKE_UI_DOC_PREFIX"] ?? "ui"
        return "\(prefix)-\(test)"
    }

    private func launch(_ doc: String) {
        app = XCUIApplication()
        app.launchArguments = ["-docName", doc, "-uiTest", "1"]
        app.launch()
        let status = app.staticTexts["status"]
        let synced = NSPredicate(format: "label CONTAINS 'synced'")
        expectation(for: synced, evaluatedWith: status)
        waitForExpectations(timeout: 15)
    }

    private func state() throws -> State {
        let value = app.staticTexts["debug-state"].value as? String ?? app.otherElements["debug-state"].value as? String
        let json = try XCTUnwrap(value, "debug-state not published")
        return try JSONDecoder().decode(State.self, from: Data(json.utf8))
    }

    private func line(containing kindPrefix: String, _ state: State, nth: Int = 0) throws -> Line {
        let matches = state.lines.filter { $0.kind.hasPrefix(kindPrefix) }
        XCTAssertGreaterThan(matches.count, nth, "no line of kind \(kindPrefix)")
        return matches[nth]
    }

    private func tap(_ point: CGPoint) {
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: point.x, dy: point.y)).tap()
    }

    private func serverText(_ doc: String) throws -> String {
        var components = URLComponents(url: server.appendingPathComponent("api/document"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "docName", value: doc)]
        let data = try Data(contentsOf: components.url!)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return try XCTUnwrap(object?["content"] as? String)
    }

    private func agentPatch(_ doc: String, find: String, replace: String) throws {
        var request = URLRequest(url: server.appendingPathComponent("api/agent-patch"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["docName": doc, "find": find, "replace": replace, "summary": "ui test"])
        let done = expectation(description: "agent-patch")
        var status = 0
        URLSession.shared.dataTask(with: request) { _, response, _ in
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
            done.fulfill()
        }.resume()
        wait(for: [done], timeout: 10)
        XCTAssertEqual(status, 200)
    }

    private func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func screenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func settle(_ seconds: TimeInterval = 1.0) {
        RunLoop.current.run(until: Date().addingTimeInterval(seconds))
    }

    // MARK: - R3 live preview

    func testCaretRevealsSyntaxOnlyOnItsLine() throws {
        launch(docName("caret"))
        screenshot("preview-no-caret")
        var s = try state()
        let paragraph = try line(containing: "paragraph", s)
        let rect = try XCTUnwrap(paragraph.rect)
        tap(CGPoint(x: rect.minX + 200, y: rect.midY))
        settle()
        s = try state()
        XCTAssertEqual(s.active, [paragraph.i], "only the tapped line shows syntax")
        screenshot("preview-caret-on-paragraph")
    }

    func testCheckboxTapChangesOneCharacter() throws {
        let doc = docName("checkbox")
        launch(doc)
        let before = try serverText(doc)
        let s = try state()
        let task = try line(containing: "task(checked: false", s)
        let rect = try XCTUnwrap(task.rect)
        tap(CGPoint(x: rect.minX - 12, y: rect.minY + 12))  // the checkbox in the gutter
        settle(1.5)
        let after = try serverText(doc)
        XCTAssertEqual(before.count, after.count)
        let diffs = zip(before.unicodeScalars, after.unicodeScalars).enumerated().filter { $0.element.0 != $0.element.1 }
        XCTAssertEqual(diffs.count, 1, "exactly one character changed")
        XCTAssertEqual(diffs.first.map { String($0.element.1) }, "x")
        XCTAssertEqual(try state().textHash, sha256(after))
        screenshot("checkbox-toggled")
    }

    // MARK: - R4 native view

    func testCaretSkipsTheComponentLine() throws {
        let doc = docName("component")
        launch(doc)
        var s = try state()
        let component = try line(containing: "component", s)
        let before = try serverText(doc)
        // Put the caret on the line above the component, then walk down.
        let code = try line(containing: "code", s, nth: 1)
        let rect = try XCTUnwrap(code.rect)
        tap(CGPoint(x: rect.maxX + 40, y: rect.midY))
        settle()
        var visited: [Int] = []
        for _ in 0..<12 {
            app.typeKey(XCUIKeyboardKey.rightArrow, modifierFlags: [])
            s = try state()
            visited.append(s.selection[0])
        }
        let inside = visited.filter { $0 > component.loc && $0 <= component.loc + component.len }
        XCTAssertTrue(inside.isEmpty, "caret stopped inside the component at \(inside); walk: \(visited)")
        XCTAssertTrue(visited.contains { $0 > component.loc + component.len }, "caret never passed the component: \(visited)")
        // Type after the component; its source line is untouched.
        app.typeText("Z")
        settle(1.5)
        let after = try serverText(doc)
        let componentSource = (before as NSString).substring(with: NSRange(location: component.loc, length: component.len))
        XCTAssertTrue(after.contains(componentSource), "component bytes changed")
        XCTAssertNotEqual(before, after)
        screenshot("component-skipped")
    }

    func testComponentScrollsHorizontallyWithoutMovingText() throws {
        launch(docName("scroll"))
        let before = try state()
        let view = app.scrollViews["database-view"]
        XCTAssertTrue(view.waitForExistence(timeout: 5))
        // A held drag, as a finger would: XCUITest's fast swipe is kept as a
        // second attempt so the report can tell the two apart.
        let start = view.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5))
        let end = view.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5))
        start.press(forDuration: 0.1, thenDragTo: end, withVelocity: 600, thenHoldForDuration: 0.1)
        settle()
        let after = try state()
        XCTAssertEqual(after.dbCreated, before.dbCreated, "placeholder was recreated during the swipe")
        XCTAssertGreaterThan(after.dbOffsetX, 0, "placeholder did not scroll; hit view: \(after.dbHit), drags began on placeholder \(after.dbDragBegan - before.dbDragBegan), on text view \(after.textDragBegan - before.textDragBegan)")
        XCTAssertEqual(after.textOffsetY, before.textOffsetY, accuracy: 1, "text view scrolled with it")
        screenshot("component-scrolled")
    }

    // MARK: - R5 folding

    func testFoldHidesBodyAndSurvivesRemoteEdit() throws {
        let doc = docName("fold")
        launch(doc)
        var s = try state()
        let opener = try line(containing: "accordionOpen", s)
        let body = try XCTUnwrap(s.lines.first { $0.i == opener.i + 2 })  // "Paragraph inside the accordion."
        XCTAssertNotNil(body.rect)
        let serverBefore = try serverText(doc)

        tap(CGPoint(x: try XCTUnwrap(opener.rect).minX - 10, y: try XCTUnwrap(opener.rect).midY))
        settle()
        s = try state()
        XCTAssertEqual(s.folded, [opener.loc])
        XCTAssertNil(s.lines.first { $0.i == body.i }?.rect, "body still laid out while folded")
        XCTAssertEqual(try serverText(doc), serverBefore, "folding changed the text")
        screenshot("folded")

        try agentPatch(doc, find: "Paragraph inside the accordion.", replace: "Paragraph changed while folded.")
        settle(1.5)
        let serverAfter = try serverText(doc)
        XCTAssertTrue(serverAfter.contains("Paragraph changed while folded."))
        s = try state()
        XCTAssertEqual(s.textHash, sha256(serverAfter))
        XCTAssertTrue(s.viewMatchesDoc)

        let reopened = try line(containing: "accordionOpen", s)
        tap(CGPoint(x: try XCTUnwrap(reopened.rect).minX - 10, y: try XCTUnwrap(reopened.rect).midY))
        settle()
        s = try state()
        XCTAssertTrue(s.folded.isEmpty)
        XCTAssertNotNil(s.lines.first { $0.i == body.i }?.rect, "body not restored")
        XCTAssertEqual(s.textHash, sha256(try serverText(doc)))
        screenshot("unfolded-after-remote-edit")
    }
}
