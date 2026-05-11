import AppKit
import WebKit

/// borderless NSWindow는 기본적으로 key/main이 안 됨. JS keydown ESC를 받기 위해
/// WKWebView가 first responder가 되도록 override.
final class PresentationKeyWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

/// ⌘+wheel = magnification 변경. 일반 wheel은 super (스크롤).
final class ZoomableWebView: WKWebView {
    override func scrollWheel(with event: NSEvent) {
        if event.modifierFlags.contains(.command) {
            let delta = event.scrollingDeltaY
            let factor = 1.0 + delta * 0.01
            let new = max(0.4, min(4.0, magnification * CGFloat(factor)))
            magnification = new
        } else {
            super.scrollWheel(with: event)
        }
    }
}

/// 메인 윈도우 contentView 위에 깔리는 발표용 overlay.
/// 별도 NSWindow를 띄우지 않아 풀스크린 transition race가 발생하지 않는다.
/// ⌘⇧P → MainWindowController가 이 view를 contentView에 add + 풀스크린 진입.
/// ESC → JS가 closeRequest 보내면 onClose 호출 → MainWindowController가 hide + 풀스크린 해제.
final class PresentationOverlayView: NSView, WKNavigationDelegate, WKScriptMessageHandler {
    private(set) var web: ZoomableWebView!
    private var markdown: String = ""
    private var docFolderURL: String = ""
    /// HTML 로드 완료 후 한 번이라도 markdown을 주입했는지.
    private var pageLoaded = false
    let onClose: () -> Void

    init(onClose: @escaping () -> Void) {
        self.onClose = onClose
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor.white.cgColor
        setupWebView()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        let ucc = WKUserContentController()
        ucc.add(self, name: "consoleLog")
        ucc.add(self, name: "closeRequest")
        config.userContentController = ucc
        web = ZoomableWebView(frame: bounds, configuration: config)
        web.allowsMagnification = true
        web.magnification = 1.0
        if #available(macOS 13.3, *) { web.isInspectable = true }
        web.navigationDelegate = self
        web.autoresizingMask = [.width, .height]
        addSubview(web)
        if let url = Bundle.main.url(forResource: "presentation", withExtension: "html") {
            let scope = FileManager.default.homeDirectoryForCurrentUser
            web.loadFileURL(url, allowingReadAccessTo: scope)
        }
    }

    /// MainWindowController가 호출 — 발표 시작/갱신.
    func update(markdown: String, docFolder: URL?) {
        self.markdown = markdown
        self.docFolderURL = Self.makeDocFolderURL(docFolder)
        if pageLoaded { injectMarkdown() }
    }

    /// MainWindowController가 hide 시점에 호출 — WKUserContentController가 self를 strong retain 하므로
    /// 명시적으로 끊지 않으면 deinit 안 됨.
    func cleanup() {
        let ucc = web.configuration.userContentController
        ucc.removeScriptMessageHandler(forName: "consoleLog")
        ucc.removeScriptMessageHandler(forName: "closeRequest")
        web.navigationDelegate = nil
    }

    deinit { NSLog("[MD-PRESENT] overlay deinit") }

    private static func makeDocFolderURL(_ url: URL?) -> String {
        guard let url else { return "" }
        var s = url.absoluteString
        if !s.hasSuffix("/") { s += "/" }
        return s
    }

    private func injectMarkdown() {
        let escaped = markdown
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "`", with: "\\`")
            .replacingOccurrences(of: "${", with: "\\${")
        let escapedFolder = docFolderURL
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "`", with: "\\`")
        let js = "window.appBridge.setMarkdown(`\(escaped)`, `\(escapedFolder)`);"
        web.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        injectMarkdown()
    }

    // MARK: WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case "consoleLog":
            if let text = message.body as? String { NSLog("[MD-PRESENT] %@", text) }
        case "closeRequest":
            NSLog("[MD-PRESENT] closeRequest")
            onClose()
        default: break
        }
    }
}
