# Markdown Note

> 심플하고 Mac스러운 마크다운 에디터.
> 폴더 단위 노트 + 라이브 프리뷰 + 인라인 TOC + 발표 모드.

native macOS 앱 — AppKit + SwiftUI + WKWebView + CodeMirror 6 하이브리드. Notion / Obsidian / iA Writer 계열의 라이브 프리뷰 패턴을 차용하되, **개발자 친화 / Xcode 밀도** 톤을 따른다.

---

## ✨ Features

#### 에디터
- **라이브 프리뷰** — `**bold**` 입력 즉시 굵게, 마커는 흐리게(opacity 0.35) 유지
- **마크다운 풀 지원** — 헤딩 1~6, 리스트, 체크박스, 인용, 코드 펜스, 링크, 이미지, 표, HR, 인라인 HTML
- **CodeMirror 6** — `history()`, `bracketMatching()`, `indentOnInput()`, `search()` 등 표준 확장 활용
- **find & replace** — ⌘F (CodeMirror search panel)
- **line-kind gutter** — 좌측에 `h1`/`h2`/`│`/`•`/`☐`/`✓` 마커로 라인 종류 표시
- **이미지 드래그 & 드롭** — 폴더 자동 생성(`attachments/`) + 마크다운 링크 자동 삽입 + 인라인 미리보기
- **NFC 정규화** — macOS 한글 파일명(NFD) 자동 NFC 변환

#### 사이드바
- **폴더 단위 트리** — 임의 로컬 폴더 / iCloud Drive 열기, 보안 스코프 북마크 자동 복원
- **멀티 선택** — ⌘+클릭 / ⇧+클릭 + 일괄 삭제
- **드래그 앤 드롭** — 폴더로 파일 이동
- **인라인 rename** — 더블클릭

#### 우측 인라인 TOC (`On this page`)
- 헤딩(H1~H3) 추출 → 우측 200px sticky pane
- 커서 위치 따라 active 행 자동 추적
- 클릭 시 해당 헤딩으로 점프
- 헤딩 0개면 자동 collapse

#### 윈도우 / 멀티탭
- **macOS native window tabbing** — ⌘T로 새 탭 (각 탭 독립 AppState)
- **frame autosave** — 다음 실행 시 위치/크기 복원, 다중 모니터 OK
- **사이드바 토글** — ⌘⇧D

#### 테마 & 폰트
- **4종 테마** — Light / Dark / Sepia / Paper (⌘⇧1~4)
- **5종 폰트** — System / Pretendard / JetBrains Mono / SF Mono / iA Writer Quattro (Format > Font)
- 코드 블록은 항상 JetBrains Mono 고정

#### 발표 모드
- **⌘⇧P** — 현재 문서를 별도 윈도우 + 풀스크린으로 띄움
- marked.js로 깔끔한 HTML 렌더 + highlight.js 코드 syntax
- **⌘+휠**로 확대/축소, **trackpad pinch** 지원
- **ESC**로 종료 (풀스크린 → 빠진 후 윈도우 close까지 자동)

---

## 🛠 Build

```bash
# 의존성 (한 번만)
npm install

# 디버그 빌드 + 실행
./build.sh
open "build/Markdown Note.app"

# 릴리즈 빌드 + /Applications 설치
./build.sh release
cp -R "build/Markdown Note.app" /Applications/
```

요구사항:
- **macOS 14.0+** (NSImage SVG 디코딩 등에 필요)
- **Swift 5.9+** — Command Line Tools만 있어도 OK (Xcode 풀 설치 불필요)
- **Node 18+** — esbuild로 CodeMirror 번들 생성

---

## ⌨️ 키보드 단축키

| 단축키 | 동작 |
|---|---|
| ⌘O | 폴더 열기 |
| ⌘N | 새 파일 |
| ⌘T | 새 탭 |
| ⌘S | 저장 |
| ⌘F | 검색 |
| ⌘⇧D | 사이드바 토글 |
| ⌘⇧P | 발표 모드 |
| ⌘⇧1~4 | Light / Dark / Sepia / Paper |
| ESC | 검색 / 발표모드 닫기 |

