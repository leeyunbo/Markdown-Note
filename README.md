# Markdown Note

> 손글씨 노트북에 쓰듯이, 자연스럽게 — macOS용 마크다운 에디터.

![Markdown Note — Composition Notebook v2.0.0](docs/screenshots/hero.png)

빨간 좌측 margin · 가로 ruled paper · marbled book spine · 손글씨 헤딩 · 손그림 코드 박스 · 노션식 라이브 프리뷰. 모든 시각 요소를 직접 그려 노트북 컨셉을 하나로 묶었다.

---

## ✨ 무엇이 다른가

### Composition Notebook 디자인 시스템 — v2.0.0

- **노트북 페이퍼** — 30px 간격 가로 룰 + 좌측 빨간 double-margin
- **52px marbled spine** — 책 등 marble 패턴 + `Composition · 100 sheets` 라벨
- **손글씨 폰트** — 영문/특수 Excalifont + 한글 NanumPenScript (자동 unicode-range)
- **손그림 데코** — 코드블록 HandBox / 인라인 코드 outline / 헤딩 squiggle / 체크박스 / 할 일 strike 전부 손그림 SVG
- **사이드바 stamp box** — Name / Date / Subject 노트북 표지 라벨 + 파일 트리
- **우상단 손글씨 날짜** — 현재 파일의 modification date를 자동 표시
- **빈 문서 가이드** — 새 노트 열면 손글씨 메모로 마크다운 syntax 안내
- **Light + Dark** — paper `#fdfbf5` / `#1b2233`, accent `#c8442a` / `#e8826b`

### 글쓰기

- **라이브 프리뷰** — Notion / Obsidian 식. 마크다운 마커는 커서가 없는 줄에서 사라지고, 들어가면 다시 나타남
- **풀 마크다운** — 헤딩 1~6 / 리스트 / 체크박스 / 인용문 / 코드 펜스 / 링크 / 이미지 / 표
- **이미지 드래그 & 드롭** — `attachments/` 폴더로 자동 저장 + 마크다운 링크 자동 삽입 + 인라인 미리보기
- **검색** — `⌘F` 문서 내 / `⌘K` 전역 (작업 중)
- **자동 저장** — 타이핑 멈추면 알아서

### 코드

- **JetBrains Mono** + 따뜻한 SYN 팔레트 (keyword red / type green / string amber / number teal)
- **HandBox** — 손그림 사각형 outline + lang 탭 + copy 칩 + 28px line number gutter
- **인라인 코드** — 손그림 outline + accent 색 + 본문보다 작은 글자

### 폴더 관리

- 폴더 단위 노트 — 사이드바 트리에서 탐색
- 새 파일 / 새 폴더 / 이름 변경 / 드래그 이동 / 멀티 선택 삭제

### 발표 모드

`⌘⇧P` → 풀스크린 슬라이드. `⌘` + 휠 / 핀치 줌. `ESC`로 종료.

---

## ⌨️ 단축키

| 단축키 | 동작 |
|---|---|
| `⌘O` | 폴더 열기 |
| `⌘N` | 새 파일 |
| `⌘T` | 새 윈도우 |
| `⌘S` | 저장 |
| `⌘F` | 문서 내 검색 |
| `⌘⇧D` | 사이드바 토글 |
| `⌘⇧P` | 발표 모드 |
| `⌘⇧1` ~ `⌘⇧4` | 테마 전환 (Light / Dark / Sepia / Paper) |
| `ESC` | 검색 / 발표 모드 닫기 |

---

## 📥 설치

### 다운로드

[Releases 페이지](https://github.com/leeyunbo/Markdown-Note/releases/latest)에서 최신 `Markdown-Note-vX.Y.Z.zip` 다운로드.

### 첫 실행

1. zip 더블클릭 → `Markdown Note.app` 추출
2. `/Applications/`로 드래그
3. **첫 실행만** 우클릭 → 열기 → 경고창에서 **열기** 클릭 *(macOS 보안 정책상 한 번만 필요)*

### 직접 빌드

```bash
git clone https://github.com/leeyunbo/Markdown-Note.git
cd Markdown-Note
npm install
./build.sh release
open "build/Markdown Note.app"
```

요구사항: macOS 14+, Node 18+, Swift 5.9+ (Xcode Command Line Tools).

---

## 🛠️ 아키텍처 — 한 줄

`CodeMirror 6` (TypeScript, WKWebView 안) + `AppKit / SwiftUI` (윈도우 / 사이드바 / 툴바). `CoreEditor` 패키지가 에디터 코어, `MarkdownEditor`가 native 셸. 빌드 산출물 `cm.bundle.js`가 양쪽을 잇는다.

---

## 🙏 Credits

- **[CodeMirror 6](https://codemirror.net/)** — 에디터 코어
- **[MarkEdit](https://github.com/MarkEdit-app/MarkEdit)** — NodeMatcher 패턴 + 안정화 참고
- **[Excalifont](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts)** + **[Nanum Pen Script](https://fonts.google.com/specimen/Nanum+Pen+Script)** + **[JetBrains Mono](https://www.jetbrains.com/lp/mono/)** — 타이포그래피
- **[marked.js](https://marked.js.org/)** + **[highlight.js](https://highlightjs.org/)** — 발표 모드 렌더링
- 디자인 시스템 — Composition Notebook handoff (`design_handoff_composition_notebook`)

---

Made with ☕ on macOS.
