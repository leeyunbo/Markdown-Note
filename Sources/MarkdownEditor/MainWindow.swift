import AppKit
import SwiftUI
import Combine

@MainActor
final class MainWindowController: NSWindowController, NSToolbarDelegate {
    let state: AppState
    private var splitVC: NSSplitViewController!
    private var sidebarItem: NSSplitViewItem!
    private var cancellables: Set<AnyCancellable> = []

    private weak var titleLabel: NSTextField?

    init(state: AppState) {
        self.state = state
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
        window.titlebarAppearsTransparent = false
        window.titleVisibility = .hidden
        window.title = "Markdown Editor"
        window.minSize = NSSize(width: 720, height: 480)
        window.setFrameAutosaveName("MainEditorWindow")
        super.init(window: window)
        setup()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        guard let window else { return }

        // Sidebar = SwiftUI(NSHostingController)
        let sidebarHost = NSHostingController(rootView: FolderSidebar().environmentObject(state))
        sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebarHost)
        sidebarItem.minimumThickness = 200
        sidebarItem.maximumThickness = 360
        sidebarItem.canCollapse = true

        // Main = AppKit (NSTextView 직접 호스팅, SwiftUI 합성 밖)
        let editor = EditorViewController(state: state)
        let editorItem = NSSplitViewItem(viewController: editor)
        editorItem.minimumThickness = 360

        splitVC = NSSplitViewController()
        splitVC.addSplitViewItem(sidebarItem)
        splitVC.addSplitViewItem(editorItem)

        window.contentViewController = splitVC

        // 이미지 미리보기는 EditorViewController 안에서 자체 처리한다 (에디터 영역만 차지).

        // Toolbar
        let toolbar = NSToolbar(identifier: "MainToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        toolbar.showsBaselineSeparator = false
        window.toolbar = toolbar
        window.toolbarStyle = .unified

        // 파일명 타이틀 바인딩
        state.$selectedFile
            .receive(on: RunLoop.main)
            .sink { [weak self] url in
                let name = url?.deletingPathExtension().lastPathComponent ?? "Markdown Editor"
                self?.window?.title = name
                self?.titleLabel?.stringValue = name
            }
            .store(in: &cancellables)

        // dirty 상태 → close 버튼 dot
        state.$isDirty
            .receive(on: RunLoop.main)
            .sink { [weak self] dirty in
                self?.window?.isDocumentEdited = dirty
            }
            .store(in: &cancellables)

        // 사이드바 자동 토글 (단축키 ⌘⇧D)
        NotificationCenter.default.publisher(for: .toggleSidebarRequested)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.toggleSidebar()
            }
            .store(in: &cancellables)

