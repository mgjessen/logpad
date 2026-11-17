import ObjectiveC
import UIKit
import UniformTypeIdentifiers
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(
            name: "Default",
            sessionRole: connectingSceneSession.role
        )
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = LogPadViewController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

final class LogPadViewController: UIViewController, WKScriptMessageHandler, WKUIDelegate, UIDocumentPickerDelegate {
    private var webView: WKWebView?
    private var bottomConstraint: NSLayoutConstraint?
    private var exporting = false

    override func viewDidLoad() {
        super.viewDidLoad()
        applyPageBackground()

        let contentController = WKUserContentController()
        contentController.add(self, name: "logpad")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.bouncesZoom = false
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        view.addSubview(webView)
        let bottom = webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        bottomConstraint = bottom
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            bottom,
        ])
        self.webView = webView
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardFrameChanged(_:)),
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil
        )
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (controller: LogPadViewController, _) in
            controller.applyPageBackground()
        }

        guard let resourceURL = Bundle.main.resourceURL,
              let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html")
        else {
            return
        }
        installInsetKeyboardBar(on: webView)
        webView.loadFileURL(htmlURL, allowingReadAccessTo: resourceURL)
    }

    private func installInsetKeyboardBar(on webView: WKWebView) {
        guard let contentView = webView.scrollView.subviews.first(where: {
            String(describing: type(of: $0)).contains("WKContent")
        }) else {
            return
        }
        if String(describing: type(of: contentView)).contains("LogPadInsetAccessory") {
            return
        }

        let assistant = (contentView as UIResponder).inputAssistantItem
        assistant.leadingBarButtonGroups = []
        assistant.trailingBarButtonGroups = []

        let selector = #selector(getter: UIResponder.inputAccessoryView)
        let subclass: AnyClass
        if let existing = NSClassFromString("LogPadInsetAccessory") {
            subclass = existing
        } else {
            guard let pair = objc_allocateClassPair(type(of: contentView), "LogPadInsetAccessory", 0),
                  let method = class_getInstanceMethod(
                    AccessoryProvider.self,
                    #selector(AccessoryProvider.inputAccessoryView)
                  )
            else {
                return
            }
            class_addMethod(pair, selector, method_getImplementation(method), method_getTypeEncoding(method))
            objc_registerClassPair(pair)
            subclass = pair
        }
        object_setClass(contentView, subclass)
        contentView.reloadInputViews()
    }

    @objc private func keyboardFrameChanged(_ notification: Notification) {
        guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
              let bottomConstraint
        else {
            return
        }
        if let webView {
            installInsetKeyboardBar(on: webView)
        }
        let end = view.convert(frame, from: nil)
        let keyboardHeight = max(0, view.bounds.maxY - end.minY)
        InsetKeyboardBar.shared.setClearOfHomeIndicator(keyboardHeight < 160)
        let overlap = max(0, keyboardHeight - view.safeAreaInsets.bottom)
        bottomConstraint.constant = -overlap
        let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25
        UIView.animate(withDuration: duration) {
            self.view.layoutIfNeeded()
        }
    }

    private func applyPageBackground() {
        if traitCollection.userInterfaceStyle == .dark {
            view.backgroundColor = UIColor(red: 28.0 / 255.0, green: 28.0 / 255.0, blue: 30.0 / 255.0, alpha: 1)
        } else {
            view.backgroundColor = UIColor(red: 245.0 / 255.0, green: 245.0 / 255.0, blue: 247.0 / 255.0, alpha: 1)
        }
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
        case "copy":
            UIPasteboard.general.string = body["text"] as? String ?? ""
        case "paste":
            let text = UIPasteboard.general.string ?? ""
            webView?.evaluateJavaScript("insertPastedText(\(jsLiteral(text)))")
        case "export":
            let text = body["text"] as? String ?? ""
            let filename = body["filename"] as? String ?? "logpad.txt"
            presentExport(filename: filename, text: text)
        case "import":
            presentImport()
        default:
            break
        }
    }

    private func presentExport(filename: String, text: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            showStatus("Could not save the file.")
            return
        }
        exporting = true
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = self
        present(picker, animated: true)
    }

    private func presentImport() {
        exporting = false
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.plainText], asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard !exporting, let url = urls.first else {
            if exporting, let name = urls.first?.lastPathComponent {
                showStatus("Saved \(name).")
            }
            return
        }

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
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "Replace", style: .destructive) { _ in
            completionHandler(true)
        })
        present(alert, animated: true)
    }

    private func showStatus(_ message: String) {
        webView?.evaluateJavaScript("showSaveStatus(\(jsLiteral(message)))")
    }
}

private final class InsetKeyboardBar: UIView {
    static let shared = InsetKeyboardBar()
    private let pill = UIView()
    private var bottomGap: NSLayoutConstraint?

    override init(frame: CGRect) {
        super.init(frame: CGRect(x: 0, y: 0, width: 320, height: 78))
        autoresizingMask = [.flexibleWidth]
        backgroundColor = .clear

        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.backgroundColor = .systemBackground
        pill.layer.cornerRadius = 22
        pill.layer.cornerCurve = .continuous
        pill.layer.borderWidth = 1 / UIScreen.main.scale
        addSubview(pill)

        let up = UIImageView(image: UIImage(systemName: "chevron.up"))
        let down = UIImageView(image: UIImage(systemName: "chevron.down"))
        for icon in [up, down] {
            icon.tintColor = .label
            icon.translatesAutoresizingMaskIntoConstraints = false
            icon.setContentHuggingPriority(.required, for: .horizontal)
            pill.addSubview(icon)
        }

        let done = UIButton(type: .system)
        done.setImage(UIImage(systemName: "checkmark"), for: .normal)
        done.tintColor = .label
        done.translatesAutoresizingMaskIntoConstraints = false
        done.addTarget(self, action: #selector(dismissKeyboard), for: .touchUpInside)
        pill.addSubview(done)

        let bottomGap = pill.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -30)
        self.bottomGap = bottomGap
        NSLayoutConstraint.activate([
            pill.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            pill.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            pill.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            bottomGap,

            up.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 22),
            up.centerYAnchor.constraint(equalTo: pill.centerYAnchor),
            down.leadingAnchor.constraint(equalTo: up.trailingAnchor, constant: 28),
            down.centerYAnchor.constraint(equalTo: pill.centerYAnchor),
            done.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -14),
            done.centerYAnchor.constraint(equalTo: pill.centerYAnchor),
            done.widthAnchor.constraint(equalToConstant: 44),
            done.heightAnchor.constraint(equalToConstant: 44),
        ])
    }

    required init?(coder: NSCoder) {
        nil
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: 78)
    }

    func setClearOfHomeIndicator(_ clear: Bool) {
        bottomGap?.constant = clear ? -30 : -6
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        pill.layer.borderColor = UIColor.separator.cgColor
    }

    @objc private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

private final class AccessoryProvider: NSObject {
    @objc func inputAccessoryView() -> UIView? {
        InsetKeyboardBar.shared
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
