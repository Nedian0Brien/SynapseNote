import Foundation
import JavaScriptCore

public enum EditingCoreError: Error, CustomStringConvertible {
    case bundleMissing
    case script(String)
    case decoding(String)

    public var description: String {
        switch self {
        case .bundleMissing:
            "synapsenote-editing.js is missing; run `bun run --filter @nedian0brien/synapsenote-core build:native-bundle`"
        case .script(let message): "editing bundle error: \(message)"
        case .decoding(let message): "editing bundle returned unexpected JSON: \(message)"
        }
    }
}

/// One JavaScriptCore context with the core editing bundle loaded.
///
/// A `JSContext` is not thread-safe, so the runtime and every session made
/// from it live on the main actor, where the text view calls them.
@MainActor
public final class EditingRuntime {
    let context: JSContext
    private var api: JSValue
    private var lastException: String?

    public convenience init() throws {
        guard let url = Bundle.module.url(forResource: "synapsenote-editing", withExtension: "js"),
              let script = try? String(contentsOf: url, encoding: .utf8)
        else { throw EditingCoreError.bundleMissing }
        try self.init(script: script, sourceURL: url)
    }

    init(script: String, sourceURL: URL?) throws {
        guard let context = JSContext() else { throw EditingCoreError.script("JSContext could not be created") }
        context.name = "SynapseEditing"
        self.context = context
        self.api = JSValue(undefinedIn: context)

        // JavaScriptCore has no console; some dependencies log through it.
        let log: @convention(block) () -> Void = {}
        let console = JSValue(newObjectIn: context)!
        for level in ["log", "debug", "info", "warn", "error", "trace"] {
            console.setObject(log, forKeyedSubscript: level as NSString)
        }
        context.setObject(console, forKeyedSubscript: "console" as NSString)

        context.exceptionHandler = { [weak self] _, exception in
            let message = exception?.toString() ?? "unknown exception"
            MainActor.assumeIsolated { self?.lastException = message }
        }
        context.evaluateScript(script, withSourceURL: sourceURL)
        if let error = takeException() { throw EditingCoreError.script(error) }
        let api = context.objectForKeyedSubscript("SynapseEditing")
        guard let api, !api.isUndefined else {
            throw EditingCoreError.script("the bundle did not define SynapseEditing")
        }
        self.api = api
    }

    /// The JSON shape version the bundle speaks (`native-entry.ts`).
    public var bundleVersion: Int { Int(api.forProperty("version").toInt32()) }

    public func makeSession(source: String) throws -> EditorSession {
        let value = try call(api, "createSession", [source])
        return EditorSession(runtime: self, value: value)
    }

    /// Layout of a whole source without keeping a session (tests, previews).
    public func computeLayout(_ source: String) throws -> Layout {
        try decode(Layout.self, from: call(api, "computeLayout", [source]))
    }

    func call(_ target: JSValue, _ method: String, _ arguments: [Any]) throws -> JSValue {
        let result = target.invokeMethod(method, withArguments: arguments)
        if let error = takeException() { throw EditingCoreError.script("\(method): \(error)") }
        guard let result else { throw EditingCoreError.script("\(method) returned nothing") }
        return result
    }

    func decode<T: Decodable>(_ type: T.Type, from value: JSValue) throws -> T {
        guard value.isString, let json = value.toString() else {
            throw EditingCoreError.decoding("expected a JSON string")
        }
        do {
            return try JSONDecoder().decode(T.self, from: Data(json.utf8))
        } catch {
            throw EditingCoreError.decoding(String(describing: error))
        }
    }

    private func takeException() -> String? {
        defer { lastException = nil }
        return lastException
    }
}
