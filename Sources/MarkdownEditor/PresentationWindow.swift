import AppKit
import WebKit

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

/// reveal.js로 현재 문서를 슬라이드로 띄우는 별도 NSWindow.
/// `---` 가 슬라이드 구분자, mouseWheel + 키보드 다 작동, 자동 풀스크린.
final class PresentationWindowController: NSWindowController, WKNavigationDelegate, WKScriptMessageHandler, NSWindowDelegate {
    private var web: WKWebView!
    private let markdown: String
    private let onClose: () -> Void
    private var pendingClose = false

    init(markdown: String, onClose: @escaping () -> Void) {
        self.markdown = markdown
        self.onClose = onClose
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered, defer: false)
        window.title = "Presentation"
        window.minSize = NSSize(width: 720, height: 480)
        window.collectionBehavior = [.fullScreenPrimary]
        super.init(window: window)
        window.delegate = self
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        guard let window else { return }
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        // 외부 reveal.js CDN을 위해 file://에서 cross-origin 허용
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        let userContent = WKUserContentController()
        userContent.add(self, name: "consoleLog")
        userContent.add(self, name: "closeRequest")
        config.userContentController = userContent
        web = ZoomableWebView(frame: .zero, configuration: config)
        web.allowsMagnification = true
        web.magnification = 1.0
        if #available(macOS 13.3, *) { web.isInspectable = true }
        web.navigationDelegate = self
        window.contentView = web
        if let url = Bundle.main.url(forResource: "presentation", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // backtick template literal에 markdown 박기 위해 \, ` , ${ 만 escape
        let escaped = markdown
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "`", with: "\\`")
            .replacingOccurrences(of: "${", with: "\\${")
        let js = "window.appBridge.setMarkdown(`\(escaped)`);"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        if message.name == "consoleLog", let text = message.body as? String {
            NSLog("[MD-PRESENT] %@", text)
        }
        if message.name == "closeRequest" {
            NSLog("[MD-PRESENT] closeRequest")
            closeFromESC()
        }
    }

    func windowWillClose(_ notification: Notification) {
        NSLog("[MD-PRESENT] windowWillClose — releasing")
        // WKUserContentController가 self를 retain하므로 명시적으로 끊어 controller deinit 보장
        let ucc = web.configuration.userContentController
        ucc.removeScriptMessageHandler(forName: "consoleLog")
        ucc.removeScriptMessageHandler(forName: "closeRequest")
        web.navigationDelegate = nil
        onClose()
    }

    private func closeFromESC() {
        guard let win = window else { return }
        if win.styleMask.contains(.fullScreen) {
            // 풀스크린 빠진 후 windowDidExitFullScreen에서 close (timing race 방지)
            pendingClose = true
            win.toggleFullScreen(nil)
        } else {
            win.close()
        }
    }

    func windowDidExitFullScreen(_ notification: Notification) {
        NSLog("[MD-PRESENT] exitFullScreen pending=\(pendingClose)")
        if pendingClose {
            pendingClose = false
            DispatchQueue.main.async { [weak self] in
                self?.window?.close()
            }
        }
    }

    func presentFullscreen() {
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        // 짧은 지연 후 풀스크린 — contentView attach 직후엔 불가능
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            self.window?.toggleFullScreen(nil)
        }
    }
}
