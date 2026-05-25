# CoreEditor TS 마이그레이션 — Phase 1 Design

작성일: 2026-05-25
상태: Draft — 사용자 검토 대기

## 1. 목표

`Sources/MarkdownEditor/Resources/editor.js` (1167줄 단일 vanilla JS) 를 `Sources/CoreEditor/src/` 하위 TypeScript 모듈 ~15개로 분리한다. 빌드 산출물(`cm.bundle.js`)과 외부에서 보는 동작은 변하지 않는다.

## 2. Non-goals (이번 spec에서 다루지 않음)

다음은 **별도 spec**으로 진행한다. 이번 작업은 마이그레이션만:

- 테스트 인프라 셋업 자체(Jest + Stryker 도입)는 이번에 같이 한다. 단 **각 기존 모듈의 80% 커버리지 달성**은 모듈 이전 PR 안에서. 신규 기능 테스트는 별도 spec.
- MarkEdit식 `matchers/lezer.ts` 매처 추상화 도입(= 안정성 향상의 핵심) → Phase 3
- 신규 기능 추가(completion, snippets, frontMatter 등) → Phase 4+
- Swift 코드 변경 → 없음. HTML이 같은 산출물을 로드.

## 3. 확정된 결정 (브레인스토밍 합의)

| 항목 | 결정 |
|---|---|
| 빌드 도구 | esbuild 유지 + TS 추가 (Vite 도입 안 함) |
| 산출물 | 기존과 동일: `Resources/cm.bundle.js` 단일 IIFE bundle |
| 디렉토리 | `Sources/CoreEditor/src/` (기존 `Sources/cm-bundle/`는 흡수 후 삭제) |
| 마이그 전략 | 별도 브랜치(`feature/coreeditor-ts-migration`)에서 점진 커밋 → main에 **원샷 머지** |
| Mutation testing | Stryker (PiTest는 Java 전용이라 적용 불가) |
| 커버리지 게이트 | **도메인 코드만** line 80% + mutation 80%. 도메인 = 순수 로직 (lezer 매칭, 파서, 유틸 등) |
| 도메인 제외 | bridge, wiring, DOM 생성 widget, AppKit 통합 |
| Swift macOS 타겟 | 13.0 유지 |

## 4. 디렉토리 구조

```
Sources/
  CoreEditor/                       (신규)
    package.json                    — esbuild + TS deps. 루트 package.json 흡수 or 자체 보유
    tsconfig.json
    src/
      index.ts                      — entry. EditorView 생성, Compartment, appBridge wiring
      extensions.ts                 — markdown() + keymaps + history + search 묶음
      styling/
        base-theme.ts               — EditorView.theme(baseTheme)
        highlight.ts                — mdHighlight HighlightStyle
        markdown-tags.ts            — lezer tag → CSS class 매핑 (신규 추상화)
      nodes/
        inline-code.ts              — InlineCode decoration
        code-block.ts               — FencedCode line decoration
        list-mark.ts                — ListMark depth color cycle
        indented-reset.ts           — IndentedCode mono leak 차단
        image.ts                    — ImageWidget + parseAltAndSize + imageSrcForRender
        mermaid.ts                  — Mermaid toggle + StateField hidden lines
      plugins/
        task-line.ts                — taskLinePlugin
        line-kind-gutter.ts         — 좌측 line-kind gutter
        doc-folder.ts               — docFolderEffect / state
      search/
        panel.ts                    — 검색 패널 theme
      bridge/
        app-bridge.ts               — window.appBridge 핸들러
        outgoing.ts                 — webkit.messageHandlers 호출 wrapper
        diagnostics.ts              — onerror / unhandledrejection forwarder
      utils/
        lezer-walk.ts               — syntaxTree walk 헬퍼
        types.ts                    — 공유 타입
      cm-reexports.ts               — 기존 Sources/cm-bundle/index.js 흡수
    test/
      nodes/
        image.test.ts               — parseAltAndSize, imageSrcForRender (순수 함수)
        ...
      plugins/
        task-line.test.ts
      utils/
        lezer-walk.test.ts
  MarkdownEditor/                   (Swift 11개 파일 — 변경 없음)
    Resources/
      cm.bundle.js                  — esbuild 산출물 (위치 동일, 내용은 TS에서 빌드된 것)
      editor.html                   — 변경 없음 (cm.bundle.js 그대로 로드)
      editor.js                     — 마이그 끝 후 삭제. 그 전까지는 점진 축소
      vendor/                       — 변경 없음
```

## 5. 모듈 매핑 (editor.js → src/)

