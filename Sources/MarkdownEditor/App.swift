import SwiftUI
import AppKit

@main
struct MarkdownEditorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        Settings { EmptyView() }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let state = AppState()
    private var mainController: MainWindowController?
    /// 추가 탭/윈도우는 자체 AppState를 가진 별도 controller로 운영.
    /// macOS native window tabbing이 이들을 자동으로 탭으로 묶음.
    private var extraControllers: [MainWindowController] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        UserDefaults.standard.register(defaults: [
            "NSAutomaticCapitalizationEnabled": false,
            "NSAutomaticDashSubstitutionEnabled": false,
            "NSAutomaticPeriodSubstitutionEnabled": false,
            "NSAutomaticQuoteSubstitutionEnabled": false,
            "NSAutomaticSpellingCorrectionEnabled": false,
            "NSAutomaticTextCompletionEnabled": false,
        ])

        let controller = MainWindowController(state: state)
        controller.window?.tabbingMode = .preferred
        controller.window?.tabbingIdentifier = "MarkdownEditorMain"
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        mainController = controller
        installMenuBarItems()
    }

    /// ⌘T — 같은 폴더를 공유하는 새 탭. AppState는 별도 인스턴스라 file selection /
    /// documentText / undo history는 탭마다 독립. UserDefaults bookmark가 init에서
    /// 자동 복원되므로 폴더 트리는 동일하게 보임.
    @objc func menuNewTab() {
        openNewTab(with: nil)
    }

    /// 특정 파일을 새 탭에서 연다. 사이드바 contextMenu의 "새 탭에서 열기"가 사용.
    func openNewTab(with url: URL?) {
        let newState = AppState()
        let newController = MainWindowController(state: newState)
        guard let newWindow = newController.window else { return }
        newWindow.tabbingMode = .preferred
        newWindow.tabbingIdentifier = "MarkdownEditorMain"
        if let keyWindow = NSApp.keyWindow {
            keyWindow.addTabbedWindow(newWindow, ordered: .above)
        }
        newController.showWindow(nil)
        newWindow.makeKeyAndOrderFront(nil)
        extraControllers.append(newController)
        if let url {
            // 새 controller의 viewDidLoad가 끝난 직후 selectFile 호출되도록
            // 다음 runloop에 dispatch (state Combine sink가 attach된 후)
            DispatchQueue.main.async {
                newState.selectFile(url)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        state.flushPendingSave()
        state.releaseRootFolderAccess()
    }

    // MARK: - Menubar

    private func installMenuBarItems() {
        guard let mainMenu = NSApp.mainMenu else { return }

        installEditMenu(mainMenu)

        // File 메뉴: 시스템 locale에 따라 "File" / "파일"이거나 아예 없을 수 있어
        // (Settings scene만 있는 SwiftUI App). 없으면 직접 추가한다.
        let fileMenu = ensureFileMenu(mainMenu)
        do {
            let openFolder = NSMenuItem(title: "Open Folder…",
                                        action: #selector(menuOpenFolder),
                                        keyEquivalent: "o")
            openFolder.target = self
            let newFile = NSMenuItem(title: "New File",
                                     action: #selector(menuNewFile),
                                     keyEquivalent: "n")
            newFile.target = self
            let newTab = NSMenuItem(title: "New Tab",
                                    action: #selector(menuNewTab),
                                    keyEquivalent: "t")
            newTab.target = self
            let saveFile = NSMenuItem(title: "Save",
                                      action: #selector(menuSave),
                                      keyEquivalent: "s")
            saveFile.target = self

            fileMenu.insertItem(NSMenuItem.separator(), at: 0)
            fileMenu.insertItem(saveFile, at: 0)
            fileMenu.insertItem(NSMenuItem.separator(), at: 0)
            fileMenu.insertItem(newTab, at: 0)
            fileMenu.insertItem(newFile, at: 0)
            fileMenu.insertItem(openFolder, at: 0)
        }

        // View 메뉴: Toggle Sidebar / Toggle Outline
        let viewIdx = mainMenu.items.firstIndex(where: {
            let t = $0.submenu?.title ?? $0.title
            return t == "View" || t == "보기" || t.contains("View") || t.contains("보기")
        })
        if let idx = viewIdx, let viewMenu = mainMenu.items[idx].submenu {
            let toggle = NSMenuItem(title: "Toggle Sidebar",
                                    action: #selector(menuToggleSidebar),
                                    keyEquivalent: "d")
            toggle.target = self
            toggle.keyEquivalentModifierMask = [.command, .shift]
            viewMenu.addItem(NSMenuItem.separator())
            viewMenu.addItem(toggle)

            let outline = NSMenuItem(title: "Show Outline",
                                     action: #selector(menuToggleOutline),
                                     keyEquivalent: "o")
            outline.target = self
            outline.keyEquivalentModifierMask = [.command, .shift]
            viewMenu.addItem(outline)
        }

        // Theme 메뉴 (View 다음에 삽입)
        let themeMenu = NSMenu(title: "Theme")
        for (i, t) in Theme.allCases.enumerated() {
            let mi = NSMenuItem(title: t.displayName,
                                action: #selector(menuSetTheme(_:)),
                                keyEquivalent: String(i + 1))
            mi.keyEquivalentModifierMask = [.command, .shift]
            mi.target = self
            mi.representedObject = t.rawValue
            themeMenu.addItem(mi)
        }
        let themeMenuItem = NSMenuItem(title: "Theme", action: nil, keyEquivalent: "")
        themeMenuItem.submenu = themeMenu

        if let viewIdx {
            mainMenu.insertItem(themeMenuItem, at: viewIdx + 1)
        } else {
            mainMenu.addItem(themeMenuItem)
        }
    }

    /// "File" / "파일" 메뉴를 찾거나, 없으면 새로 만들어서 mainMenu에 삽입.
    private func ensureFileMenu(_ mainMenu: NSMenu) -> NSMenu {
        if let existing = mainMenu.items.first(where: {
            let t = $0.submenu?.title ?? $0.title
            return t == "File" || t == "파일"
        })?.submenu {
            return existing
        }
        let menu = NSMenu(title: "File")
        let item = NSMenuItem(title: "File", action: nil, keyEquivalent: "")
        item.submenu = menu
        // 첫 번째(앱 이름) 다음 위치에 삽입
        let insertAt = mainMenu.items.isEmpty ? 0 : 1
        mainMenu.insertItem(item, at: insertAt)
        return menu
    }

    // Edit 메뉴 — Undo/Redo/Cut/Copy/Paste/Select All. target=nil로 두면
    // responder chain을 따라 first responder(WKWebView)에 selector가 dispatch되고,
    // contenteditable 내부에선 WebKit의 자체 undo manager가 처리한다.
    private func installEditMenu(_ mainMenu: NSMenu) {
        // 이미 있으면 skip (영문/한국어 둘 다 매칭)
        if mainMenu.items.contains(where: {
            let t = $0.submenu?.title ?? $0.title
            return t == "Edit" || t == "편집"
        }) { return }

        let editMenu = NSMenu(title: "Edit")
        let undo = NSMenuItem(title: "Undo",
                              action: NSSelectorFromString("undo:"),
                              keyEquivalent: "z")
        editMenu.addItem(undo)
        let redo = NSMenuItem(title: "Redo",
                              action: NSSelectorFromString("redo:"),
                              keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redo)
        editMenu.addItem(.separator())
        editMenu.addItem(NSMenuItem(title: "Cut",
                                    action: NSSelectorFromString("cut:"),
                                    keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy",
                                    action: NSSelectorFromString("copy:"),
                                    keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste",
                                    action: NSSelectorFromString("paste:"),
                                    keyEquivalent: "v"))
        editMenu.addItem(.separator())
        editMenu.addItem(NSMenuItem(title: "Select All",
                                    action: NSSelectorFromString("selectAll:"),
                                    keyEquivalent: "a"))

        let editMenuItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        editMenuItem.submenu = editMenu

        // File / 파일 다음에 삽입 (없으면 끝에)
        let fileIdx = mainMenu.items.firstIndex(where: {
            let t = $0.submenu?.title ?? $0.title
            return t == "File" || t == "파일"
        })
        if let idx = fileIdx {
            mainMenu.insertItem(editMenuItem, at: idx + 1)
        } else {
            mainMenu.addItem(editMenuItem)
        }
    }

    @objc func menuOpenFolder() { state.pickFolder() }
    @objc func menuNewFile() { state.newFile() }
    @objc func menuSave() { state.saveCurrent() }
    @objc func menuToggleSidebar() {
        NotificationCenter.default.post(name: .toggleSidebarRequested, object: nil)
    }
    @objc func menuToggleOutline() {
        NotificationCenter.default.post(name: .toggleOutlinePopoverRequested, object: nil)
    }
    @objc func menuSetTheme(_ sender: NSMenuItem) {
        if let raw = sender.representedObject as? String,
           let t = Theme(rawValue: raw) {
            state.setTheme(t)
        }
    }
}
