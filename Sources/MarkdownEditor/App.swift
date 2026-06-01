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
    /// SwiftUI NSApplicationDelegateAdaptor wrapping이 NSApp.delegate cast를 깨뜨리는 케이스가 있어
    /// static reference로 직접 접근.
    static private(set) weak var shared: AppDelegate?

    let state = AppState()
    private var mainController: MainWindowController?
    /// 추가 탭/윈도우는 자체 AppState를 가진 별도 controller로 운영.
    /// macOS native window tabbing이 이들을 자동으로 탭으로 묶음.
    private var extraControllers: [MainWindowController] = []
    /// applicationDidFinishLaunching 이전에 들어온 open 요청 (Finder에서 더블클릭 등).
    /// mainController 생성 후 한꺼번에 처리.
    private var pendingOpenURLs: [URL] = []

    override init() {
        super.init()
        Self.shared = self
    }

    /// vendor/* 폰트를 CTFontManager로 process scope에 등록 → SwiftUI Font.custom 사용 가능.
    /// NanumPenScript / Kalam / Caveat: TTF — 정상 등록.
    /// Excalifont / JetBrainsMono / Pretendard: woff2 — macOS native 등록 미지원이라 실패해도
    /// WKWebView @font-face는 별개로 동작하므로 로그만.
    private static func registerBundledFonts() {
        let names = [
            "NanumPenScript-Regular.ttf",
            "Kalam-Regular.ttf",
            "Kalam-Bold.ttf",
            "Caveat[wght].ttf",
            "Excalifont-Regular.woff2",
        ]
        for name in names {
            let url = Bundle.main.url(forResource: name, withExtension: nil, subdirectory: "vendor")
                ?? Bundle.main.url(forResource: name, withExtension: nil)
            guard let fontURL = url else {
                NSLog("[MD-FONT] not found in bundle: %@", name)
                continue
            }
            var error: Unmanaged<CFError>?
            if CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, &error) {
                NSLog("[MD-FONT] registered: %@", name)
            } else {
                let desc = error?.takeRetainedValue().localizedDescription ?? "unknown"
                NSLog("[MD-FONT] register FAIL %@: %@", name, desc)
            }
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        Self.registerBundledFonts()

        // Stage Manager / Mission Control 카드의 overlay 아이콘은 NSApp.applicationIconImage를 사용.
        // Info.plist + .icns만으로 인식 안 되는 경우가 있어 명시적으로 set.
        if let iconURL = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
           let img = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = img
        }

        UserDefaults.standard.register(defaults: [
            "NSAutomaticCapitalizationEnabled": false,
            "NSAutomaticDashSubstitutionEnabled": false,
            "NSAutomaticPeriodSubstitutionEnabled": false,
            "NSAutomaticQuoteSubstitutionEnabled": false,
            "NSAutomaticSpellingCorrectionEnabled": false,
            "NSAutomaticTextCompletionEnabled": false,
        ])

        let controller = MainWindowController(state: state, frameAutosaveName: "MainEditorWindow")
        // native 탭 비활성화 — 커스텀 타이틀바 수술이 동적 탭바와 충돌(파일트리 관통).
        // "새 탭" 대신 독립 윈도우로 띄운다.
        controller.window?.tabbingMode = .disallowed
        controller.showWindow(nil)
        controller.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        mainController = controller
        installMenuBarItems()
        // SwiftUI Settings scene이 menu를 늦게 빌드하는 케이스가 있어 한 번 더 시도
        DispatchQueue.main.async { [weak self] in
            self?.installMenuBarItems()
            self?.dumpMenuTree()
        }
        // 런치 이전에 들어온 open 요청 처리 (Finder 더블클릭 / "다음으로 열기" 등).
        if !pendingOpenURLs.isEmpty {
            let urls = pendingOpenURLs
            pendingOpenURLs.removeAll()
            for url in urls { openMarkdownFile(url) }
        }
    }

    /// macOS Finder에서 .md 파일 더블클릭 / 기본앱 / "다음으로 열기"로 전달된 파일을 처리.
    /// 다중 파일도 가능. 첫 파일은 메인 윈도우, 나머지는 새 윈도우로 열어준다.
    func application(_ application: NSApplication, open urls: [URL]) {
        if mainController == nil {
            pendingOpenURLs.append(contentsOf: urls)
            return
        }
        for url in urls { openMarkdownFile(url) }
    }

    private func openMarkdownFile(_ url: URL) {
        guard url.isFileURL else { return }
        let folder = url.deletingLastPathComponent()
        // 1) 같은 폴더가 이미 열려있는 윈도우/탭이면 그 안에서 선택만 (가장 매끄러운 UX)
        let all = ([mainController].compactMap { $0 }) + extraControllers
        if let existing = all.first(where: {
            $0.state.rootFolder?.standardizedFileURL == folder.standardizedFileURL
        }) {
            existing.state.selectFile(url)
            existing.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        // 2) 메인이 빈 상태(폴더 없음)면 그대로 사용
        if state.rootFolder == nil {
            state.openFolder(folder)
            DispatchQueue.main.async { [weak self] in
                self?.state.selectFile(url)
                self?.mainController?.window?.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
            }
            return
        }
        // 3) 다른 폴더면 새 창으로 열어 작업 중이던 폴더 보존
        openNewWindow(with: url, folder: folder)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func dumpMenuTree() {
        guard let main = NSApp.mainMenu else { NSLog("[MD] mainMenu nil"); return }
        NSLog("[MD] === mainMenu (\(main.items.count) top items) ===")
        for top in main.items {
            let t = top.title.isEmpty ? (top.submenu?.title ?? "?") : top.title
            NSLog("[MD]   ▸ \(t)")
            if let sub = top.submenu {
                for s in sub.items {
                    let key = s.keyEquivalent.isEmpty ? "" : "  [\(s.keyEquivalentModifierMask.rawValue)+\(s.keyEquivalent)]"
                    NSLog("[MD]       . \(s.title)\(key)")
                }
            }
        }
    }

    /// ⌘T — 같은 폴더를 공유하는 새 독립 윈도우. AppState는 별도 인스턴스라 file selection /
    /// documentText / undo history는 윈도우마다 독립. UserDefaults bookmark가 init에서
    /// 자동 복원되므로 폴더 트리는 동일하게 보임.
    @objc func menuNewWindow() {
        openNewWindow(with: nil)
    }

    /// 특정 파일을 새 윈도우에서 연다. 사이드바 contextMenu / 에디터 drop / Finder open이 사용.
    /// folder가 주어지면 새 윈도우의 rootFolder도 명시적으로 변경 (UserDefaults 복원 무시).
    func openNewWindow(with url: URL?, folder: URL? = nil) {
        let newState = AppState()
        let newController = MainWindowController(state: newState)
        guard let newWindow = newController.window else { return }
        newWindow.tabbingMode = .disallowed
        // 기존 key 윈도우에서 살짝 offset해 cascade (정확히 겹치지 않게)
        if let keyWindow = NSApp.keyWindow {
            let origin = keyWindow.frame.origin
            newWindow.setFrameOrigin(NSPoint(x: origin.x + 28, y: origin.y - 28))
        }
        newController.showWindow(nil)
        newWindow.makeKeyAndOrderFront(nil)
        extraControllers.append(newController)
        if let folder { newState.openFolder(folder) }
        if let url {
            // 새 controller의 view 로드 + Combine sinks attach 후 selectFile.
            // 한 runloop으로는 부족하므로 살짝 지연.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
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
        if fileMenu.items.contains(where: { $0.action == #selector(menuPresent) }) {
            return  // 이미 박혔음 — 중복 추가 방지
        }
        do {
            let openFolder = NSMenuItem(title: "Open Folder…",
                                        action: #selector(menuOpenFolder),
                                        keyEquivalent: "o")
            openFolder.target = self
            let newFile = NSMenuItem(title: "New File",
                                     action: #selector(menuNewFile),
                                     keyEquivalent: "n")
            newFile.target = self
            let newWindowItem = NSMenuItem(title: "New Window",
                                           action: #selector(menuNewWindow),
                                           keyEquivalent: "t")
            newWindowItem.target = self
            let saveFile = NSMenuItem(title: "Save",
                                      action: #selector(menuSave),
                                      keyEquivalent: "s")
            saveFile.target = self

            let present = NSMenuItem(title: "Present",
                                     action: #selector(menuPresent),
                                     keyEquivalent: "p")
            present.target = self
            present.keyEquivalentModifierMask = [.command, .shift]

            fileMenu.insertItem(present, at: 0)
            fileMenu.insertItem(NSMenuItem.separator(), at: 0)
            fileMenu.insertItem(saveFile, at: 0)
            fileMenu.insertItem(NSMenuItem.separator(), at: 0)
            fileMenu.insertItem(newWindowItem, at: 0)
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

        // Format > Font 서브메뉴
        let fontMenu = NSMenu(title: "Font")
        fontMenu.autoenablesItems = false
        for f in EditorFont.allCases {
            let mi = NSMenuItem(title: f.displayName,
                                action: #selector(menuSetFont(_:)),
                                keyEquivalent: "")
            mi.target = self
            mi.representedObject = f.rawValue
            mi.state = (state.editorFont == f) ? .on : .off
            fontMenu.addItem(mi)
        }
        fontMenuRef = fontMenu

        let formatMenu = NSMenu(title: "Format")
        let fontSubItem = NSMenuItem(title: "Font", action: nil, keyEquivalent: "")
        fontSubItem.submenu = fontMenu
        formatMenu.addItem(fontSubItem)

        let formatMenuItem = NSMenuItem(title: "Format", action: nil, keyEquivalent: "")
        formatMenuItem.submenu = formatMenu
        // Theme 메뉴 직후에 삽입
        if let themeIdx = mainMenu.items.firstIndex(of: themeMenuItem) {
            mainMenu.insertItem(formatMenuItem, at: themeIdx + 1)
        } else {
            mainMenu.addItem(formatMenuItem)
        }
    }

    private weak var fontMenuRef: NSMenu?

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
        editMenu.addItem(.separator())
        let find = NSMenuItem(title: "Find…",
                              action: #selector(menuOpenFind),
                              keyEquivalent: "f")
        find.target = self
        editMenu.addItem(find)

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
    @objc func menuPresent() {
        NSLog("[MD] menuPresent ENTRY isActive=\(NSApp.isActive) key=\(NSApp.keyWindow?.title ?? "nil") main=\(NSApp.mainWindow?.title ?? "nil")")
        let s = activeState()
        let md = s.documentText.isEmpty ? "# Empty\n\n현재 파일이 비어있음" : s.documentText
        let docFolder = s.selectedFile?.deletingLastPathComponent() ?? s.rootFolder
        if let mc = activeMainController() {
            mc.showPresentation(markdown: md, docFolder: docFolder)
        } else {
            NSLog("[MD] menuPresent — no active controller")
        }
    }

    private func activeMainController() -> MainWindowController? {
        let all = (extraControllers + [mainController].compactMap { $0 })
        if let key = NSApp.keyWindow, let mc = all.first(where: { $0.window === key }) {
            return mc
        }
        return mainController ?? all.first
    }

    private func activeState() -> AppState {
        if let key = NSApp.keyWindow,
           let mc = (extraControllers + [mainController].compactMap { $0 })
                    .first(where: { $0.window === key }) {
            return mc.state
        }
        return state
    }
    @objc func menuToggleSidebar() {
        NotificationCenter.default.post(name: .toggleSidebarRequested, object: nil)
    }
    @objc func menuOpenFind() {
        NotificationCenter.default.post(name: .openSearchRequested, object: nil)
    }
    @objc func menuSetTheme(_ sender: NSMenuItem) {
        if let raw = sender.representedObject as? String,
           let t = Theme(rawValue: raw) {
            state.setTheme(t)
        }
    }

    @objc func menuSetFont(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
              let f = EditorFont(rawValue: raw) else { return }
        state.setEditorFont(f)
        // 메뉴 체크 표시 갱신
        fontMenuRef?.items.forEach { item in
            if let r = item.representedObject as? String {
                item.state = (r == f.rawValue) ? .on : .off
            }
        }
    }
}