| editor.js 위치 | 이전 후 위치 |
|---|---|
| L1-15 `window.CM` destructure | `index.ts` (import에서 처리) |
| L16-220 `baseTheme` | `styling/base-theme.ts` |
| L222-260 `mdHighlight` | `styling/highlight.ts` |
| L262-311 ImageWidget + parseAltAndSize + imageSrcForRender | `nodes/image.ts` |
| L313 `docFolderEffect` | `plugins/doc-folder.ts` |
| L317-... `taskLinePlugin` | `plugins/task-line.ts` |
| L521-635 Mermaid StateField / toggle / hidden lines | `nodes/mermaid.ts` |
| L638-692 IndentedCode reset | `nodes/indented-reset.ts` |
| L693-726 ListMark depth cycle | `nodes/list-mark.ts` |
| L727+ Block decoration StateField (mermaid 외 공통) | 해당 노드 파일 내부로 분산 |
| line-kind gutter | `plugins/line-kind-gutter.ts` |
| inline code decoration | `nodes/inline-code.ts` |
| code block decoration | `nodes/code-block.ts` |
| search panel theme | `search/panel.ts` |
| `window.webkit.messageHandlers.*.postMessage` 호출 | `bridge/outgoing.ts` (래퍼 함수로) |
| `window.appBridge.*` 정의 | `bridge/app-bridge.ts` |
| `window.onerror` / `unhandledrejection` | `bridge/diagnostics.ts` |
| EditorView 생성, extension 묶기, Compartment | `index.ts` |

세부 줄 번호는 작업하면서 확정 (위는 대략적인 mapping).

## 6. 빌드 toolchain

### 6.1 변경 사항

```
package.json
  scripts:
    build: esbuild Sources/CoreEditor/src/index.ts
           --bundle --format=iife --global-name=CM
           --outfile=Sources/MarkdownEditor/Resources/cm.bundle.js
           --target=safari16 --minify
    watch: 동일하지만 --watch
    typecheck: tsc --noEmit
    test: jest
    test:mutate: stryker run
  devDependencies 추가:
    typescript, @types/node, jest, @types/jest, ts-jest, happy-dom,
    @stryker-mutator/core, @stryker-mutator/jest-runner, @stryker-mutator/typescript-checker

tsconfig.json (신규)
  target: ES2022, module: ESNext, moduleResolution: bundler
  strict: true, noImplicitAny, noUncheckedIndexedAccess
  jsx: 없음, lib: [ES2022, DOM, DOM.Iterable]
  paths: 없음
  include: Sources/CoreEditor/src/**/*.ts
```

### 6.2 빌드 산출물 동등성

- 산출물 경로 동일: `Sources/MarkdownEditor/Resources/cm.bundle.js`
- 산출물 형태 동일: IIFE, `var CM = (()=>{...})()`
- `editor.html`은 변경 없음 (`<script src="cm.bundle.js">` 그대로)
- 따라서 **Swift 코드 / `build.sh` / Info.plist 변경 0건**

## 7. Bridge globals 처리

현재 사용 중인 globals를 두 방향으로 정리:

### 7.1 외부 → JS (incoming, Swift가 호출)

`window.appBridge` 한 객체에 모음:

```typescript
// bridge/app-bridge.ts
interface AppBridge {
  setText(text: string): void;
  setTheme(themeName: ThemeName): void;
  scrollToLine(line: number): void;
  setDocFolder(folderUrl: string): void;
  insertImage(path: string, alt?: string): void;
}

export function installAppBridge(view: EditorView): void {
  (window as any).appBridge = {
    setText: (text) => { ... },
    setTheme: (name) => { ... },
    // ...
  };
}
```

### 7.2 JS → 외부 (outgoing, JS가 Swift로)

`window.webkit.messageHandlers` 직접 호출은 금지. 래퍼 함수로:

```typescript
// bridge/outgoing.ts
export function postTextChanged(text: string): void {
  window.webkit?.messageHandlers?.textChanged?.postMessage(text);
}

export function postCursorLine(line: number): void {
  window.webkit?.messageHandlers?.cursorLine?.postMessage(line);
}

export function postConsoleLog(msg: string): void {
  window.webkit?.messageHandlers?.consoleLog?.postMessage(msg);
}
// ... 등
```

다른 모듈에서는 `window.webkit` 직접 접근 금지 (lint 룰로 강제 가능). Swift 측 핸들러 추가 시 한 파일(`outgoing.ts`)만 보면 됨.

### 7.3 Mermaid

`window.mermaid` 는 외부 vendor 라이브러리. `nodes/mermaid.ts` 안에서만 접근.

## 8. 테스트 전략

### 8.1 게이트

- **도메인 코드 line coverage ≥ 80%**
- **도메인 코드 mutation score (Stryker) ≥ 80%**
- 게이트는 CI에서 검증 (이번 PR에 GitHub Actions workflow 추가는 **out of scope** — 로컬에서만 확인). CI 추가는 별도 spec.

### 8.2 도메인 / 비도메인 구분

**도메인 (테스트 대상):**
- `utils/lezer-walk.ts`
- `nodes/image.ts` 의 `parseAltAndSize`, `imageSrcForRender`
- `nodes/mermaid.ts` 의 코드 펜스 파싱 / hidden-line 결정 로직 (DOM 생성 부분 제외)
- `nodes/list-mark.ts` depth 계산
- `nodes/task-line.ts` 의 task marker regex / `[x]` 판별
- `plugins/doc-folder.ts` 의 docFolderURL 정규화 로직

