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
final class MainWindowController: NSWindowController, NSToolbarDelegate {
    let state: AppState
    private var splitVC: NSSplitViewController!
    private var sidebarItem: NSSplitViewItem!
    private var cancellables: Set<AnyCancellable> = []

    private weak var titlebarSeparator: NSView?

    // 발표 모드: borderless 윈도우를 메뉴바 위 level로 띄운다 (가짜 풀스크린).
    // NSWindow.toggleFullScreen은 우리 split + WKWebView 환경에서 안정적이지 않아 회피.
    private var presentationWindow: NSWindow?

    init(state: AppState, frameAutosaveName: String? = nil) {
        self.state = state
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "Markdown Note"
        window.minSize = NSSize(width: 720, height: 480)
        window.isOpaque = true
        window.backgroundColor = NSColor(srgbRed: 253.0/255, green: 251.0/255, blue: 245.0/255, alpha: 1)
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

        // Sidebar = SwiftUI(NSHostingController)
        // NSToolbar의 sidebarTrackingSeparator가 작동하려면 sidebarWithViewController 필요.
        // 자동 vibrant blur는 setup 끝에 view tree에서 vfx removeFromSuperview로 제거.
        let sidebarBg = Color(red: 245.0/255, green: 245.0/255, blue: 247.0/255)
        let sidebarHost = NSHostingController(
            rootView: FolderSidebar()
                .environmentObject(state)
                .background(sidebarBg)
        )
        sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebarHost)
        sidebarItem.minimumThickness = 200
        sidebarItem.maximumThickness = 360
        sidebarItem.canCollapse = true
        sidebarItem.holdingPriority = NSLayoutConstraint.Priority(rawValue: 250)
        // toolbar 영역에서 sidebar boundary에 1px line 자동 표시
        sidebarItem.titlebarSeparatorStyle = .line

        // Main = AppKit (NSTextView 직접 호스팅, SwiftUI 합성 밖)
        let editor = EditorViewController(state: state)
        let editorItem = NSSplitViewItem(viewController: editor)
        editorItem.minimumThickness = 360

        splitVC = NSSplitViewController()
        splitVC.addSplitViewItem(sidebarItem)
        splitVC.addSplitViewItem(editorItem)
        splitVC.splitView.dividerStyle = .thin
        // NSSplitViewController 내부 setup을 깨지 않고 divider 색만 바꾸려면
        // 인스턴스 클래스를 런타임에 swap (KVO와 동일한 메커니즘)
        object_setClass(splitVC.splitView, TonedSplitView.self)

