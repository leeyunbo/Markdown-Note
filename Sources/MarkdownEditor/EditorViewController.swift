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

        // 컨테이너 뷰: WKWebView + (필요 시 attach되는) 이미지 미리보기 오버레이.
        // WKWebView를 view로 직접 쓰면 그 위에 sibling을 못 얹어 미리보기를 같은 layout에
        // 두기 어렵다.
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false
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
