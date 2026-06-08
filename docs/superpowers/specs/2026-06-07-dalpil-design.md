# 달필 (Dalpil) — 디자인 적용 스펙

**날짜:** 2026-06-07
**브랜치:** `feature/refract`
**출처:** `markdown editor (6).zip` → `dalpil_handoff/` (README + SKILL + prototype 613줄)

## 개요

달필은 "작성하는 재미"를 핵심으로 한 macOS 마크다운 에디터다. 창을 좌우로 나눠
**왼쪽 = 손으로 쓰는 노트(손글씨 + 종이)**, **오른쪽 = 같은 글이 활자로 조판된 책
페이지**로 보여준다. 초안 → 완성본으로 실시간 "굴절"되는 느낌(= refract).

기존 `feature/refract`는 다중 테마(Night/Day/Sepia/Forest/손글씨) Refract 에디터였다.
이 스펙은 그것을 **달필 단일 미학으로 전면 교체**한다(확정된 핵심 결정).

## 확정된 핵심 결정

1. **전면 교체** — Night/Day/Sepia/Forest 멀티테마, 프리즘 무지개 seam, refraction
   glow, spectrum glyph/dots 제거. 변수축은 테마가 아니라 **3개 Tweaks**.
2. **왼쪽 완전 재현** — 코드/표를 CodeMirror decoration으로 "붙여둔 모노 카드"까지 재현.
3. **Tweaks = 헤더 popover** — 손글씨 폰트(3)·종이 결(4)·토큰 노출(3).
4. 프로토타입 그대로: 책 모드 코드카드는 **줄번호·copy 버튼 없음**(깔끔한 책 느낌).
5. `Theme` enum은 **단일 Dalpil 팔레트**로 축소(call site 보존).

## 디자인 토큰 (정확한 RGB — 핸드오프 그대로)

```
--paper      #f6f0e2   왼쪽 종이 base
--paper-edge #efe7d4   헤더/상태바/칩
--rule       #d3cdbb   괘선·모눈선
--margin     #d98c84   빨간 마진선
--ink        #34302a   손글씨 잉크
--ink-soft   #6f685c   보조 잉크
--page       #fbfaf6   오른쪽 종이 base
--page-ink   #211f1b   조판 본문
--page-soft  #7c7468   조판 보조
--accent     #b56a4f   테라코타 — 토큰/마커/링크/커서
code card bg #2c2a26 / code text #e9e3d6
code tokens  키워드 #e0936b · 문자열 #9ec98a · 주석 #8a8273 · 숫자 #d8b96b
seam         #d8cdb4 → #cdbf9f (1px), ink-bleed radial rgba(181,106,79,.10)
```

## 폰트 (vendor/에 번들 — OFL)

- 손글씨(왼쪽, 사용자 선택 3): **Gaegu**(기본) · **Nanum Pen Script**(흘림) · **Gowun Batang**(정자).
- 조판 세리프(오른쪽): **Nanum Myeongjo** (Regular + ExtraBold/800).
- 모노(코드/표): SF Mono / ui-monospace (시스템).
- 신규 번들: `Gaegu-Regular/Bold`, `NanumMyeongjo-Regular/ExtraBold`, `GowunBatang-Regular`.
  (`NanumPenScript-Regular` 는 이미 번들됨.) Info.plist `ATSApplicationFontsPath=vendor`로 자동 등록.

## 타입 스케일 (1040px 캔버스 기준 px)

- 손글씨 본문 26 / line 38; H1 34, H2 29, H3 26 (모두 700).
- 조판 본문 17 / line 1.85; H1 31/800, H2 22/800, H3 18/700; 인용 italic 17.
- UI 라벨 ≥13px.

## 컴포넌트별 변경

### A. 팔레트 (Theme.swift → DalpilPalette)
- `Theme` enum을 단일 케이스(`.dalpil`)로 축소하거나 단일 팔레트 제공자로 변환.
- 네이티브 chrome(사이드바/윈도우/팔레트)이 쓰는 `state.theme.inkColor` 등 call site는 보존.
- `editor.html :root`에 달필 토큰을 **직접 박음**. `data-theme`/`cssVars` 동적 브릿지 제거.

### B. 헤더 (editor.html + chrome/header.ts)
- 4-bar spectrum glyph → **펜촉 인라인 SVG** + 워드마크 **"달필"**(Nanum Myeongjo 800).
- 파일명 + 미저장 점(테라코타).
- 모드 세그먼트 **노트 / 나란히 / 책**.
- 테마 popover → **Tweaks popover**: 손글씨(개구/펜/정자) · 종이 결(줄/모눈/도트/무지) ·
  마크다운 토큰(보임/옅게/숨김). 클릭 시 즉시 적용 + 영속화 + Swift 브릿지.

