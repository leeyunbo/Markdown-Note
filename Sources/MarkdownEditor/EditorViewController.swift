import AppKit
import WebKit
import Combine

@MainActor
final class EditorViewController: NSViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private let state: AppState
    private var web: WKWebView!
    private var cancellables: Set<AnyCancellable> = []
    private var ready = false
    private var pendingText: String?
    private var lastAppliedText: String = ""

    init(state: AppState) {
        self.state = state
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        let config = WKWebViewConfiguration()
        let userContent = WKUserContentController()
        userContent.add(self, name: "textChanged")
        config.userContentController = userContent
        config.preferences.javaScriptCanOpenWindowsAutomatically = false

        web = WKWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground")
        web.navigationDelegate = self
        web.allowsBackForwardNavigationGestures = false

        loadEditorPage()
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        state.$documentText
            .receive(on: RunLoop.main)
            .sink { [weak self] text in
                self?.applyText(text)
            }
            .store(in: &cancellables)

        state.$theme
            .receive(on: RunLoop.main)
            .sink { [weak self] theme in
                self?.applyTheme(theme)
            }
            .store(in: &cancellables)
    }

    private func loadEditorPage() {
        guard let url = Bundle.module.url(forResource: "editor", withExtension: "html") else {
            web.loadHTMLString("<h1>editor.html missing</h1>", baseURL: nil)
            return
        }
        web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready = true
        applyTheme(state.theme)
        applyText(pendingText ?? state.documentText)
        pendingText = nil
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // MARK: - JS bridge

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "textChanged",
              let text = message.body as? String else { return }
        // 사용자 입력 → 같은 텍스트가 setText로 다시 안 들어가도록 lastAppliedText 갱신
        lastAppliedText = text
        state.textChanged(text)
    }

    private func applyText(_ text: String) {
        guard ready else { pendingText = text; return }
        if text == lastAppliedText { return }
        lastAppliedText = text
        let payload = jsString(text)
        web.evaluateJavaScript("window.appBridge.setText(\(payload));", completionHandler: nil)
    }

    private func applyTheme(_ theme: Theme) {
        guard ready else { return }
        let vars: [String: String] = [
            "bg": theme.cssColor(theme.editorBackgroundNS),
            "fg": theme.cssColor(theme.foregroundNS),
            "marker": theme.cssColor(theme.markerNS),
            "secondary": theme.cssColor(theme.secondaryNS),
            "code-bg": theme.cssColor(theme.codeBackgroundNS),
            "code-fg": theme.cssColor(theme.codeForegroundNS),
            "link": theme.cssColor(theme.linkNS),
            "list": theme.cssColor(theme.listMarkerNS),
        ]
        let json = (try? JSONSerialization.data(withJSONObject: vars))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        web.evaluateJavaScript("window.appBridge.setTheme(\(json));", completionHandler: nil)
    }

    private func jsString(_ s: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: [s], options: [])) ?? Data("[\"\"]".utf8)
        let arr = String(data: data, encoding: .utf8) ?? "[\"\"]"
        // arr like ["..."] → strip brackets
        return String(arr.dropFirst().dropLast())
    }
}

extension Theme {
    func cssColor(_ ns: NSColor) -> String {
        let rgb = ns.usingColorSpace(.sRGB) ?? ns
        let r = Int(round(rgb.redComponent * 255))
        let g = Int(round(rgb.greenComponent * 255))
        let b = Int(round(rgb.blueComponent * 255))
        let a = rgb.alphaComponent
        if a >= 0.999 {
            return String(format: "#%02x%02x%02x", r, g, b)
        }
        return "rgba(\(r),\(g),\(b),\(a))"
    }
}
