import AppKit
import SwiftUI
import Combine

/// fullSizeContentView + titlebarAppearsTransparent 환경에서 titlebar 영역에
/// paper 색을 깔되 클릭은 가로채지 않는 view. hitTest가 nil을 반환해 모든
/// 클릭이 부모(NSTitlebarContainerView)로 통과되고, 거기서 macOS 기본 titlebar
/// 드래그 처리가 작동한다. (draw와 hitTest는 별개라 색은 정상 표시.)
private final class DraggableTitlebarOverlay: NSView {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

/// NSSplitView의 divider 색을 우리 디자인 토큰(rgba(0,0,0,0.10))로 강제.
/// NSSplitViewController가 만든 splitView 인스턴스의 class를 런타임에 swap해서 적용한다.
private final class TonedSplitView: NSSplitView {
    override var dividerColor: NSColor { .clear }

    /// divider 인덱스별 색 분리:
    /// - sidebar↔editor (0): 0.10 — 사이드바는 다른 콘텐츠 영역, 명확한 경계
    /// - editor↔TOC (1+): 0.04 — TOC는 본문의 일부 같은 위계, 부드러운 경계
    override func drawDivider(in rect: NSRect) {
        let arranged = arrangedSubviews
        var idx = 0
        for i in 0..<max(arranged.count - 1, 0) {
            if abs(rect.minX - arranged[i].frame.maxX) < 2 { idx = i; break }
        }
        let alpha: CGFloat = (idx == 0) ? 0.10 : 0.04
        NSColor(srgbRed: 0, green: 0, blue: 0, alpha: alpha).setFill()
        rect.fill()
    }
}

@MainActor
final class MainWindowController: NSWindowController {
    let state: AppState
    private var splitVC: NSSplitViewController!
    private var sidebarItem: NSSplitViewItem!
    private var cancellables: Set<AnyCancellable> = []

    // 발표 모드: borderless 윈도우를 메뉴바 위 level로 띄운다 (가짜 풀스크린).
    // NSWindow.toggleFullScreen은 우리 split + WKWebView 환경에서 안정적이지 않아 회피.
    private var presentationWindow: NSWindow?

    init(state: AppState, frameAutosaveName: String? = nil) {
        self.state = state
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "Markdown Note"
        window.minSize = NSSize(width: 720, height: 480)
        window.isOpaque = true
        window.backgroundColor = state.theme.windowBg
        window.appearance = NSAppearance(named: .aqua)
        // autosave name은 default content rect를 적용한 직후, 화면에 표시되기 전에 set.
        // 그래야 saved frame이 default를 덮어쓰고 화면 표시는 saved frame 그대로 나온다.
        if let name = frameAutosaveName {
            window.setFrameAutosaveName(name)
        }
        super.init(window: window)
        // shouldCascadeWindows = true(default)면 showWindow 시점에 cascade가 saved frame을 옮긴다.
        shouldCascadeWindows = false
        setup()
        // window.contentViewController = splitVC가 splitVC.view의 fittingSize로 frame을 reset하므로
        // setup() 후 saved frame을 다시 강제 적용한다.
        if let name = frameAutosaveName {
            window.setFrameUsingName(name)
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        guard let window else { return }

        // Sidebar = SwiftUI(NSHostingController). 배경은 FolderSidebar 내부에서
        // theme.sidebarBgColor로 칠한다 → 테마 변경 시 자동 갱신.
        let sidebarHost = NSHostingController(
            rootView: FolderSidebar()
                .environmentObject(state)
        )
        sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebarHost)
        sidebarItem.minimumThickness = 200
        sidebarItem.maximumThickness = 280
        sidebarItem.canCollapse = true
        sidebarItem.holdingPriority = NSLayoutConstraint.Priority(rawValue: 250)
        sidebarItem.titlebarSeparatorStyle = .line

        // Main = AppKit (NSTextView 직접 호스팅, SwiftUI 합성 밖)
        let editor = EditorViewController(state: state)
        let editorItem = NSSplitViewItem(viewController: editor)
        editorItem.minimumThickness = 360

        splitVC = NSSplitViewController()
        splitVC.addSplitViewItem(sidebarItem)
        splitVC.addSplitViewItem(editorItem)
        splitVC.splitView.dividerStyle = .thin
        // Refract spec: "no file sidebar" — 폴더 선택 상태면 collapsed로 시작.
        // addSplitViewItem 이전에 set하면 무시되므로 여기서.
        if state.rootFolder != nil {
            sidebarItem.isCollapsed = true
        }
        // NSSplitViewController 내부 setup을 깨지 않고 divider 색만 바꾸려면
        // 인스턴스 클래스를 런타임에 swap (KVO와 동일한 메커니즘)
        object_setClass(splitVC.splitView, TonedSplitView.self)

        // Refract = 스파인/툴바 모두 제거. splitView 자체가 content. 헤더는 WebView 내부.
        window.contentViewController = splitVC

        // 이미지 미리보기는 EditorViewController 안에서 자체 처리한다 (에디터 영역만 차지).

        // 파일명 → window title (toolbar의 title view는 SwiftUI가 직접 binding)
        state.$selectedFile
            .receive(on: RunLoop.main)
            .sink { [weak self] url in
                let name = url?.deletingPathExtension().lastPathComponent ?? "Markdown Note"
                self?.window?.title = name
            }
            .store(in: &cancellables)

        // dirty 상태 → close 버튼 dot
        state.$isDirty
            .receive(on: RunLoop.main)
            .sink { [weak self] dirty in
                self?.window?.isDocumentEdited = dirty
            }
            .store(in: &cancellables)

        // 시스템 vibrant blur 제거 + 테마 색으로 titlebar/sidebar 칠하기.
        DispatchQueue.main.async { [weak self] in
            self?.killTitlebarVibrancy()
            self?.killSidebarVibrancy()
        }

        // 테마 변경 시 chrome 색 갱신.
        state.$theme
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.window?.backgroundColor = self?.state.theme.windowBg ?? .windowBackgroundColor
                self?.refreshTitlebarBg()
                self?.refreshSidebarBg()
            }
            .store(in: &cancellables)

