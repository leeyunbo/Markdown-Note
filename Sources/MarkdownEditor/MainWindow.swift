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
    }

    @objc func toggleSidebar() {
        guard let item = sidebarItem else { return }
        item.animator().isCollapsed.toggle()
    }

    @objc func openFolder() { state.pickFolder() }
    @objc func newFile() { state.newFile() }
    @objc func saveFile() { state.saveCurrent() }

    @objc func cycleTheme(_ sender: NSMenuItem) {
        if let raw = sender.representedObject as? String,
           let t = Theme(rawValue: raw) {
            state.setTheme(t)
        }
    }

    // MARK: - NSToolbarDelegate

    private enum ItemID {
        static let sidebar = NSToolbarItem.Identifier("sidebar")
        static let openFolder = NSToolbarItem.Identifier("openFolder")
        static let theme = NSToolbarItem.Identifier("theme")
        static let title = NSToolbarItem.Identifier("title")
    }

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
        case ItemID.theme:
            let menu = NSMenu()
            for t in Theme.allCases {
                let mi = NSMenuItem(title: t.displayName, action: #selector(cycleTheme(_:)), keyEquivalent: "")
                mi.representedObject = t.rawValue
                mi.target = self
                if state.theme == t { mi.state = .on }
                menu.addItem(mi)
            }
            let item = NSMenuToolbarItem(itemIdentifier: itemIdentifier)
            item.label = "Theme"
            item.image = NSImage(systemSymbolName: "circle.lefthalf.filled", accessibilityDescription: "Theme")
            item.menu = menu
            item.showsIndicator = true
            item.toolTip = "테마 (⌘⇧1~4)"
            return item
        default:
            return nil
        }
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [ItemID.sidebar, ItemID.openFolder, .flexibleSpace, ItemID.title, .flexibleSpace, ItemID.theme]
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [ItemID.sidebar, ItemID.openFolder, ItemID.title, ItemID.theme, .flexibleSpace, .space]
    }
}

extension Notification.Name {
    static let toggleSidebarRequested = Notification.Name("toggleSidebarRequested")
}