**비도메인 (테스트 면제):**
- `index.ts`, `extensions.ts` (wiring)
- `bridge/*` (I/O 어댑터)
- `styling/base-theme.ts` (선언적 데이터)
- 모든 `WidgetType.toDOM()` 메서드 (DOM 생성)
- `editor.html`, Swift 모든 파일

### 8.3 테스트 환경

- Jest + ts-jest + happy-dom
- CodeMirror 6 의존 테스트(예: lezer-walk)는 실제 `EditorState`/`syntaxTree` 사용 — mock 안 함
- Stryker는 도메인 파일만 mutate (`mutate` 패턴으로 한정)

## 9. 마이그레이션 순서 (한 브랜치 안에서)

브랜치: `feature/coreeditor-ts-migration`. 아래는 커밋 단위 가이드 (PR 자르지 않음, 한 번에 머지):

1. **인프라 셋업** — `CoreEditor/{package.json, tsconfig.json, src/index.ts, src/cm-reexports.ts}` 추가. 기존 `cm-bundle/index.js` 내용을 cm-reexports.ts로 옮기고 build script만 새 path로 변경. `editor.js` 그대로 동작 확인.
2. **순수 유틸 먼저** — `utils/lezer-walk.ts`, `nodes/image.ts` 의 parseAltAndSize/imageSrcForRender. 테스트 동봉.
3. **decoration 노드 하나씩** — list-mark → indented-reset → inline-code → code-block → image widget → mermaid 순. 각 커밋에서 editor.js의 해당 부분 삭제 + import로 교체.
4. **plugins** — task-line → line-kind-gutter → doc-folder.
5. **search** — search panel.
6. **theme** — base-theme.ts, highlight.ts, markdown-tags.ts.
7. **bridge** — app-bridge, outgoing, diagnostics. editor.js에서 직접 호출 부분 마지막에 옮김.
8. **editor.js 삭제** — 모든 내용이 src/로 이동했음을 확인. `<script src="editor.js">` 라인을 `editor.html`에서 제거.
9. **타이프체크 + 풀 테스트 + 수동 smoke test (build.sh → open .app → 기본 동작 확인)**.
10. **PR 생성 + main 머지** (사용자 수동).

## 10. 완료 정의 (Definition of Done)

다음 조건 **전부** 만족:

- [ ] `editor.js` 파일이 삭제되었음
- [ ] `cm.bundle.js` 크기가 마이그 전과 비슷한 범위 (±10%) 이내
- [ ] `npm run typecheck` 통과 (오류 0)
- [ ] `npm run test` 통과, 도메인 line coverage ≥ 80%
- [ ] `npm run test:mutate` 통과, 도메인 mutation score ≥ 80%
- [ ] `build.sh` 가 변경 없이 그대로 빌드 성공 (또는 cm.bundle 빌드 entry point만 수정)
- [ ] `.app` 실행 후 수동 smoke test 항목 통과:
  - 새 노트 작성, 자동 저장
  - bold/italic/heading 라이브 렌더
  - 인라인 코드 caret 진입 (회귀 #46cc1b6 항목)
  - 이미지 드래그 & 드롭
  - Mermaid 토글
  - 발표 모드 ⌘⇧P (현 main 동작 그대로 — 이번 마이그가 발표 모드를 더 깨뜨리지 않는지만 확인. 발표 모드 자체의 안정화는 out of scope)
  - 4테마 전환 ⌘⇧1~4
  - 검색 ⌘F
  - 폴더 사이드바 (탭 ⌘T, 새 파일 ⌘N)

## 11. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 한 브랜치에서 작업 길어져 main과 conflict | 작업 중 main에 무관한 변경만 merge 들어오면 영향 적음. 마이그 영역(editor.js, cm-bundle/) 다른 사람이 안 건드린다는 전제. |
| Mermaid widget이 CodeMirror block decoration 규칙(StateField only)으로 작동 → 추출 시 깨질 위험 | mermaid 모듈을 가장 마지막 단계에 추출. 추출 전후로 수동 smoke 필수. |
| Stryker mutation score 80% 도달 어려움 (도메인 로직이 작아서) | 도메인 범위를 너무 넓게 잡지 않음. 진짜 순수한 곳만. 80% 어려우면 spec 수정 후 사용자 재승인. |
| WKWebView가 새 bundle 형식을 다르게 해석 | 산출물 형식 동일 유지 (IIFE + `var CM=`). esbuild target safari16 유지. |
| TS strict 모드에서 기존 코드 타입 오류 폭발 | 모듈 이전 시점에 타입 추가. 점진. 임시 `any`는 OK, 단 PR 끝나면 모두 제거. |

## 12. Out of scope (반복 강조)

- 신규 기능 추가
- MarkEdit 매처 패턴 도입 (Phase 3)
- CI workflow 추가
- Swift 측 리팩토링
- Vite 도입
- 라이선스 / README 변경
- 발표 모드 안정화 / 재구현 — 별도 spec (Phase 2 후보. 현재 main에 존재하지만 사용자 신고상 장애 있음)
