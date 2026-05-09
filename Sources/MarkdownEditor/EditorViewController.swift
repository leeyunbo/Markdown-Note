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
        config.userContentController = userContent
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        // file:// 페이지에서 다른 file:// 경로(폴더 안 attachments/) 이미지 로드 허용.
        // 우리 페이지는 sandbox 격리된 WebKit 컨텐트 프로세스라 호스트 자원에 직접 접근 X.
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        web = WKWebView(frame: .zero, configuration: config)
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

        NotificationCenter.default.publisher(for: .outlineNavigateRequested)
            .receive(on: RunLoop.main)
            .sink { [weak self] note in
                if let lineIdx = note.object as? Int {
                    self?.scrollToLine(lineIdx)
                }
            }
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
        applyDocFolder(for: state.selectedFile)
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

    func scrollToLine(_ lineIdx: Int) {
        guard ready else { return }
        web.evaluateJavaScript("window.appBridge.scrollToLine(\(lineIdx));", completionHandler: nil)
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

// 외부 (Finder 등) 이미지 파일 드래그를 받기 위한 NSView. WKWebView가 자식이지만
// file URL drag는 자체 처리하지 않아 부모인 이 뷰가 NSDraggingDestination으로 받는다.
final class ImageDropContainerView: NSView {
    weak var controller: EditorViewController?
    private let imageExts: Set<String> = [
        "png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg",
    ]

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        return hasImageURLs(sender) ? .copy : []
    }

    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
        return hasImageURLs(sender) ? .copy : []
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        guard let urls = sender.draggingPasteboard.readObjects(
                forClasses: [NSURL.self], options: nil) as? [URL] else { return false }
        var handled = false
        for url in urls {
            let ext = url.pathExtension.lowercased()
            guard imageExts.contains(ext) else { continue }
            guard let data = try? Data(contentsOf: url) else { continue }
            controller?.acceptNativeImageDrop(data: data, name: url.lastPathComponent)
            handled = true
        }
        return handled
    }

    private func hasImageURLs(_ sender: NSDraggingInfo) -> Bool {
        guard let urls = sender.draggingPasteboard.readObjects(
                forClasses: [NSURL.self], options: nil) as? [URL] else { return false }
        return urls.contains { imageExts.contains($0.pathExtension.lowercased()) }
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
