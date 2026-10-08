import Cocoa
import WebKit
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKUIDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let contentController = WKUserContentController()
        contentController.add(self, name: "logpad")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = self
        self.webView = webView

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 760, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "LogPad"
        window.minSize = NSSize(width: 520, height: 640)
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window

        guard let resourceURL = Bundle.main.resourceURL,
              let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html")
        else {
            return
        }

        webView.loadFileURL(htmlURL, allowingReadAccessTo: resourceURL)
        if let iconURL = Bundle.main.url(forResource: "icon", withExtension: "png"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = icon
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "logpad",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String
        else {
            return
        }

        switch action {
        case "export":
            let text = body["text"] as? String ?? ""
            let filename = body["filename"] as? String ?? "logpad.txt"
            presentSavePanel(filename: filename, text: text)
        case "import":
            DispatchQueue.main.async { [weak self] in
                self?.presentOpenPanel()
            }
        default:
            break
        }
    }

    private func presentSavePanel(filename: String, text: String) {
        guard let window else { return }

        let panel = NSSavePanel()
        panel.title = "Export log"
        panel.nameFieldStringValue = filename
        panel.allowedContentTypes = [.plainText]
        panel.allowsOtherFileTypes = true
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            do {
                try text.write(to: url, atomically: true, encoding: .utf8)
                self?.showStatus("Saved \(url.lastPathComponent).")
            } catch {
                self?.showStatus("Could not save the file.")
            }
        }
    }

    private func presentOpenPanel() {
        let panel = NSOpenPanel()
        panel.title = "Import log"
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.plainText]

        NSApp.activate(ignoringOtherApps: true)
        guard panel.runModal() == .OK, let url = panel.url else { return }

        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let text = try String(contentsOf: url, encoding: .utf8)
            webView?.evaluateJavaScript("applyImportedLog(\(jsLiteral(text)))") { [weak self] _, error in
                if error != nil {
                    self?.showStatus("Could not import that file.")
                }
            }
        } catch {
            showStatus("Could not read that file.")
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Replace")
        alert.addButton(withTitle: "Cancel")

        guard let window else {
            completionHandler(alert.runModal() == .alertFirstButtonReturn)
            return
        }

        alert.beginSheetModal(for: window) { response in
            completionHandler(response == .alertFirstButtonReturn)
        }
    }

    private func showStatus(_ message: String) {
        webView?.evaluateJavaScript("showSaveStatus(\(jsLiteral(message)))")
    }
}

private func jsLiteral(_ value: String) -> String {
    guard let data = try? JSONEncoder().encode(value),
          let encoded = String(data: data, encoding: .utf8)
    else {
        return "\"\""
    }
    return encoded
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
