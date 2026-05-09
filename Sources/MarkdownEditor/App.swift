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

        // File 메뉴: Open Folder, New, Save 추가
        if let fileMenuItem = mainMenu.items.first(where: { ($0.submenu?.title ?? $0.title) == "File" }) ?? mainMenu.items.first(where: { $0.title.contains("File") }),
           let fileMenu = fileMenuItem.submenu {
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
        let viewIdx = mainMenu.items.firstIndex(where: { ($0.submenu?.title ?? $0.title).contains("View") })
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

    // Edit 메뉴 — Undo/Redo/Cut/Copy/Paste/Select All. target=nil로 두면
    // responder chain을 따라 first responder(WKWebView)에 selector가 dispatch되고,
    // contenteditable 내부에선 WebKit의 자체 undo manager가 처리한다.
    private func installEditMenu(_ mainMenu: NSMenu) {
        // 이미 있으면 skip
        if mainMenu.items.contains(where: {
            ($0.submenu?.title ?? $0.title) == "Edit"
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

        // File 다음에 삽입 (없으면 끝에)
        let fileIdx = mainMenu.items.firstIndex(where: {
            ($0.submenu?.title ?? $0.title) == "File"
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
