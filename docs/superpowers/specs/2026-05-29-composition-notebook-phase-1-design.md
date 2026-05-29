# Composition Notebook Skin — Phase 1 Design (Core Identity, Light)

작성일: 2026-05-29
상태: Draft — 사용자 검토 대기
브랜치: `feature/composition-notebook-skin`
디자인 핸드오프: `/tmp/md_design_handoff/design_handoff_composition_notebook/` (원본 zip: `~/Downloads/markdown editor (2).zip`). 권위 있는 값은 `design-files/variants/composition-full.jsx`.

## 1. 목표 / 스코프

현재 "Markdown Note"의 Pretendard·플랫(#f5f5f7) 룩을 **Composition Notebook 정체성으로 전면 교체**. 이번 Phase는 **Light("Day") 팔레트만**, 코어 정체성(셸 + 종이 에디터 테마 + 폰트)까지.

이것은 *스킨/아이덴티티 교체*이지 재설계가 아니다. 파일 사이드바 + 툴바 + 라이브 프리뷰 본문 구조는 유지하되, 표면을 노트북으로 바꾼다.

### Non-goals (Phase 2–4, 별도 spec)
- 손그림 데코: HandCheckbox/HandStrike(할 일), HandBox(코드블록 프레임)
- 마커 dimming 라이브 프리뷰(Notion/Obsidian식 인라인 변환)
- Dark/Sepia/Paper 팔레트 + ⌘⇧1–4 테마 전환
- Find & Replace 리테마(@codemirror/search)
- ⌘K 파일 스위처(native 패널)
- Preferences 시트(폰트 토글 kalam/mono/serif, 글자크기, behavior 토글)
- 펜닙(PenNib) 캐럿 마커 (Phase 1은 1.5px accent 캐럿만)

## 2. 확정된 결정 (브레인스토밍 합의)

| 항목 | 결정 |
|---|---|
| 첫 슬라이스 | Phase 1 코어 정체성, **Light 팔레트만** |
| 폰트 소싱 | Caveat(variable) + Kalam(400/700) TTF를 google/fonts에서 직접 다운로드 |
| 우측 TOC 패널 | **제거** (README 3컬럼 그리드: spine·sidebar·body) |
| 기존 룩 | 완전 교체 (notebook 정체성이 유일한 룩) |
| spine | 고정 52px leading `NSView` (split item 아님) |
| squiggle 밑줄 | Phase 1 포함 (H1/H2) |
| 마커 dimming | Phase 2로 — Phase 1은 현재 syntax highlight 유지 |

## 3. 디자인 토큰 (Light "Day", `PAL_LIGHT`)

| 토큰 | 값 |
|---|---|
| paper | `#fdfbf5` (본문 + 사이드바 + 시트 배경) |
| rule | `#9bb8d480` (가로 룰드 라인, 파랑 50%) |
| marginRed / accent | `#c8442a` (빨간 마진, squiggle, current-line, selection) |
| ink | `#1a2a4a` (본문 텍스트) |
| inkLight | `#5a6a85` (보조/완료 텍스트) |
| inkFaint | `#a0aebd` (placeholder) |
| separator | `rgba(0,0,0,.08)` |
| current-line tint | `rgba(200,68,42,.10)` |
| codeBg | `#fffaef` |

폰트:
- **Caveat** — 디스플레이/헤딩/UI 라벨 (H1/H2 700, 크롬 500–600)
- **Kalam** — 본문/리스트/파일명 (400, 700)
- **JetBrains Mono** — 코드/키캡 (이미 번들됨)

## 4. AppKit 셸

### 4.1 윈도우 (`MainWindow.swift`, `App.swift`)
- 기본 1280×800 (현재 1200×800 → 1280×800), min 720×480 (유지).
- styleMask에 **`.fullSizeContentView` 추가**: `[.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]`. `titlebarAppearsTransparent = true` 유지, `titleVisibility = .hidden` 유지.
- `window.backgroundColor` = paper `#fdfbf5`.
- 결과: 종이 배경이 툴바 영역 뒤까지 연속.

### 4.2 레이아웃: `[52px spine | 240px sidebar | 1fr body]`
- contentView 구성: 고정 leading **`SpineView`**(52px) + `NSSplitViewController`(sidebar 240 + body). spine은 split 밖의 고정 NSView (leading constraint).
- **우측 TOC 제거**: `tocItem` 및 `splitVC.addSplitViewItem(tocItem)`, `state.$outline` → toc collapse 구독, `TonedSplitView.drawDivider`의 idx 분기(이제 divider 1개만) 정리. TocPanel.swift는 Phase 1에서 미사용(파일은 남기되 셸에서 분리).

### 4.3 마블 spine (신규 `SpineView.swift`, 52px)
CSS 그라데이션을 CALayer로 재현 (값 verbatim, composition-full.jsx L43–54):
```
linear-gradient(180deg, rgba(0,0,0,.08) 0%, transparent 4%, transparent 96%, rgba(0,0,0,.08) 100%),
repeating-linear-gradient(115deg,
  #1a1a1a 0–6px, #2a2a2a 6–12px, #f5f5f5 12–14px, #2a2a2a 14–20px,
  #1a1a1a 20–28px, #f5f5f5 28–30px, #2a2a2a 30–38px, #1a1a1a 38–50px)
```
- `border-right: 1px solid rgba(0,0,0,.30)`, `box-shadow: inset -2px 0 4px rgba(0,0,0,.20)`.
- 세로 라벨 `Composition · 100 sheets` — Caveat 17/700, letterSpacing 1, color `#1a1a1a`, bg `#fff`, padding `14px 6px`, `2px solid #1a1a1a`, `writing-mode: vertical-rl; transform: rotate(180deg)`, 중앙 정렬.
- 구현: spine 그라데이션은 SVG를 `WKWebView` 대신 `NSView`+CALayer(`CAGradientLayer` 2겹) 또는 정적 SVG→NSImage. **결정: CALayer 2겹**(115deg repeating은 CAGradientLayer로 안 됨 → 정적 SVG 렌더 후 NSImageView가 단순). **최종: 작은 SVG 문자열을 NSImage로 렌더해 NSImageView 타일링.** (plan에서 확정.)

### 4.4 사이드바 (240px, `FolderSidebar.swift` SwiftUI 리스킨)
- 배경 paper `#fdfbf5`.
- 상단 traffic-lights 행은 윈도우 기본 신호등이 spine/사이드바 경계 위에 위치 (fullSizeContentView). 사이드바 자체 상단 패딩 확보.
- **Stamp box**: 손그림 느낌 rounded rect 카드(흰 배경), 3필드 — `Name:` / `Date:`(오늘 날짜) / `Subject:`(현재 rootFolder 이름, Caveat 20/700 accent, 밑줄). composition book 표지 라벨.
- **파일트리**: Kalam 15, 행 vertical padding 2px, indent `depth*14 + 8`. 폴더 chevron `▸/▾` 10px inkLight. 현재 파일 = bold + `cur` tint bg + `3px solid accent` 좌border + radius 3.
- **Footer**: Caveat 18 inkLight, `N pages` / `p. x / 100` 분할. (페이지 수 = 폴더 내 .md 개수 등, plan에서 매핑.)

### 4.5 툴바 (44px)
- `1px dashed separator` 하단 경계 (위로 종이 비침).
- 좌: 문서 제목 Caveat 26/600 (예 `smoke-test.md`), 미저장 시 7px accent dot.
- 우: `✎ auto-saved` Caveat 20 inkLight.
- 기존 toolbar 아이템(sidebar/new/search)은 노트북 톤으로 유지하되 색/폰트만 토큰화.

### 4.6 기존 타이틀바 수술 처리
현재 `killTitlebarVibrancy`/`installTitlebarBackground`/`installTitlebarSeparator`는 paper 전면 배경으로 대체. fullSizeContentView + paper backgroundColor + 사이드바/툴바 paper 배경으로 단색 종이가 전 영역에 깔리므로, vibrancy 제거 로직은 단순화/제거. (native 탭은 이미 비활성 — 충돌 없음.)

## 5. CoreEditor CodeMirror 테마

### 5.1 룰드 페이퍼 (`styling/notebook-paper.ts` 신규 + `editor.html` CSS)
- line-height **30px** (현재 22px → 30px). `.cm-content` font-size는 16.5px(Kalam).
- 가로 룰드: `.cm-content` 배경 `repeating-linear-gradient(to bottom, transparent 0, transparent 29px, #9bb8d480 29px, #9bb8d480 30px)`, `background-size: 100% 30px` (composition-full.jsx L15–16 verbatim). 텍스트가 줄 위에 앉도록 baseline 정렬.
- **빨간 마진**: 본문 좌측 **84px**에 `1.5px solid #c8442a` 세로선 + 그 2px 왼쪽에 1px `#c8442a` 40% (더블룰). `.cm-content` padding-left = **98px** (84+14).
- CodeMirror는 `.cm-content`/`.cm-scroller`에 배경 페인트 + ViewPlugin이나 CSS pseudo로 마진 라인.

### 5.2 팔레트 적용 (`base-theme.ts`, `editor.html` CSS 변수)
기존 `--bg/--fg/--marker/...` CSS 변수 체계를 노트북 Light 토큰으로 재정의:
```
--bg: #fdfbf5; --fg: #1a2a4a; --secondary: #5a6a85; --marker: #a0aebd;
--accent: #c8442a; --rule: #9bb8d480; --code-bg: #fffaef;
--current-line: rgba(200,68,42,.10);
```
Swift `appBridge.setTheme(vars)`가 이 값을 주입(Phase 1은 Light 고정, Phase 3에서 4팔레트 스위칭).

### 5.3 타이포 / 헤딩 (`highlight.ts`, `styling/markdown-tags.ts`, 신규 `nodes/heading-squiggle.ts`)
- H1: Caveat 44/700, lh 1.1, ls −0.5 — 아래에 빨간 **squiggle** 밑줄(w≈300). squiggle은 InlineCode/heading 라인에 widget 또는 background SVG decoration. SVG path는 notebook.jsx `Squiggle` 참조.
- H2: Caveat 28/700 + 빨간 `§`(22px) 마커.
- 본문: Kalam 16.5/400, lh30, ls 0.1.
- 리스트 bullet: 빨간 `·` 20px.
- 코드/인라인코드: JetBrains Mono, codeBg `#fffaef` (코드블록 HandBox 프레임은 Phase 2).
- `mdHighlight`/`markdownTagClasses`에 Caveat heading + Kalam body 클래스 매핑 추가/교체.

### 5.4 current-line + 캐럿
- current-line: `.cm-activeLine`에 `3px solid #c8442a` 좌border (margin-left −3) + `rgba(200,68,42,.10)` 배경. (현재는 activeLine 배경 transparent였음 → 변경.)
- 캐럿: `.cm-cursor` 1.5px `#c8442a`. (펜닙 마커는 Phase 2.)

### 5.5 selection
- selection 배경 accent 계열 — 현재 `rgba(0,102,204,.30)` → `rgba(200,68,42,.22)` 정도(accent tint). pointer-events: none 유지(이전 fix).

## 6. 폰트 번들 (`vendor/`, `Info.plist`, `editor.html`, build.sh)
- `vendor/Caveat-VariableFont_wght.ttf`, `vendor/Kalam-Regular.ttf`, `vendor/Kalam-Bold.ttf` 다운로드 (google/fonts ofl, SIL OFL).
- `Info.plist`(build.sh가 생성): `ATSApplicationFontsPath = .` 또는 `vendor` 추가 → AppKit이 NSFont로 인식. 또는 launch 시 `CTFontManagerRegisterFontsForURL`.
- `editor.html`: `@font-face`로 Caveat/Kalam 추가 (기존 JetBrains Mono 패턴).
- build.sh의 `cp -R Resources/* ...`가 vendor 폰트도 복사 (이미 그러함).

## 7. 단위 분해 (touched / new files)

**Swift (AppKit):**
- `App.swift` — window styleMask에 `.fullSizeContentView`, 기본 크기 1280×800
- `MainWindow.swift` — spine leading view 추가, TOC split item 제거, 타이틀바 수술 단순화, 툴바 토큰화
- `SpineView.swift` (신규) — 52px 마블 spine + 세로 라벨
- `FolderSidebar.swift` — stamp box + Kalam 트리 + footer 리스킨
- `TitleBar.swift` — Caveat 제목 + dirty dot + auto-saved
- `Theme.swift` — 노트북 Light 토큰
- `Info.plist` (build.sh 내) — ATSApplicationFontsPath

**CoreEditor (TS):**
- `styling/notebook-paper.ts` (신규) — 룰드 배경 + 빨간 마진 extension
- `styling/base-theme.ts` — lh 30px, 마진 padding, 색 토큰, current-line, 캐럿, selection
- `styling/highlight.ts` + `styling/markdown-tags.ts` — Caveat heading / Kalam body
- `nodes/heading-squiggle.ts` (신규) — H1/H2 squiggle 밑줄 decoration
- `editor.html` — @font-face(Caveat/Kalam), CSS 변수 노트북 값, 룰드/마진 CSS
- `extensions.ts` — notebook-paper + heading-squiggle 와이어링

**Resources:**
- `vendor/Caveat-*.ttf`, `vendor/Kalam-*.ttf`

## 8. 완료 정의 (DoD)

- [ ] `npm run typecheck` / `npm test` 통과 (기존 97 테스트 유지; 신규 순수 로직 있으면 테스트 추가)
- [ ] `./build.sh debug` 빌드 성공, 폰트 번들 포함
- [ ] 수동 스모크 (Light):
  - [ ] 52px 마블 spine + 세로 라벨 표시
  - [ ] 사이드바 paper 배경 + stamp box(Subject=폴더명) + Kalam 트리 + footer
  - [ ] 툴바 Caveat 제목 + dirty dot + auto-saved, dashed 하단선
  - [ ] 본문: 30px 룰드 라인 위에 텍스트, 84px 빨간 더블 마진
  - [ ] H1 Caveat 44 + squiggle, H2 Caveat 28 + §
  - [ ] 본문 Kalam 16.5, 리스트 빨간 ·
  - [ ] current-line accent 좌border + tint, accent 캐럿
  - [ ] 우측 TOC 없음 (3컬럼)
  - [ ] 종이가 툴바 뒤까지 연속 (fullSizeContentView)
- [ ] 기존 기능 회귀 없음: 자동저장, 이미지 드래그/페이스트, Mermaid 토글, 검색 ⌘F, 새 창 ⌘T, 사이드바 토글 ⌘⇧D

## 9. 리스크

| 리스크 | 대응 |
|---|---|
| AppKit 신호등 위치 (fullSizeContentView + spine) | spine은 신호등 왼쪽 아님 — 신호등은 사이드바 영역 상단. spine은 신호등보다 좁은 52px leading. 신호등이 spine 위로 가지 않도록 사이드바 콘텐츠 top 패딩 + 신호등 기본 위치 확인. |
| 룰드 라인과 텍스트 baseline 정렬 | lineH 30px에 Kalam 16.5 baseline이 줄에 앉도록 line-box 조정 (background-position fine-tune). |
| squiggle SVG가 caret/selection hitbox 방해 | heading 밑줄은 background-image 또는 side widget(side:1, block 아님)으로 — InlineCode hitbox 교훈 적용. |
| Caveat variable font를 AppKit NSFont가 weight 못 잡음 | variable 안 되면 static weight TTF(Caveat-Bold 등)로 fallback. |
| 마블 spine 115deg 그라데이션을 CALayer로 못 그림 | 정적 SVG → NSImage 렌더 후 NSImageView (plan에서 확정). |

## 10. Out of scope (재확인)
Phase 2(데코+라이브프리뷰), Phase 3(4테마+Preferences), Phase 4(Find&Replace+⌘K). 각자 별도 spec.