        let container = NSView()
        let spine = SpineView()
        spine.translatesAutoresizingMaskIntoConstraints = false
        let splitView = splitVC.view
        splitView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(spine)
        container.addSubview(splitView)
        NSLayoutConstraint.activate([
            spine.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            spine.topAnchor.constraint(equalTo: container.topAnchor),
            spine.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            spine.widthAnchor.constraint(equalToConstant: 52),
            splitView.leadingAnchor.constraint(equalTo: spine.trailingAnchor),
            splitView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            splitView.topAnchor.constraint(equalTo: container.topAnchor),
            splitView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        // titlebar 영역 드래그는 installTitlebarBackground이 titlebar 레이어에 깔아주는
        // DraggableTitlebarOverlay(mouseDownCanMoveWindow=true)가 처리한다 —
        // titlebar 레이어가 contentView보다 위에 있어 contentView에 깐 오버레이는
        // hit-test가 닿지 못한다.
        // splitVC를 child VC로 유지해 lifecycle/responder chain 보존
        let rootVC = NSViewController()
        rootVC.view = container
        rootVC.addChild(splitVC)
        window.contentViewController = rootVC

        // 이미지 미리보기는 EditorViewController 안에서 자체 처리한다 (에디터 영역만 차지).

        // Toolbar — autosavesConfiguration로 사용자 customization 보존
        // identifier bump — 디자인 spec(title + auto-saved만)에 맞춰 default 변경되면서
        // 사용자가 이전 customization으로 가진 sidebar/new/search 아이콘이 부활하지 않게.
        let toolbar = NSToolbar(identifier: "MainToolbarV2")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = true
        toolbar.autosavesConfiguration = true
        toolbar.showsBaselineSeparator = false
        window.toolbar = toolbar
        window.toolbarStyle = .unified

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

        // titlebar/toolbar + sidebar 영역의 시스템 vibrant blur 제거
        DispatchQueue.main.async { [weak self] in
            self?.killTitlebarVibrancy()
            self?.killSidebarVibrancy()
            self?.installTitlebarSeparator()
        }

        // sidebar resize/collapse 시 separator X 좌표 갱신
        NotificationCenter.default.publisher(for: NSSplitView.didResizeSubviewsNotification, object: splitVC.splitView)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.updateTitlebarSeparatorFrame()
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

    /// sidebar boundary 위치(toolbar 영역) 에 1px vertical line을 직접 박는다.
    /// titlebarSeparatorStyle = .line은 우리가 vfx 제거하면서 같이 사라지므로 사용 X.
    private func installTitlebarSeparator() {
        guard let window else { return }
        guard let themeFrame = window.contentView?.superview else { return }
        var titlebar: NSView?
        outer: for sv in themeFrame.subviews {
            if String(describing: type(of: sv)).contains("NSTitlebarContainer") {
                for ssv in sv.subviews where String(describing: type(of: ssv)).contains("NSTitlebarView") {
                    titlebar = ssv
                    break outer
                }
            }
        }
        guard let tb = titlebar else { return }
        // 사이드바 경계 세로선은 사용자 요청으로 비활성 — toolbar 영역에 시각적으로 잡음.
        // horizontal: toolbar 아래 경계 — 디자인 spec(JSX Toolbar) "1px dashed separator".
        let hline = DashedLineView(frame: NSRect(x: 0, y: 0, width: tb.bounds.width, height: 1))
        hline.autoresizingMask = .width
        hline.identifier = NSUserInterfaceItemIdentifier("md-titlebar-hsep")
        tb.addSubview(hline)
    }

    private func updateTitlebarSeparatorFrame() {
        // 사이드바 경계 세로선 제거됨 — 이 함수는 sidebar resize subscriber에서만 호출.
    }

    /// sidebarWithViewController는 NSVisualEffectView가 sidebar host를 wrap하므로
    /// remove하면 자식까지 함께 사라진다. material/state만 바꿔 vibrant 효과를 죽이고,
    /// SwiftUI background(#f5f5f7) + layer backgroundColor로 위를 덮어 단색 사이드바.
    private func killSidebarVibrancy() {
        guard let sidebarView = sidebarItem?.viewController.view else { return }
        let solidColor = NSColor(srgbRed: 245.0/255, green: 245.0/255, blue: 247.0/255, alpha: 1)
        var node: NSView? = sidebarView.superview
        while let n = node {
            for sub in n.subviews {
                if let vfx = sub as? NSVisualEffectView {
                    vfx.material = .windowBackground
                    vfx.state = .inactive
                    vfx.blendingMode = .withinWindow
                    vfx.isEmphasized = false
                    vfx.wantsLayer = true
                    vfx.layer?.backgroundColor = solidColor.cgColor
                }
            }
            if String(describing: type(of: n)).contains("NSSplitView") { break }
            node = n.superview
        }
        // SwiftUI hosting view 자체에도 layer 색을 박아 vibrant이 비치는 일을 차단
        sidebarView.wantsLayer = true
        sidebarView.layer?.backgroundColor = solidColor.cgColor
    }

    private static let titlebarBgIdentifier = NSUserInterfaceItemIdentifier("md-titlebar-bg")

    private func installTitlebarBackground(in themeFrame: NSView) {
        for sv in themeFrame.subviews {
            let cls = String(describing: type(of: sv))
            guard cls.contains("NSTitlebarContainer") else { continue }
            // 이미 깔려있으면 skip (재진입 안전)
            if sv.subviews.contains(where: { $0.identifier == Self.titlebarBgIdentifier }) {
                return
            }
            let bg = DraggableTitlebarOverlay(frame: sv.bounds)
            bg.identifier = Self.titlebarBgIdentifier
            bg.wantsLayer = true
            // paper #fdfbf5 — 노트북 종이가 titlebar 뒤까지 연속
            bg.layer?.backgroundColor = NSColor(srgbRed: 253.0/255, green: 251.0/255, blue: 245.0/255, alpha: 1).cgColor
            bg.autoresizingMask = [.width, .height]
            if let first = sv.subviews.first {
                sv.addSubview(bg, positioned: .below, relativeTo: first)
            } else {
                sv.addSubview(bg)
            }
            return
        }
    }

    @objc func toggleSidebar() {
        guard let item = sidebarItem else { return }
        item.animator().isCollapsed.toggle()
    }


    @objc func openFolder() { state.pickFolder() }
    @objc func newFile() { state.newFile() }
    @objc func saveFile() { state.saveCurrent() }

    // native 탭은 비활성화됨(tabbingMode = .disallowed). ⌘T는 File 메뉴의 "New Window"
    // 항목이 직접 처리하므로 newWindowForTab override는 제거했다.

    // MARK: - NSToolbarDelegate

    private enum ItemID {
        static let sidebar = NSToolbarItem.Identifier("sidebar")
        static let openFolder = NSToolbarItem.Identifier("openFolder")
        static let title = NSToolbarItem.Identifier("title")
        static let newFile = NSToolbarItem.Identifier("newFile")
        static let search = NSToolbarItem.Identifier("search")
        static let theme = NSToolbarItem.Identifier("theme")
        static let leftSeparator = NSToolbarItem.Identifier("leftSeparator")
    }

    func toolbar(_ toolbar: NSToolbar,
                 itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        switch itemIdentifier {
        case ItemID.sidebar:
            return designButtonItem(id: itemIdentifier,
                                    label: "Sidebar",
                                    image: DesignIcon.sidebar,
                                    fallback: "sidebar.left",
                                    tooltip: "사이드바 (⌘⇧D)",
                                    action: #selector(toggleSidebar))
        case ItemID.openFolder:
            return designButtonItem(id: itemIdentifier,
                                    label: "Open",
                                    image: DesignIcon.folder,
                                    fallback: "folder",
                                    tooltip: "폴더 열기 (⌘O)",
                                    action: #selector(openFolder))
        case ItemID.newFile:
            return designButtonItem(id: itemIdentifier,
                                    label: "New",
                                    image: DesignIcon.plus,
                                    fallback: "square.and.pencil",
                                    tooltip: "새 파일 (⌘N)",
                                    action: #selector(newFile))
        case ItemID.search:
            return designButtonItem(id: itemIdentifier,
                                    label: "Search",
                                    image: DesignIcon.search,
                                    fallback: "magnifyingglass",
                                    tooltip: "검색 (⌘F)",
                                    action: #selector(openSearchAction))
        case ItemID.leftSeparator:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            // toolbar 영역 전체 높이를 채우도록 — sidebar 안의 overlay와 시각적으로 이어진다.
            let line = NSView(frame: NSRect(x: 0, y: 0, width: 1, height: 52))
            line.wantsLayer = true
            line.layer?.backgroundColor = NSColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.08).cgColor
            line.autoresizingMask = .height
            item.view = line
            item.label = ""
            return item
        case ItemID.theme:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            let host = NSHostingView(rootView: ThemeSwatchPicker().environmentObject(state))
            host.translatesAutoresizingMaskIntoConstraints = false
            host.frame = NSRect(x: 0, y: 0, width: 96, height: 22)
            item.view = host
            item.label = "Theme"
            item.minSize = NSSize(width: 96, height: 22)
            item.maxSize = NSSize(width: 96, height: 22)
            return item
        case ItemID.title:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            let host = NSHostingView(rootView: TitleBar().environmentObject(state))
            host.translatesAutoresizingMaskIntoConstraints = false
            item.view = host
            item.label = ""
            // toolbar에서 다른 시스템 아이템이 압축하지 않도록 충분한 범위 부여.
            // height 28은 NSToolbar의 일반 item bezel + Caveat 26 baseline 여유.
            item.minSize = NSSize(width: 240, height: 28)
            item.maxSize = NSSize(width: 8000, height: 28)
            return item
        default:
            return nil
        }
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        // 디자인 spec(JSX Toolbar): title + dirty dot + flex + ✎ auto-saved 만.
        // sidebar/new/search 아이콘은 키보드 단축키(⌘⇧D / ⌘N / ⌘F) + 메뉴바로
        // 접근. customization에서 사용자가 다시 꺼낼 순 있음(Allowed에 남음).
        [.sidebarTrackingSeparator, ItemID.title]
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.sidebarTrackingSeparator,
         ItemID.sidebar, ItemID.openFolder, ItemID.newFile,
         ItemID.theme, ItemID.search, ItemID.title, .flexibleSpace, .space]
    }

    @objc fileprivate func openSearchAction() {
        NotificationCenter.default.post(name: .openSearchRequested, object: nil)
    }

    /// SVG NSImage가 살아있으면 그걸로, 아니면 SF Symbol fallback.
    /// NSToolbarItem.image보다 NSButton을 직접 view로 박아야 22pt로 정확히 렌더된다.
    private func designButtonItem(id: NSToolbarItem.Identifier,
                                  label: String,
                                  image: NSImage?,
                                  fallback: String,
                                  tooltip: String,
                                  action: Selector) -> NSToolbarItem {
        let item = NSToolbarItem(itemIdentifier: id)
        item.label = label
        item.toolTip = tooltip
        let btn = NSButton(image: image ?? NSImage(systemSymbolName: fallback,
                                                   accessibilityDescription: label) ?? NSImage(),
                           target: self, action: action)
        btn.bezelStyle = .accessoryBarAction
        btn.isBordered = false
        btn.imageScaling = .scaleProportionallyUpOrDown
        btn.frame = NSRect(x: 0, y: 0, width: 28, height: 22)
        btn.toolTip = tooltip
        item.view = btn
        item.minSize = NSSize(width: 28, height: 22)
        item.maxSize = NSSize(width: 28, height: 22)
        return item
    }
}

extension Notification.Name {
    static let toggleSidebarRequested = Notification.Name("toggleSidebarRequested")
    static let outlineNavigateRequested = Notification.Name("outlineNavigateRequested")
    static let openSearchRequested = Notification.Name("openSearchRequested")
}

/// 디자인 spec(JSX Toolbar)의 `1px dashed separator`를 NSView로 구현.
/// CALayer로 dash 표현이 어렵고 0.5px 단위 fractional alignment이 깔끔치 않아
/// override draw + NSBezierPath.setLineDash로 직접 그린다.
private final class DashedLineView: NSView {
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        NSColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.25).setStroke()
        let path = NSBezierPath()
        path.lineWidth = 1
        path.lineCapStyle = .butt
        let pattern: [CGFloat] = [4, 3]
        path.setLineDash(pattern, count: pattern.count, phase: 0)
        let y = bounds.midY
        path.move(to: NSPoint(x: bounds.minX, y: y))
        path.line(to: NSPoint(x: bounds.maxX, y: y))
        path.stroke()
    }
}
