# Markdown Note

심플하고 Mac스러운 마크다운 에디터. CodeMirror 6 기반, 폴더 단위 노트 관리.

## 특징

- **인라인 마크다운 스타일링** — 헤딩이 큰 폰트로, **bold** 굵게, *italic* 기울임, `inline code` 배경, ~~strike~~, 마커는 흐리게
- **모든 마크다운 + 일부 HTML** — 헤딩 1~6, 리스트, 체크박스, 인용, 코드블록(```), 링크, 이미지, 표, HR, 인라인 HTML 태그
- **폴더 단위 관리** — 임의 로컬 폴더 또는 iCloud Drive를 열어 트리 탐색, 자동 저장
- **테마** — Light / Dark / Sepia / Paper, 메뉴바 또는 툴바에서 즉시 전환 (⌘⇧1~4)
- **사이드바 토글** — ⌘⇧D
- **Mac 네이티브 chrome** — NSWindow + NSToolbar + NSSplitViewController

## 빌드

```bash
./build.sh release
open build/"Markdown Note.app"
# 설치
cp -R build/"Markdown Note.app" /Applications/
```

## 키보드

| 단축키 | 동작 |
|---|---|
| ⌘O | 폴더 열기 |
| ⌘N | 새 파일 |
| ⌘S | 저장 |
| ⌘⇧D | 사이드바 토글 |
| ⌘⇧1~4 | Light / Dark / Sepia / Paper |

## 아키텍처

macOS Sequoia에서 SwiftUI 합성 안의 NSTextView 글리프 그리기가 invisible해지는 환경 이슈를 우회하기 위해, 메인 에디터는 WebKit 분리 프로세스에서 그리는 WKWebView를 contenteditable로 사용한다.

```
Sources/MarkdownEditor/
├── App.swift              # @main + AppDelegate, 메뉴바 직접 구성
├── MainWindow.swift       # NSWindow + NSToolbar + NSSplitViewController
├── EditorViewController.swift  # WKWebView 호스팅, JS 브리지
├── FolderSidebar.swift    # SwiftUI 사이드바 (NSHostingController로 wrap)
├── AppState.swift         # ObservableObject (파일 트리, 선택, 텍스트, 테마)
├── FileNode.swift         # 트리 모델
├── Theme.swift            # 4종 테마 색상
└── Resources/
    ├── editor.html        # 에디터 HTML + 인라인 스타일 CSS
    └── editor.js          # contenteditable + 라인 단위 syntax 처리
```

## 요구사항

- macOS 13.0+
- Swift 5.9+ (Command Line Tools 만 있어도 OK, 풀 Xcode 불필요)