---

## 🏗 Architecture

### 왜 WKWebView?
macOS Sequoia에서 SwiftUI 합성 안의 NSTextView 글리프가 invisible해지는 환경 이슈가 발견됨. 메인 에디터를 WebKit 분리 프로세스에서 그리는 **WKWebView + CodeMirror 6** 조합으로 우회.

### 폴더 구조
```
Sources/MarkdownEditor/
├── App.swift                 # @main + AppDelegate (메뉴바, 멀티탭, 발표모드 dispatch)
├── MainWindow.swift          # NSWindow + NSToolbar + NSSplitViewController (3-pane)
├── EditorViewController.swift # WKWebView 호스팅 + JS 브리지 (textChanged / cursorLine 등)
├── PresentationWindow.swift  # 발표 모드 별도 NSWindow (⌘+wheel zoom 포함)
├── FolderSidebar.swift       # SwiftUI 사이드바 트리 (NSHostingController wrap)
├── TocPanel.swift            # 우측 인라인 TOC pane
├── TitleBar.swift            # toolbar 가운데 "파일명 — Edited 2분 전"
├── Icon.swift                # 디자인 시스템 inline SVG → NSImage
├── AppState.swift            # ObservableObject (트리/선택/텍스트/테마/폰트/outline)
├── FileNode.swift            # 트리 모델
├── Theme.swift               # 4종 테마 색상
├── EditorFont.swift          # 5종 폰트 옵션
└── Resources/
    ├── editor.html           # CodeMirror 호스트
    ├── editor.js             # CM6 확장 + JS 브리지
    ├── cm.bundle.js          # esbuild 번들 (Sources/cm-bundle 에서 생성)
    ├── presentation.html     # marked.js 발표 모드
    └── AppIcon.icns

Sources/cm-bundle/index.js    # CodeMirror 6 export → esbuild → cm.bundle.js
```

### 디자인 시스템
- **Mock A "Safe" variant** (`/design_handoff_markdown_note/`) 토큰 정확히 적용
  - sidebar/toolbar `#f5f5f7`, editor `#ffffff`, body 13px / letter-spacing -0.005em
  - 마크다운 syntax 색상 (`#0066cc` link, `#34a89c` list, `#c71f3a` code-fg, etc.)
- **Inline TOC card** (`/design_handoff_toc_inline/`) variant ④ 적용
  - 200px sticky right gutter, active 행 2×12 accent rail + soft tinted background

### NSToolbar / titlebar customization
macOS의 자동 vibrant blur material을 정확한 디자인 토큰 색상으로 대체:
1. `titlebarAppearsTransparent = true`
2. NSTitlebarView 안의 `NSVisualEffectView`를 view tree에서 `removeFromSuperview`
3. `NSTitlebarContainerView`에 단색 NSView를 직접 install
4. 사이드바 boundary 위치에 1px vertical separator 동적 갱신
5. NSSplitView를 `object_setClass`로 `TonedSplitView`로 swap → divider 색 분리 (sidebar↔editor 0.10, editor↔TOC 0.04)

---

## 🙏 Acknowledgements

- **CodeMirror 6** — Marijn Haverbeke et al. (MIT)
- **reveal.js / marked / highlight.js** — 발표 모드용 (각각 MIT)
- **JetBrains Mono** — JetBrains (OFL 1.1)
- **Pretendard** — orioncactus (OFL 1.1)
- **디자인 핸드오프** — `design_handoff_markdown_note` (Mock A Safe variant) + `design_handoff_toc_inline` (variant ④)

---

## 📦 배포

```bash
# .app을 zip으로 패키징
cd build && ditto -c -k --keepParent "Markdown Note.app" "Markdown Note.zip"
```

ad-hoc 서명이라 다른 맥에서 첫 실행 시 **우클릭 > 열기**로 Gatekeeper 경고를 한 번 dismiss해야 함.
