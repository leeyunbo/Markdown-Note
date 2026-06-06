import AppKit
import SwiftUI
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

    private var imagePreviewHost: NSView?

    override func loadView() {
        let config = WKWebViewConfiguration()
        let userContent = WKUserContentController()
        userContent.add(self, name: "textChanged")
        userContent.add(self, name: "imageDropped")
        userContent.add(self, name: "consoleLog")
        userContent.add(self, name: "cursorLine")
        // console.log를 Swift NSLog로 forward (inspector 없이 디버깅용)
        let logScript = WKUserScript(source: """
            (function() {
              const orig = console.log;
              console.log = function(...args) {
                orig.apply(console, args);
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.consoleLog) {
                  try {
                    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                    window.webkit.messageHandlers.consoleLog.postMessage(msg);
                  } catch (e) {}
                }
              };
            })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        userContent.addUserScript(logScript)
        config.userContentController = userContent
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        // file:// 페이지에서 다른 file:// 경로(폴더 안 attachments/) 이미지 로드 허용.
        // 우리 페이지는 sandbox 격리된 WebKit 컨텐트 프로세스라 호스트 자원에 직접 접근 X.
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        let dragWeb = DragForwardingWebView(frame: .zero, configuration: config)
        dragWeb.controller = self
        dragWeb.registerForDraggedTypes([.fileURL])  // file URL drop 받기 위해 명시적으로
        web = dragWeb
        web.setValue(false, forKey: "drawsBackground")
        web.navigationDelegate = self
        web.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) {
            web.isInspectable = true
        }

        loadEditorPage()

        // 컨테이너 뷰: WKWebView + 미리보기 오버레이 + 외부 file 드래그 수신.
        // WKWebView 내 JS drop 이벤트는 macOS에서 file URL drag를 안정적으로 잡지 못해
        // (capture phase로도 차단), Swift 쪽 NSDraggingDestination으로 처리한다.
        let container = ImageDropContainerView()
        container.controller = self
        container.translatesAutoresizingMaskIntoConstraints = false
        container.registerForDraggedTypes([.fileURL])
        web.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            web.topAnchor.constraint(equalTo: container.topAnchor),
            web.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        view = container
    }

    func acceptNativeImageDrop(data: Data, name: String) {
        handleImageData(data: data, suggestedName: name)
    }

    /// 드래그된 file URL을 종류별로 분기:
    /// - 이미지: attachments/ 안이면 link만, 외부면 복사 후 link
    /// - .md: 새 창에서 열기
    /// - 기타: 무시
    func acceptDroppedFileURL(_ url: URL) {
        let ext = url.pathExtension.lowercased()
        let imageExts: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg"]
        if imageExts.contains(ext) {
            if state.isInsideAttachments(url) {
                insertImageLinkForExisting(url)
            } else {
                guard let data = try? Data(contentsOf: url) else { return }
                handleImageData(data: data, suggestedName: url.lastPathComponent)
            }
        } else if ext == "md" || ext == "markdown" {
            AppDelegate.shared?.openNewWindow(with: url)
        }
    }

    private func insertImageLinkForExisting(_ url: URL) {
        let relPath = state.markdownLinkPath(for: url)
        let urlEncoded = relPath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? relPath
        let alt = url.deletingPathExtension().lastPathComponent
        let escaped = urlEncoded.replacingOccurrences(of: "\\", with: "\\\\")
                                .replacingOccurrences(of: "\"", with: "\\\"")
        let escapedAlt = alt.replacingOccurrences(of: "\\", with: "\\\\")
                            .replacingOccurrences(of: "\"", with: "\\\"")
        web.evaluateJavaScript(
            "window.appBridge.insertImage(\"\(escapedAlt)\", \"\(escaped)\");",
            completionHandler: nil)
    }

    private func handleImageData(data: Data, suggestedName: String) {
        guard let relPath = state.saveDroppedImage(data: data, suggestedName: suggestedName) else {
            return
        }
        let urlEncoded = relPath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
            ?? relPath
        let alt = (suggestedName as NSString).deletingPathExtension
        let escaped = urlEncoded.replacingOccurrences(of: "\\", with: "\\\\")
                                .replacingOccurrences(of: "\"", with: "\\\"")
        let escapedAlt = alt.replacingOccurrences(of: "\\", with: "\\\\")
                            .replacingOccurrences(of: "\"", with: "\\\"")
        web.evaluateJavaScript(
            "window.appBridge.insertImage(\"\(escapedAlt)\", \"\(escaped)\");",
            completionHandler: nil)
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        state.$selectedFile
            .receive(on: RunLoop.main)
            .sink { [weak self] url in
                self?.applyDocFolder(for: url)
            }
            .store(in: &cancellables)

        state.$selectedFileMtime
            .receive(on: RunLoop.main)
            .sink { [weak self] date in
                self?.applyDocDate(date)
            }
            .store(in: &cancellables)

        state.$documentText
            .receive(on: RunLoop.main)
            .sink { [weak self] text in
                self?.applyText(text)
            }
            .store(in: &cancellables)

        state.$documentResetTick
            .dropFirst()  // 초기값(0)은 무시
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.resetEditor(text: self?.state.documentText ?? "")
            }
            .store(in: &cancellables)

        state.$theme
            .receive(on: RunLoop.main)
            .sink { [weak self] theme in
                self?.applyTheme(theme)
            }
            .store(in: &cancellables)

        state.$editorFont
            .receive(on: RunLoop.main)
            .sink { [weak self] font in
                self?.applyEditorFont(font)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .outlineNavigateRequested)
            .receive(on: RunLoop.main)
            .sink { [weak self] note in
                if let lineIdx = note.object as? Int {
                    self?.scrollToLine(lineIdx)
                }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .openSearchRequested)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.openSearch() }
            .store(in: &cancellables)

        state.$previewImageURL
            .receive(on: RunLoop.main)
            .sink { [weak self] url in
                guard let self else { return }
                if url != nil {
                    self.attachImagePreview()
                } else {
                    self.detachImagePreview()
                }
            }
            .store(in: &cancellables)
    }

    private func attachImagePreview() {
        guard imagePreviewHost == nil else { return }
        let host = NSHostingView(rootView:
            ImagePreviewOverlay().environmentObject(state)
        )
        host.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host, positioned: .above, relativeTo: nil)
        NSLayoutConstraint.activate([
            host.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.topAnchor.constraint(equalTo: view.topAnchor),
            host.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        imagePreviewHost = host
    }

    private func detachImagePreview() {
        imagePreviewHost?.removeFromSuperview()
        imagePreviewHost = nil
    }

    private func loadEditorPage() {
        // build.sh로 묶인 .app 번들의 Resources/editor.html을 사용. SwiftPM의
        // 자동 생성 Bundle.module은 .bundle 디렉토리를 요구하는데 우리 빌드는
        // 평면 Resources/이므로 그 경로를 직접 쓴다.
        guard let url = Bundle.main.url(forResource: "editor", withExtension: "html") else {
            web.loadHTMLString("<h1>editor.html missing</h1>", baseURL: nil)
            return
        }
        // allowingReadAccessTo는 한 폴더만 받는다. Resources/만 허용하면 attachments/
        // 처럼 외부 폴더의 이미지를 로드할 수 없으므로 / 를 허용해 file:// 접근 폭을 연다.
        web.loadFileURL(url, allowingReadAccessTo: URL(fileURLWithPath: "/"))
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready = true
        applyTheme(state.theme)
        applyEditorFont(state.editorFont)
        applyDocFolder(for: state.selectedFile)
        applyDocDate(state.selectedFileMtime)
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
        if message.name == "textChanged", let text = message.body as? String {
            // 사용자 입력 → 같은 텍스트가 setText로 다시 안 들어가도록 lastAppliedText 갱신
            lastAppliedText = text
            state.textChanged(text)
            return
        }
        if message.name == "imageDropped",
           let dict = message.body as? [String: Any],
           let dataURL = dict["dataURL"] as? String,
           let name = dict["name"] as? String {
            handleImageDrop(dataURL: dataURL, suggestedName: name)
            return
        }
        if message.name == "consoleLog", let text = message.body as? String {
            NSLog("[MD-JS] %@", text)
            return
        }
        if message.name == "cursorLine", let line = message.body as? Int {
            updateActiveOutlineIndex(forCursorLine: line)
            return
        }
    }

    /// cursor line 기준으로 outline 안에서 가장 가까운(같거나 앞선) 헤딩 인덱스를 찾는다.
    private func updateActiveOutlineIndex(forCursorLine line: Int) {
        let outline = state.outline
        guard !outline.isEmpty else {
            if state.activeOutlineIndex != nil { state.activeOutlineIndex = nil }
            return
        }
        var found: Int? = nil
        for (i, h) in outline.enumerated() {
            if h.lineIdx <= line { found = i } else { break }
        }
        if state.activeOutlineIndex != found { state.activeOutlineIndex = found }
    }

    private func handleImageDrop(dataURL: String, suggestedName: String) {
        guard let comma = dataURL.firstIndex(of: ",") else { return }
        let base64 = String(dataURL[dataURL.index(after: comma)...])
        guard let data = Data(base64Encoded: base64) else { return }
        guard let relPath = state.saveDroppedImage(data: data, suggestedName: suggestedName) else {
            return
        }
        // 마크다운 링크의 path에선 공백/괄호가 파싱을 깨므로 percent-encode.
        // urlPathAllowed에 '/' 는 포함되어 있어 디렉토리 구분은 보존된다.
        let urlEncoded = relPath
            .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
            ?? relPath
        let escaped = urlEncoded.replacingOccurrences(of: "\\", with: "\\\\")
                                .replacingOccurrences(of: "\"", with: "\\\"")
        let alt = (suggestedName as NSString).deletingPathExtension
        let escapedAlt = alt.replacingOccurrences(of: "\\", with: "\\\\")
                            .replacingOccurrences(of: "\"", with: "\\\"")
        web.evaluateJavaScript(
            "window.appBridge.insertImage(\"\(escapedAlt)\", \"\(escaped)\");",
            completionHandler: nil)
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
        // Refract: data-theme = enum rawValue (night/day/sepia/forest/paper).
        // CSS :root[data-theme="..."] 블록이 모든 토큰을 갈아끼움. 추가로
        // setTheme()으로 JS 측에서도 토큰 dict 받아 fallback / runtime 참조 가능.
        let vars = theme.cssVars
        let json = (try? JSONSerialization.data(withJSONObject: vars))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let setDataTheme = "document.documentElement.setAttribute('data-theme', '\(theme.rawValue)');"
        web.evaluateJavaScript(
            "\(setDataTheme) if (window.appBridge && window.appBridge.setTheme) window.appBridge.setTheme(\(json));",
            completionHandler: nil
        )
    }

    private func applyEditorFont(_ font: EditorFont) {
        guard ready else { return }
        let escaped = font.cssFontFamily.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        web.evaluateJavaScript("window.appBridge.setFontFamily(\"\(escaped)\");", completionHandler: nil)
    }

    /// 우상단 date stamp를 현재 파일 mtime으로 갱신. nil이면 stamp 숨김.
    /// 포맷은 JS 측에서 Intl.DateTimeFormat("en-US")으로 "Mon · 1 Jun" 식으로.
    private func applyDocDate(_ date: Date?) {
        guard ready else { return }
        let iso = date.map { ISO8601DateFormatter().string(from: $0) } ?? ""
        let escaped = iso.replacingOccurrences(of: "\"", with: "\\\"")
        web.evaluateJavaScript(
            "if (window.appBridge && window.appBridge.setDocDate) window.appBridge.setDocDate(\"\(escaped)\");",
            completionHandler: nil
        )
    }

    func scrollToLine(_ lineIdx: Int) {
        guard ready else { return }
        web.evaluateJavaScript("window.appBridge.scrollToLine(\(lineIdx));", completionHandler: nil)
    }

    func openSearch() {
        guard ready else { return }
        web.evaluateJavaScript("window.appBridge.openSearch();", completionHandler: nil)
    }

    private func resetEditor(text: String) {
        guard ready else { return }
        let payload = jsString(text)
        web.evaluateJavaScript("window.appBridge.resetEditor(\(payload));", completionHandler: nil)
    }

    private func applyDocFolder(for url: URL?) {
        guard ready else { return }
        let folderURL: String
        if let u = url {
            // 마크다운 파일이 들어있는 디렉토리. 끝에 / 붙여서 상대경로 base.
            let dir = u.deletingLastPathComponent().standardizedFileURL.absoluteString
            folderURL = dir.hasSuffix("/") ? dir : dir + "/"
        } else {
            folderURL = ""
        }
        let payload = jsString(folderURL)
        web.evaluateJavaScript("window.appBridge.setDocFolder(\(payload));", completionHandler: nil)
    }

    private func jsString(_ s: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: [s], options: [])) ?? Data("[\"\"]".utf8)
        let arr = String(data: data, encoding: .utf8) ?? "[\"\"]"
        // arr like ["..."] → strip brackets
        return String(arr.dropFirst().dropLast())
    }
}

private let editorAcceptedExts: Set<String> = [
    "png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg",
    "md", "markdown",
]

private func acceptableURLs(from info: NSDraggingInfo) -> [URL] {
    guard let urls = info.draggingPasteboard.readObjects(
            forClasses: [NSURL.self], options: nil) as? [URL] else { return [] }
    return urls.filter { editorAcceptedExts.contains($0.pathExtension.lowercased()) }
}

// WKWebView 위에서 drop이 일어나면 hit test상 우리 container까지 안 가므로
// WKWebView 자체가 file URL drop을 받아 controller에 위임.
final class DragForwardingWebView: WKWebView {
    weak var controller: EditorViewController?

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        if !acceptableURLs(from: sender).isEmpty { return .copy }
        return super.draggingEntered(sender)
    }

    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
        if !acceptableURLs(from: sender).isEmpty { return .copy }
        return super.draggingUpdated(sender)
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let urls = acceptableURLs(from: sender)
        if !urls.isEmpty, let ctrl = controller {
            for url in urls {
                ctrl.acceptDroppedFileURL(url)
            }
            return true
        }
        return super.performDragOperation(sender)
    }
}

// 컨테이너는 fallback (WKWebView 외부 영역에 drop 떨어지는 경우)
final class ImageDropContainerView: NSView {
    weak var controller: EditorViewController?

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        return acceptableURLs(from: sender).isEmpty ? [] : .copy
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let urls = acceptableURLs(from: sender)
        guard !urls.isEmpty, let ctrl = controller else { return false }
        for url in urls {
            ctrl.acceptDroppedFileURL(url)
        }
        return true
    }
}

// Theme.cssColor 헬퍼는 Theme.swift의 NSColor.cssString 확장으로 대체됨.
