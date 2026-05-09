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

    func applicationDidFinishLaunching(_ notification: Notification) {
        // macOS의 텍스트 자동 변환 (대문자/스마트 인용/대시/마침표/맞춤법/완성)을
        // 우리 앱에서만 비활성화. register(defaults:)는 사용자가 명시적으로 설정한
        // 값을 덮어쓰지 않으니, 다른 앱이나 시스템 설정엔 영향이 없다.
        UserDefaults.standard.register(defaults: [
            "NSAutomaticCapitalizationEnabled": false,
            "NSAutomaticDashSubstitutionEnabled": false,
            "NSAutomaticPeriodSubstitutionEnabled": false,
            "NSAutomaticQuoteSubstitutionEnabled": false,
            "NSAutomaticSpellingCorrectionEnabled": false,
            "NSAutomaticTextCompletionEnabled": false,
        ])

        let controller = MainWindowController(state: state)
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        mainController = controller
        installMenuBarItems()
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
            let saveFile = NSMenuItem(title: "Save",
                                      action: #selector(menuSave),
                                      keyEquivalent: "s")
            saveFile.target = self

            fileMenu.insertItem(NSMenuItem.separator(), at: 0)
            fileMenu.insertItem(saveFile, at: 0)
            fileMenu.insertItem(NSMenuItem.separator(), at: 0)
            fileMenu.insertItem(newFile, at: 0)
            fileMenu.insertItem(openFolder, at: 0)
        }

        // View 메뉴: Toggle Sidebar
        let viewIdx = mainMenu.items.firstIndex(where: { ($0.submenu?.title ?? $0.title).contains("View") })
        if let idx = viewIdx, let viewMenu = mainMenu.items[idx].submenu {
            let toggle = NSMenuItem(title: "Toggle Sidebar",
                                    action: #selector(menuToggleSidebar),
                                    keyEquivalent: "d")
            toggle.target = self
            toggle.keyEquivalentModifierMask = [.command, .shift]
            viewMenu.addItem(NSMenuItem.separator())
            viewMenu.addItem(toggle)
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
    @objc func menuSetTheme(_ sender: NSMenuItem) {
        if let raw = sender.representedObject as? String,
           let t = Theme(rawValue: raw) {
            state.setTheme(t)
        }
    }
}
