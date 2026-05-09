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

    // MARK: - Menubar

    private func installMenuBarItems() {
        guard let mainMenu = NSApp.mainMenu else { return }

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