        // outline popover 토글 (단축키 ⌘⇧O)
        NotificationCenter.default.publisher(for: .toggleOutlinePopoverRequested)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.toggleOutlinePopover(nil)
            }
            .store(in: &cancellables)
    }

    @objc func toggleSidebar() {
        guard let item = sidebarItem else { return }
        item.animator().isCollapsed.toggle()
    }


    @objc func openFolder() { state.pickFolder() }
    @objc func newFile() { state.newFile() }
    @objc func saveFile() { state.saveCurrent() }

    @objc func toggleOutlinePopover(_ sender: Any?) {
        if let pop = outlinePopover, pop.isShown {
            pop.performClose(sender)
            return
        }
        let pop = NSPopover()
        pop.behavior = .transient
        pop.animates = true
        let host = NSHostingController(rootView:
            OutlinePopover(onSelect: { [weak self] in
                self?.outlinePopover?.performClose(nil)
            })
            .environmentObject(state)
        )
        pop.contentViewController = host
        outlinePopover = pop

        // anchor: toolbar의 outline 버튼이 가장 자연스럽지만, 직접 잡기 어려우니
        // window content 상단 우측 근처에 띄운다 (toolbar 영역).
        let anchorView = anchorViewForOutlinePopover()
        pop.show(relativeTo: anchorView.bounds, of: anchorView, preferredEdge: .minY)
    }

    private func anchorViewForOutlinePopover() -> NSView {
        // toolbar의 outline 버튼을 찾아 anchor로 사용 (NSToolbar API는 view 직접 노출 X,
        // window의 view 트리에서 itemIdentifier로 매칭되는 NSToolbarItemViewer를 찾는다).
        if let win = window,
           let containerView = win.contentView?.superview ?? win.contentView,
           let found = findOutlineToolbarView(in: containerView) {
            return found
        }
        // fallback: window 컨텐츠 우측 상단 근처
        return window?.contentView ?? NSView()
    }

    private func findOutlineToolbarView(in root: NSView) -> NSView? {
        // toolbar item view는 클래스 이름이 NSToolbarItemViewer이거나 NSToolbarButton 형태.
        // accessibilityLabel/identifier가 "Outline"이면 채택.
        let target = "Outline"
        if let label = root.accessibilityLabel(), label == target { return root }
        if let id = root.identifier?.rawValue, id == ItemID.outline.rawValue { return root }
        for sub in root.subviews {
            if let v = findOutlineToolbarView(in: sub) { return v }
        }
        return nil
    }

    // MARK: - NSToolbarDelegate

    private enum ItemID {
        static let sidebar = NSToolbarItem.Identifier("sidebar")
        static let openFolder = NSToolbarItem.Identifier("openFolder")
        static let outline = NSToolbarItem.Identifier("outline")
        static let title = NSToolbarItem.Identifier("title")
    }

    private var outlinePopover: NSPopover?
    private weak var outlineToolbarButton: NSButton?

    func toolbar(_ toolbar: NSToolbar,
                 itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        switch itemIdentifier {
        case ItemID.sidebar:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            item.label = "Sidebar"
            item.image = NSImage(systemSymbolName: "sidebar.left", accessibilityDescription: "Toggle Sidebar")
            item.target = self
            item.action = #selector(toggleSidebar)
            item.toolTip = "사이드바 (⌘⇧D)"
            return item
        case ItemID.openFolder:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            item.label = "Open"
            item.image = NSImage(systemSymbolName: "folder", accessibilityDescription: "Open Folder")
            item.target = self
            item.action = #selector(openFolder)
            item.toolTip = "폴더 열기 (⌘O)"
            return item
        case ItemID.outline:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            item.label = "Outline"
            item.image = NSImage(systemSymbolName: "list.bullet.indent",
                                 accessibilityDescription: "Outline")
            item.target = self
            item.action = #selector(toggleOutlinePopover(_:))
            item.toolTip = "아웃라인 (⌘⇧O)"
            return item
        case ItemID.title:
            let item = NSToolbarItem(itemIdentifier: itemIdentifier)
            let label = NSTextField(labelWithString: state.selectedFile?.deletingPathExtension().lastPathComponent ?? "Markdown Editor")
            label.font = .systemFont(ofSize: 13, weight: .medium)
            label.textColor = .labelColor
            label.alignment = .center
            label.maximumNumberOfLines = 1
            label.lineBreakMode = .byTruncatingMiddle
            label.usesSingleLineMode = true
            label.translatesAutoresizingMaskIntoConstraints = false
            self.titleLabel = label
            item.view = label
            item.label = ""
            return item
        default:
            return nil
        }
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [ItemID.sidebar, ItemID.openFolder, .flexibleSpace, ItemID.title, .flexibleSpace, ItemID.outline]
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [ItemID.sidebar, ItemID.openFolder, ItemID.outline, ItemID.title, .flexibleSpace, .space]
    }
}

extension Notification.Name {
    static let toggleSidebarRequested = Notification.Name("toggleSidebarRequested")
    static let outlineNavigateRequested = Notification.Name("outlineNavigateRequested")
    static let toggleOutlinePopoverRequested = Notification.Name("toggleOutlinePopoverRequested")
}