### C. 왼쪽 = 손글씨 노트 (CodeMirror)
- `.cm-content`에 손글씨 폰트(`data-hand` 또는 setFontFamily), 본문 26px/38.
- 종이 배경: `data-paper`로 ruled/grid/dot/plain 전환(repeating-linear-gradient/radial).
  빨간 마진선은 ruled/grid에만(`::before`, left ~74px).
- 마크다운 마커 색 = accent, opacity는 `body[data-tok]`로 보임(.7)/옅게(.22)/숨김(0).
  (기존 `tok-*` 클래스 매핑 재활용 + dim 규칙 추가.)
- **코드펜스·표 → 모노 inset 카드**: 신규 CodeMirror `ViewPlugin`이 해당 라인 범위에
  line decoration(`.cm-dalpil-card`: bg rgba(120,104,78,.07), border, radius 8, monospace)
  적용. 펜스 시작/끝 ```와 표 `|...|` 행을 묶어 카드로.

### D. 오른쪽 = 조판된 책 (preview CSS + render.ts)
- Nanum Myeongjo 세리프. 본문 17/1.85, H1 31/800 등 위 스케일.
- 인용: 좌측 3px accent + italic.
- 체크박스: 그린/테라코타 박스, 완료 시 채움 + 취소선.
- 코드블록: 다크 카드(#2c2a26) + **세리프 uppercase 언어 라벨** + 토큰색(주석/키워드/문자열/숫자).
  **줄번호·copy 제거**(프로토타입 그대로). `render.ts`의 `decorateCodeBlocks` 단순화.
- 표: 헤더 밑줄(2px), 세로줄 없음, 마지막 행 경계 없음.
- **책 모드**: 오른쪽만, 가운데 정렬 컬럼 max 680px.

### E. 가운데 솔기 (seam)
- 무지개 프리즘 제거 → 1px `linear-gradient(#d8cdb4,#cdbf9f)` + 좌우 테라코타 ink-bleed
  radial glow. 나란히 모드에서만.

### F. 상태바 (counter pill → 하단 status bar)
- 플로팅 카운터 필 제거. 하단 ~34px 바: **단어수 · 저장 상태 · 잉크 게이지(점 5개, 쓸수록 참)**.
- 저장 상태는 `isDirty` → "방금 저장됨" / "저장 안 됨" 등. 잉크 게이지 = min(5, round(words/9)).

### G. 빈 문서 환영 화면
- 문서가 비면 가운데 카드: 펜촉 + **"오늘의 노트"** + 안내 한 줄 + 단축키 칩
  (`#` 제목 · `-` 목록 · `>` 인용 · `` ` `` 코드 · `|` 표). `display` 토글(첫 글자 입력 시 사라짐).

### H. 상태/설정 (AppState 영속화)
- `editorFont`(EditorFont enum) → 달필 3 손글씨(Gaegu/NanumPen/GowunBatang)로 재정의.
- 신규 `@Published paperTexture`(ruled/grid/dot/plain) + `tokenVisibility`(show/faint/hide), 영속화.
- `viewMode`: source/split/preview → **note/split/book** 으로 값 변경(또는 라벨만 노트/나란히/책).
- 신규 브릿지: `setPaperTexture`, `setTokenVisibility`; `setFontFamily` 재사용.

### I. 메뉴 (App.swift)
- Theme 메뉴 + ⌘⇧1–5 + ⌘⇧L 제거.
- View 모드 라벨 노트(⌘⌥1)/나란히(⌘⌥2)/책(⌘⌥3).
- Format > Font 서브메뉴는 달필 손글씨 3종으로.

### J. 환경설정 창 (RefractPrefs)
- 테마 갤러리 제거. 헤더 popover가 Tweaks의 단일 소스.
- 최소 환경설정(본문 크기/동작 토글)만 남기거나 제거.

## 빌드/검증

- TS 수정 후 `npm run build`(esbuild) → `cm.bundle.js` 재생성. `./build.sh debug`로 앱 빌드.
- `npm run typecheck`, `npm test`로 회귀 확인.
- 수동 검증(Acceptance):
  1. 헤더 위 빈 띠 없음. 2. 왼쪽 종이 손글씨 / 오른쪽 인쇄된 책.
  3. 모든 마크다운 양쪽 렌더(왼쪽 코드/표 모노 카드). 4. 노트/나란히/책 + 스크롤 동기화.
  5. 빈 문서 환영. 6. 따뜻한 종이/잉크 팔레트, 이모지 없음.

## 범위 밖(참고)
- 발표 모드(PresentationOverlayView)는 preview CSS 공유 시 자동으로 달필 조판 상속 — 확인만.
- ⌘K 팔레트는 유지하되 따뜻한 팔레트로 색만 정리.