        // 사이드바 자동 토글 (단축키 ⌘⇧D)
        NotificationCenter.default.publisher(for: .toggleSidebarRequested)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.toggleSidebar()
            }
            .store(in: &cancellables)

    }

    // MARK: - Presentation (borderless fake-fullscreen)

    /// ⌘⇧P — borderless 윈도우를 메뉴바 위 level로 화면 전체에 띄움. 진짜 풀스크린 X.
    /// 이미 떠 있으면 markdown만 갱신.
    func showPresentation(markdown: String, docFolder: URL?) {
        NSLog("[MD-PRESENT] showPresentation — existing=\(presentationWindow == nil ? "nil" : "exists")")
        if let existing = presentationWindow,
           let overlay = existing.contentView as? PresentationOverlayView {
            overlay.update(markdown: markdown, docFolder: docFolder)
            existing.makeKeyAndOrderFront(nil)
            return
        }
        let screen = window?.screen ?? NSScreen.main ?? NSScreen.screens.first
        let frame = screen?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let win = PresentationKeyWindow(
            contentRect: frame,
            styleMask: [.borderless],
            backing: .buffered, defer: false)
        win.isReleasedWhenClosed = false
        win.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 1)
        win.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        win.backgroundColor = .white
        win.isOpaque = true
        win.hasShadow = false
        let overlay = PresentationOverlayView { [weak self] in
            self?.hidePresentation()
        }
        overlay.frame = NSRect(origin: .zero, size: frame.size)
        overlay.autoresizingMask = [.width, .height]
        win.contentView = overlay
        overlay.update(markdown: markdown, docFolder: docFolder)
        presentationWindow = win
        win.makeKeyAndOrderFront(nil)
    }

    /// ESC → 발표 윈도우 닫고 메인 윈도우로 key 복귀.
    func hidePresentation() {
        guard let win = presentationWindow else { return }
        NSLog("[MD-PRESENT] hidePresentation")
        if let overlay = win.contentView as? PresentationOverlayView {
            overlay.cleanup()
        }
        win.orderOut(nil)
        presentationWindow = nil
        // 메인 윈도우로 key 복귀
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if let split = splitVC, split.splitViewItems.count >= 2 {
            window?.makeFirstResponder(split.splitViewItems[1].viewController.view)
        }
    }

    /// macOS Big Sur+에서 titlebar/toolbar 영역에 자동으로 깔리는 NSVisualEffectView를
    /// 평면 단색으로 바꾼다. titlebarAppearsTransparent + window.backgroundColor만으로는
    /// 호버 시에만 backgroundColor가 살짝 비치는 문제가 있어 view tree에서 직접 손본다.
    /// NSTitlebarView 안의 NSVisualEffectView가 vibrant blur를 그린다 → 제거.
    /// 단 fullSizeContentView 때문에 contentView가 titlebar 영역까지 확장되므로,
    /// vfx 제거 후 NSTitlebarContainerView에 단색 background NSView를 깔아 가려준다.
    private func killTitlebarVibrancy() {
        guard let window else { return }
        guard let themeFrame = window.contentView?.superview else { return }
        let contentView = window.contentView
        for sv in themeFrame.subviews where sv !== contentView {
            removeVibrancyRecursive(sv)
        }
        installTitlebarBackground(in: themeFrame)
    }

    private func removeVibrancyRecursive(_ view: NSView) {
        for sub in view.subviews {
            removeVibrancyRecursive(sub)
        }
        if let vfx = view as? NSVisualEffectView {
            vfx.removeFromSuperview()
        }
    }

    /// 사이드바 vfx 무효화 + 테마 색으로 칠하기.
    private func killSidebarVibrancy() {
        guard let sidebarView = sidebarItem?.viewController.view else { return }
        var node: NSView? = sidebarView.superview
        while let n = node {
            for sub in n.subviews {
                if let vfx = sub as? NSVisualEffectView {
                    vfx.material = .windowBackground
                    vfx.state = .inactive
                    vfx.blendingMode = .withinWindow
                    vfx.isEmphasized = false
                }
            }
            if String(describing: type(of: n)).contains("NSSplitView") { break }
            node = n.superview
        }
        sidebarView.wantsLayer = true
        refreshSidebarBg()
    }

    private func refreshSidebarBg() {
        let cg = state.theme.sidebarBg.cgColor
        guard let sidebarView = sidebarItem?.viewController.view else { return }
        var node: NSView? = sidebarView.superview
        while let n = node {
            for sub in n.subviews {
                if let vfx = sub as? NSVisualEffectView {
                    vfx.layer?.backgroundColor = cg
                }
            }
            if String(describing: type(of: n)).contains("NSSplitView") { break }
            node = n.superview
        }
        sidebarView.layer?.backgroundColor = cg
    }

    private static let titlebarBgIdentifier = NSUserInterfaceItemIdentifier("md-titlebar-bg")

    private func installTitlebarBackground(in themeFrame: NSView) {
        for sv in themeFrame.subviews {
            let cls = String(describing: type(of: sv))
            guard cls.contains("NSTitlebarContainer") else { continue }
            if sv.subviews.contains(where: { $0.identifier == Self.titlebarBgIdentifier }) {
                return
            }
            let bg = DraggableTitlebarOverlay(frame: sv.bounds)
            bg.identifier = Self.titlebarBgIdentifier
            bg.wantsLayer = true
            bg.layer?.backgroundColor = state.theme.windowBg.cgColor
            bg.autoresizingMask = [.width, .height]
            if let first = sv.subviews.first {
                sv.addSubview(bg, positioned: .below, relativeTo: first)
            } else {
                sv.addSubview(bg)
            }
            return
        }
    }

    private func refreshTitlebarBg() {
        guard let themeFrame = window?.contentView?.superview else { return }
        for sv in themeFrame.subviews {
            let cls = String(describing: type(of: sv))
            guard cls.contains("NSTitlebarContainer") else { continue }
            for child in sv.subviews where child.identifier == Self.titlebarBgIdentifier {
                child.layer?.backgroundColor = state.theme.windowBg.cgColor
            }
        }
    }

    @objc func toggleSidebar() {
        guard let item = sidebarItem else { return }
        item.animator().isCollapsed.toggle()
    }


    @objc func openFolder() { state.pickFolder() }
    @objc func newFile() { state.newFile() }
    @objc func saveFile() { state.saveCurrent() }
}

extension Notification.Name {
    static let toggleSidebarRequested = Notification.Name("toggleSidebarRequested")
    static let outlineNavigateRequested = Notification.Name("outlineNavigateRequested")
    static let openSearchRequested = Notification.Name("openSearchRequested")
}
