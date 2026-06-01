# Composition Notebook Skin — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin "Markdown Note" into the Composition Notebook identity — Light palette only: bundled handwriting fonts, ruled-paper CodeMirror theme with a red margin, Caveat headings, Kalam body, and an AppKit shell with a marbled spine + paper sidebar/toolbar.

**Architecture:** Two surfaces. (1) CoreEditor TS / CodeMirror theme + decorations + CSS in `editor.html` for the paper body. (2) Swift/AppKit (`Sources/MarkdownEditor/*.swift`) for the window chrome (marble spine, sidebar, toolbar, full-size-content transparent titlebar). No React port — values lifted from the design handoff.

**Tech Stack:** TypeScript + CodeMirror 6 (existing CoreEditor), esbuild, Swift/AppKit/SwiftUI, Caveat + Kalam (SIL OFL) + JetBrains Mono fonts.

**Branch:** `feature/composition-notebook-skin` (already created).

**Spec:** `docs/superpowers/specs/2026-05-29-composition-notebook-phase-1-design.md`. Handoff reference: `/tmp/md_design_handoff/design_handoff_composition_notebook/` (authoritative values in `design-files/variants/composition-full.jsx` and `notebook.jsx`).

**Verification note:** This is a visual skin. Most tasks are not unit-testable; verification is `npm run build` + `npm run typecheck` + `./build.sh debug` + a **manual smoke** (the user runs the app). Where a pure predicate exists (e.g., "which heading nodes get a squiggle"), add a Jest test. Existing 97 tests must keep passing.

---

## File Structure

```
Sources/MarkdownEditor/
  App.swift                    — window styleMask += .fullSizeContentView, default 1280×800
  MainWindow.swift             — add SpineView leading, remove TOC split item, simplify titlebar
  SpineView.swift              — NEW: 52px marbled spine + vertical label
  FolderSidebar.swift          — stamp box + Kalam tree + footer reskin
  TitleBar.swift               — Caveat title + dirty dot + auto-saved
  Theme.swift                  — notebook Light tokens (NSColor)
  Resources/
    editor.html                — @font-face Caveat/Kalam, notebook CSS vars, ruled+margin CSS
    vendor/
      Caveat[wght].ttf         — NEW (download)
      Kalam-Regular.ttf        — NEW (download)
      Kalam-Bold.ttf           — NEW (download)
Sources/CoreEditor/src/
  styling/notebook-paper.ts    — NEW: ruled background + red margin extension
  styling/base-theme.ts        — 30px line-height, paddings, notebook colors, current-line, caret
  styling/highlight.ts         — Caveat heading / Kalam body tag styles
  nodes/heading-squiggle.ts    — NEW: H1/H2 squiggle underline decoration
  extensions.ts                — wire notebook-paper + heading-squiggle
build.sh                       — Info.plist ATSApplicationFontsPath
```

---

## Task 1: Bundle Caveat + Kalam fonts

**Files:** download to `Sources/MarkdownEditor/Resources/vendor/`; modify `Resources/editor.html`; modify `build.sh` (Info.plist).

- [ ] **Step 1.1: Download the TTFs**

```bash
cd Sources/MarkdownEditor/Resources/vendor
curl -fL -o "Caveat[wght].ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf"
curl -fL -o "Kalam-Regular.ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/kalam/Kalam-Regular.ttf"
curl -fL -o "Kalam-Bold.ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/kalam/Kalam-Bold.ttf"
cd -
ls -la Sources/MarkdownEditor/Resources/vendor/*.ttf
```
Expected: 3 TTF files, each > 50KB. (Caveat is a variable font with `wght` axis; Kalam ships static weights.)

- [ ] **Step 1.2: Add @font-face to editor.html**

In `Sources/MarkdownEditor/Resources/editor.html`, inside the existing `<style>` block, after the existing JetBrains Mono `@font-face` rules, add:

```css
@font-face {
  font-family: "Caveat";
  src: url("vendor/Caveat[wght].ttf") format("truetype-variations");
  font-weight: 400 700; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "Kalam";
  src: url("vendor/Kalam-Regular.ttf") format("truetype");
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "Kalam";
  src: url("vendor/Kalam-Bold.ttf") format("truetype");
  font-weight: 700; font-style: normal; font-display: swap;
}
```

- [ ] **Step 1.3: Register fonts for AppKit via Info.plist**

In `build.sh`, locate the `Info.plist` heredoc. Add this key inside the top-level `<dict>` (e.g., after `LSApplicationCategoryType`):

```xml
    <key>ATSApplicationFontsPath</key><string>vendor</string>
```

This makes AppKit auto-register every font in `Contents/Resources/vendor/` at launch, so `NSFont(name: "Caveat", size:)` and `NSFont(name: "Kalam", size:)` resolve.

- [ ] **Step 1.4: Build + verify fonts load**

```bash
npm run build && ./build.sh debug
ls -la "build/Markdown Note.app/Contents/Resources/vendor/"*.ttf
```
Expected: build succeeds; the 3 TTFs are present in the bundle.

Manual smoke (user): launch the app; confirm it still renders (fonts not yet applied — this task only bundles them).

- [ ] **Step 1.5: Commit**

```bash
git add Sources/MarkdownEditor/Resources/vendor/*.ttf Sources/MarkdownEditor/Resources/editor.html build.sh
git commit -m "$(cat <<'EOF'
feat(notebook): bundle Caveat + Kalam fonts

Caveat (variable wght) + Kalam (400/700) TTF from google/fonts (SIL OFL).
@font-face in editor.html for the WKWebView body; ATSApplicationFontsPath
in Info.plist so AppKit NSFont can resolve them for chrome.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Notebook Light palette tokens (editor body)

**Files:** `Sources/MarkdownEditor/Resources/editor.html` (`:root` CSS vars).

- [ ] **Step 2.1: Replace the `:root` CSS variables**

In `editor.html`, find the `:root { ... }` block (currently defines `--bg`, `--fg`, `--marker`, `--secondary`, `--code-bg`, `--code-fg`, `--link`, `--list`, `--editor-font`). Replace its values with the notebook Light tokens (keep variable NAMES so Swift `setTheme` keeps working; add new ones):

```css
:root {
  --bg: #fdfbf5;
  --fg: #1a2a4a;
  --marker: #a0aebd;
  --secondary: #5a6a85;
  --code-bg: #fffaef;
  --code-fg: #c8442a;
  --link: #c8442a;
  --list: #c8442a;
  --accent: #c8442a;
  --rule: #9bb8d480;
  --current-line: rgba(200,68,42,0.10);
  --editor-font: "Kalam", -apple-system, "Apple SD Gothic Neo", sans-serif;
  --display-font: "Caveat", "Apple SD Gothic Neo", cursive;
}
```

- [ ] **Step 2.2: Build + smoke**

```bash
npm run build && ./build.sh debug
```
Manual smoke (user): launch; body background is now warm paper `#fdfbf5`, text deep-blue ink. (Rules/margins/headings come next — just colors here.)

- [ ] **Step 2.3: Commit**

```bash
git add Sources/MarkdownEditor/Resources/editor.html
git commit -m "feat(notebook): Light palette tokens in editor :root

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Ruled paper + red margin

**Files:** `Sources/CoreEditor/src/styling/notebook-paper.ts` (NEW), `Sources/CoreEditor/src/extensions.ts`, `Sources/CoreEditor/src/styling/base-theme.ts`, `Sources/MarkdownEditor/Resources/editor.html`.

- [ ] **Step 3.1: Set 30px line-height + 98px left padding in base-theme.ts**

In `Sources/CoreEditor/src/styling/base-theme.ts`, find the `.cm-content` rule (currently `fontSize: "13.5px", lineHeight: "22px"`). Change to:

```typescript
  ".cm-content": {
    fontFamily: "var(--editor-font)",
    fontSize: "16.5px",
    lineHeight: "30px",
    letterSpacing: "0.1px",
    paddingLeft: "98px",
    paddingRight: "24px",
  },
  ".cm-line": { padding: "0" },
```

(If `.cm-line` already has a rule, merge — keep `padding: 0`.)

- [ ] **Step 3.2: Create notebook-paper.ts (ruled background + red margin)**

`Sources/CoreEditor/src/styling/notebook-paper.ts`:

```typescript
import { EditorView } from '@codemirror/view';

/** Ruled-paper background (30px horizontal rules) + a red margin rule at 84px.
 *  Pure theming — no decorations, no document dependency. */
export const notebookPaper = EditorView.theme({
  '.cm-scroller': {
    position: 'relative',
  },
  '.cm-content': {
    // 30px horizontal ruled lines; text sits on the line.
    backgroundImage:
      'repeating-linear-gradient(to bottom, transparent 0, transparent 29px, var(--rule) 29px, var(--rule) 30px)',
    backgroundSize: '100% 30px',
    backgroundAttachment: 'local',
  },
  // Red margin rule (double): main 1.5px line at 84px + faint 1px 2px to its left.
  '.cm-content::before': {
    content: '""',
    position: 'absolute',
    left: '84px',
    top: '0',
    bottom: '0',
    width: '1.5px',
    background: 'var(--accent)',
    pointerEvents: 'none',
  },
  '.cm-content::after': {
    content: '""',
    position: 'absolute',
    left: '82px',
    top: '0',
    bottom: '0',
    width: '1px',
    background: 'var(--accent)',
    opacity: '0.4',
    pointerEvents: 'none',
  },
});
```

Note: `::before/::after` on `.cm-content` are positioned relative to the scroller. If the margin lines don't span the full scroll height in testing, fall back to painting them on `.cm-scroller` with `position: sticky`; the smoke test in 3.4 confirms.

- [ ] **Step 3.3: Wire into extensions.ts**

In `Sources/CoreEditor/src/extensions.ts`, add the import:

```typescript
import { notebookPaper } from './styling/notebook-paper';
```

In the `makeExtensions` returned array, add `notebookPaper,` right after `themeCompartment.of(baseTheme),`. Also export from `index.ts`:

```typescript
export { notebookPaper } from './styling/notebook-paper';
```

- [ ] **Step 3.4: Build + typecheck + smoke**

```bash
npm run build && npm run typecheck && npm test && ./build.sh debug
```
Expected: typecheck clean, 97 tests pass.
Manual smoke (user): body shows 30px blue ruled lines; a red vertical margin near the left with a fainter parallel line; text starts right of the margin and sits on the rules.

- [ ] **Step 3.5: Commit**

```bash
git add Sources/CoreEditor/src/styling/notebook-paper.ts \
        Sources/CoreEditor/src/styling/base-theme.ts \
        Sources/CoreEditor/src/extensions.ts \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(notebook): ruled paper + red margin rule (30px lines, 84px margin)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Caveat headings + Kalam body typography

**Files:** `Sources/CoreEditor/src/styling/highlight.ts`, `Sources/MarkdownEditor/Resources/editor.html`.

- [ ] **Step 4.1: Heading sizes/fonts in editor.html**

In `editor.html` `<style>`, add (after the `.cm-content` rules):

```css
/* Notebook headings — Caveat */
.cm-content .cm-md-header { font-family: var(--display-font); color: var(--fg); }
.cm-content .cm-md-heading1 { font-size: 44px; font-weight: 700; line-height: 1.1; letter-spacing: -0.5px; }
.cm-content .cm-md-heading2 { font-size: 28px; font-weight: 700; line-height: 1.2; }
.cm-content .cm-md-heading3 { font-size: 22px; font-weight: 700; }
/* List bullets — red */
.cm-content .md-list-mark { color: var(--accent); font-weight: 700; }
```

- [ ] **Step 4.2: Map heading/body tags in highlight.ts**

`styling/highlight.ts` currently builds `mdHighlight` from color rules + `markdownTagClasses`. Ensure heading tags carry the `cm-md-heading*` classes. The `markdownTagClasses` table (from `styling/markdown-tags.ts`) already maps `tags.heading1 → 'cm-md-header cm-md-heading1'` etc. (added in the prior CoreEditor work). Verify those class names match the CSS in 4.1. No code change if they already match; if `markdown-tags.ts` uses different class names, reconcile them to `cm-md-header cm-md-heading{1..6}`.

- [ ] **Step 4.3: Build + smoke + commit**

```bash
npm run build && npm run typecheck && npm test && ./build.sh debug
```
Manual smoke (user): `# H1` renders large in Caveat handwriting; `## H2` medium Caveat; list bullets red; body in Kalam.

```bash
git add Sources/CoreEditor/src/styling/highlight.ts \
        Sources/MarkdownEditor/Resources/editor.html \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(notebook): Caveat headings + Kalam body + red list bullets

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: H1/H2 squiggle underline

**Files:** `Sources/CoreEditor/src/nodes/heading-squiggle.ts` (NEW), `Sources/CoreEditor/test/nodes/heading-squiggle.test.ts` (NEW), `extensions.ts`, `index.ts`, `editor.html`.

The squiggle is a wavy SVG underline drawn under H1/H2 lines. Implement as a **line decoration** that adds a class; the SVG is a CSS `background-image` on that class (avoids widget/caret hitbox issues — lesson from inline-code).

- [ ] **Step 5.1: Write a failing test for the heading predicate**

The pure logic: given a lezer node name, is it an ATX heading we squiggle (1 or 2)? Create `Sources/CoreEditor/test/nodes/heading-squiggle.test.ts`:

```typescript
import { squiggleClassForHeading } from '../../src/nodes/heading-squiggle';

describe('squiggleClassForHeading', () => {
  it('returns h1 class for ATXHeading1', () => {
    expect(squiggleClassForHeading('ATXHeading1')).toBe('cm-md-squiggle-h1');
  });
  it('returns h2 class for ATXHeading2', () => {
    expect(squiggleClassForHeading('ATXHeading2')).toBe('cm-md-squiggle-h2');
  });
  it('returns null for ATXHeading3', () => {
    expect(squiggleClassForHeading('ATXHeading3')).toBeNull();
  });
  it('returns null for non-heading nodes', () => {
    expect(squiggleClassForHeading('Paragraph')).toBeNull();
  });
});
```

- [ ] **Step 5.2: Run — verify fail**

`npm test -- heading-squiggle` → fail (module not found).

- [ ] **Step 5.3: Implement heading-squiggle.ts**

```typescript
import { Decoration } from '@codemirror/view';
import { nodeMatcher, NodeMatcher } from '../utils/matchers/lezer';

/** Returns the squiggle CSS class for a heading node name, or null if it shouldn't squiggle. */
export function squiggleClassForHeading(nodeName: string): string | null {
  if (nodeName === 'ATXHeading1') return 'cm-md-squiggle-h1';
  if (nodeName === 'ATXHeading2') return 'cm-md-squiggle-h2';
  return null;
}

function makeSquiggleMatcher(nodeName: string, cls: string): NodeMatcher {
  return nodeMatcher(nodeName, (node, state) => {
    const line = state.doc.lineAt(node.from);
    return [Decoration.line({ class: cls }).range(line.from)];
  });
}

export const headingSquiggleMatchers: NodeMatcher[] = [
  makeSquiggleMatcher('ATXHeading1', 'cm-md-squiggle-h1'),
  makeSquiggleMatcher('ATXHeading2', 'cm-md-squiggle-h2'),
];
```

- [ ] **Step 5.4: Run — verify pass**

`npm test -- heading-squiggle` → 4 pass.

- [ ] **Step 5.5: Add squiggle SVG background CSS in editor.html**

The squiggle path (from `notebook.jsx`): `M2,5 Q{w*0.15},1 {w*0.3},5 T {w*0.6},5 T {w*0.9},5`. For a fixed 300px width inline SVG data URI (accent `#c8442a`, strokeWidth 2.2):

```css
/* H1/H2 squiggle underline — wavy SVG as a bottom background on the heading line */
.cm-content .cm-md-squiggle-h1,
.cm-content .cm-md-squiggle-h2 {
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="8" viewBox="0 0 300 8"><path d="M2,5 Q45,1 90,5 T180,5 T270,5" stroke="%23c8442a" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>');
  background-repeat: no-repeat;
  background-position: 98px bottom;
}
```

Note: this `background-image` is on the heading LINE and would override the ruled-paper background on that line. That is acceptable (headings sit above a squiggle, not a rule). If both are needed, combine into one `background-image` list (squiggle, then the repeating-linear-gradient). Smoke test confirms which is wanted; default to squiggle-only on heading lines.

- [ ] **Step 5.6: Wire into extensions.ts + index.ts**

`extensions.ts`: import `headingSquiggleMatchers`, and add them to the existing `matcherViewPlugin([...])` array (spread): `...headingSquiggleMatchers`.

`index.ts`: `export { squiggleClassForHeading, headingSquiggleMatchers } from './nodes/heading-squiggle';`

- [ ] **Step 5.7: Build + smoke + commit**

```bash
npm run build && npm run typecheck && npm test && ./build.sh debug
```
Manual smoke (user): a red wavy underline appears beneath H1 and H2 lines.

```bash
git add Sources/CoreEditor/src/nodes/heading-squiggle.ts \
        Sources/CoreEditor/test/nodes/heading-squiggle.test.ts \
        Sources/CoreEditor/src/extensions.ts \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/editor.html \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(notebook): H1/H2 squiggle underline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Current-line accent border + tint + caret + selection

**Files:** `Sources/MarkdownEditor/Resources/editor.html`, `Sources/CoreEditor/src/styling/base-theme.ts`.

- [ ] **Step 6.1: Current-line + caret + selection CSS**

In `editor.html`, find `.cm-activeLine` (currently `background: transparent`). Replace and add:

```css
.cm-editor .cm-activeLine {
  background: var(--current-line);
  border-left: 3px solid var(--accent);
  margin-left: -3px;
}
.cm-editor .cm-cursor {
  border-left-color: var(--accent);
  border-left-width: 1.5px;
}
.cm-editor .cm-selectionBackground,
.cm-editor.cm-focused .cm-selectionBackground,
.cm-editor ::selection {
  background: rgba(200,68,42,0.22) !important;
}
```

Keep the existing `.cm-selectionLayer { z-index: 1 !important; pointer-events: none !important; }` rule (prior fix) intact.

- [ ] **Step 6.2: Ensure base-theme highlightActiveLine stays enabled**

`extensions.ts` already includes `highlightActiveLine()`. No change needed; verify it's present.

- [ ] **Step 6.3: Build + smoke + commit**

```bash
npm run build && npm run typecheck && npm test && ./build.sh debug
```
Manual smoke (user): the cursor's line has a red left border + faint red tint; caret is a thin red bar; selecting text shows a red-tinted highlight; clicking selected text still deselects (regression check).

```bash
git add Sources/MarkdownEditor/Resources/editor.html \
        Sources/CoreEditor/src/styling/base-theme.ts \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(notebook): current-line accent border + tint, red caret + selection

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: AppKit window — fullSizeContentView + remove TOC pane

**Files:** `Sources/MarkdownEditor/App.swift`, `Sources/MarkdownEditor/MainWindow.swift`.

- [ ] **Step 7.1: Window styleMask + size in App.swift**

`App.swift` line ~50 creates the controller. The window itself is built in `MainWindowController.init`. In `MainWindow.swift` init, change:

```swift
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false)
```
to:
```swift
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
```

Keep `titlebarAppearsTransparent = true`, `titleVisibility = .hidden`. Change `window.backgroundColor` to paper:
```swift
        window.backgroundColor = NSColor(srgbRed: 253.0/255, green: 251.0/255, blue: 245.0/255, alpha: 1)
```

- [ ] **Step 7.2: Remove the TOC split item**

In `MainWindow.swift` `setup()`, remove the TOC pane:
- Delete the `tocHost` / `tocItem` creation block (the `NSHostingController(rootView: TocPanel()...)` + `tocItem = NSSplitViewItem(...)` + its config).
- Delete `splitVC.addSplitViewItem(tocItem)`.
- Delete the `state.$outline` → `tocItem?.animator().isCollapsed` subscription.
- Remove the `private var tocItem: NSSplitViewItem!` property.
- In `TonedSplitView.drawDivider`, the idx logic now only has one divider (sidebar↔editor); leave it (it still works — `idx == 0` → 0.10 alpha).

(`TocPanel.swift` stays in the repo, just unused.)

- [ ] **Step 7.3: Build + smoke + commit**

```bash
./build.sh debug
```
Expected: builds (Swift may warn about unused; fix any errors). 
Manual smoke (user): window opens with NO right TOC pane (sidebar + editor only); paper background runs up behind the toolbar area.

```bash
git add Sources/MarkdownEditor/MainWindow.swift Sources/MarkdownEditor/App.swift
git commit -m "feat(notebook): fullSizeContentView window + remove TOC pane

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Marbled spine (52px leading view)

**Files:** `Sources/MarkdownEditor/SpineView.swift` (NEW), `Sources/MarkdownEditor/MainWindow.swift`, `build.sh` (new file is globbed by `Sources/MarkdownEditor/*.swift` — no build.sh change needed).

- [ ] **Step 8.1: Create SpineView.swift**

Render the marble as an SVG string → NSImage, tiled vertically, with a vertical label. `Sources/MarkdownEditor/SpineView.swift`:

```swift
import AppKit

/// 52px marbled book-spine, fixed leading column of the notebook shell.
final class SpineView: NSView {
    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        let w = bounds.width
        let h = bounds.height
        // 115° diagonal marble stripes — draw as rotated repeating bands.
        NSColor(srgbRed: 0x1a/255, green: 0x1a/255, blue: 0x1a/255, alpha: 1).setFill()
        bounds.fill()
        let ctx = NSGraphicsContext.current!.cgContext
        ctx.saveGState()
        // Stripe set per the design (period 50px along the 115° axis).
        let bands: [(CGFloat, CGFloat, NSColor)] = [
            (0, 6, c(0x1a1a1a)), (6, 12, c(0x2a2a2a)), (12, 14, c(0xf5f5f5)),
            (14, 20, c(0x2a2a2a)), (20, 28, c(0x1a1a1a)), (28, 30, c(0xf5f5f5)),
            (30, 38, c(0x2a2a2a)), (38, 50, c(0x1a1a1a)),
        ]
        let angle: CGFloat = 115 * .pi / 180
        ctx.translateBy(x: w / 2, y: h / 2)
        ctx.rotate(by: angle)
        let diag = (w + h) * 1.5
        var y = -diag
        while y < diag {
            for (s, e, col) in bands {
                col.setFill()
                NSRect(x: -diag, y: y + s, width: diag * 2, height: e - s).fill()
            }
            y += 50
        }
        ctx.restoreGState()
        // Top/bottom subtle shadow gradient overlay
        let shade = NSColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.08)
        shade.setFill()
        NSRect(x: 0, y: 0, width: w, height: h * 0.04).fill()
        NSRect(x: 0, y: h * 0.96, width: w, height: h * 0.04).fill()
        // Right border
        NSColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.30).setFill()
        NSRect(x: w - 1, y: 0, width: 1, height: h).fill()
    }

    private func c(_ hex: Int) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255,
                green: CGFloat((hex >> 8) & 0xff) / 255,
                blue: CGFloat(hex & 0xff) / 255, alpha: 1)
    }
}
```

Add the vertical label as a subview in `MainWindow` (Step 8.2) or here; keep it here for cohesion — append in `init`:

```swift
    private let label: NSTextField = {
        let t = NSTextField(labelWithString: "Composition · 100 sheets")
        t.font = NSFont(name: "Caveat", size: 17) ?? NSFont.systemFont(ofSize: 17, weight: .bold)
        t.textColor = NSColor(srgbRed: 0x1a/255, green: 0x1a/255, blue: 0x1a/255, alpha: 1)
        t.alignment = .center
        return t
    }()

    override init(frame: NSRect) {
        super.init(frame: frame)
        // vertical label: rotate 90°, white bg chip with 2px border
        label.wantsLayer = true
        label.layer?.backgroundColor = NSColor.white.cgColor
        label.layer?.borderWidth = 2
        label.layer?.borderColor = NSColor(srgbRed: 0x1a/255, green: 0x1a/255, blue: 0x1a/255, alpha: 1).cgColor
        label.frameRotation = 90
        addSubview(label)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        label.sizeToFit()
        label.frame.origin = NSPoint(x: (bounds.width - label.frame.width) / 2,
                                     y: (bounds.height - label.frame.height) / 2)
    }
```

(If the rotated-label centering is finicky, the smoke test will show it; adjust origin. A vertical NSTextField is fussy — acceptable to refine during smoke.)

- [ ] **Step 8.2: Insert SpineView as the leading 52px column in MainWindow**

In `MainWindow.swift` `setup()`, after `window.contentViewController = splitVC`, restructure so the contentView is `[SpineView 52 | splitVC.view]`. Replace `window.contentViewController = splitVC` with a container:

```swift
        let container = NSView()
        let spine = SpineView()
        spine.translatesAutoresizingMaskIntoConstraints = false
        let splitView = splitVC.view
        splitView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(spine)
        container.addSubview(splitView)
        NSLayoutConstraint.activate([
            spine.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            spine.topAnchor.constraint(equalTo: container.topAnchor),
            spine.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            spine.widthAnchor.constraint(equalToConstant: 52),
            splitView.leadingAnchor.constraint(equalTo: spine.trailingAnchor),
            splitView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            splitView.topAnchor.constraint(equalTo: container.topAnchor),
            splitView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        // splitVC must stay retained as a child VC for the split behaviour.
        let rootVC = NSViewController()
        rootVC.view = container
        rootVC.addChild(splitVC)
        window.contentViewController = rootVC
```

Note: keeping `splitVC` as a child of `rootVC` preserves its lifecycle. The `frameAutosaveName` re-apply in `init` still works (operates on the window).

- [ ] **Step 8.3: Build + smoke + commit**

```bash
./build.sh debug
```
Manual smoke (user): a 52px black-and-white marble stripe column on the far left, with a vertical `Composition · 100 sheets` white-chip label centered; sidebar + editor to its right.

```bash
git add Sources/MarkdownEditor/SpineView.swift Sources/MarkdownEditor/MainWindow.swift
git commit -m "feat(notebook): 52px marbled spine leading column

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Sidebar reskin (stamp box + Kalam tree + footer)

**Files:** `Sources/MarkdownEditor/FolderSidebar.swift`, `Sources/MarkdownEditor/Theme.swift`.

- [ ] **Step 9.1: Add notebook tokens to Theme.swift**

In `Sources/MarkdownEditor/Theme.swift`, add notebook Light colors (SwiftUI `Color`):

```swift
extension Color {
    static let nbPaper = Color(red: 253/255, green: 251/255, blue: 245/255)
    static let nbInk = Color(red: 26/255, green: 42/255, blue: 74/255)
    static let nbInkLight = Color(red: 90/255, green: 106/255, blue: 133/255)
    static let nbAccent = Color(red: 200/255, green: 68/255, blue: 42/255)
    static let nbCurrent = Color(red: 200/255, green: 68/255, blue: 42/255, opacity: 0.10)
}
```

- [ ] **Step 9.2: Reskin FolderSidebar — stamp box header**

At the top of the `FolderSidebar` body (above the file tree), add the stamp box. Use the current `rootFolder` name for Subject and today's date:

```swift
// Stamp box (composition-book cover label)
VStack(alignment: .leading, spacing: 6) {
    stampRow("Name", "")
    stampRow("Date", Self.todayString())
    HStack(spacing: 6) {
        Text("Subject:").font(.custom("Kalam", size: 13)).foregroundColor(.nbInkLight)
        Text(state.rootFolder?.lastPathComponent ?? "markdown-note")
            .font(.custom("Caveat", size: 20)).bold().foregroundColor(.nbAccent)
            .underline()
    }
}
.padding(12)
.background(Color.white)
.overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.nbInk.opacity(0.4), lineWidth: 1.5))
.padding(.horizontal, 12).padding(.top, 8)
```

Add helpers in the struct:
```swift
private func stampRow(_ label: String, _ value: String) -> some View {
    HStack(spacing: 6) {
        Text("\(label):").font(.custom("Kalam", size: 13)).foregroundColor(.nbInkLight)
        Text(value).font(.custom("Kalam", size: 13)).foregroundColor(.nbInk)
    }
}
private static func todayString() -> String {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date())
}
```

- [ ] **Step 9.3: Reskin file tree rows + footer**

- File rows: `.font(.custom("Kalam", size: 15))`, foreground `.nbInk`. Current file: bold, background `.nbCurrent`, 3px leading accent border (overlay a `Rectangle().fill(Color.nbAccent).frame(width: 3)` on the leading edge), corner radius 3.
- Folder chevron `▸`/`▾` 10px `.nbInkLight`.
- Indent: `.padding(.leading, CGFloat(depth) * 14 + 8)`.
- Background of the whole sidebar: `.nbPaper`.
- Footer at the bottom: `HStack { Text("\(mdCount) pages"); Spacer(); Text("p. 8 / 100") }.font(.custom("Caveat", size: 18)).foregroundColor(.nbInkLight)` where `mdCount` = number of `.md` files in the tree.

(Match existing FolderSidebar structure; only restyle + add stamp/footer. Don't change selection/drag logic.)

- [ ] **Step 9.4: Build + smoke + commit**

```bash
./build.sh debug
```
Manual smoke (user): sidebar is warm paper; a bordered stamp box on top showing Name/Date/Subject (Subject = folder name in red Caveat); file rows in Kalam with the current file accent-highlighted; a footer page count in Caveat.

```bash
git add Sources/MarkdownEditor/FolderSidebar.swift Sources/MarkdownEditor/Theme.swift
git commit -m "feat(notebook): sidebar reskin — stamp box, Kalam tree, footer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Toolbar + title reskin (Caveat title, dirty dot, auto-saved)

**Files:** `Sources/MarkdownEditor/TitleBar.swift`, `Sources/MarkdownEditor/MainWindow.swift`.

- [ ] **Step 10.1: Reskin TitleBar.swift**

`TitleBar` is the SwiftUI view hosted in the toolbar title item. Restyle:

```swift
HStack(spacing: 8) {
    Text(state.selectedFile?.lastPathComponent ?? "Untitled")
        .font(.custom("Caveat", size: 26)).fontWeight(.semibold)
        .foregroundColor(.nbInk)
    if state.isDirty {
        Circle().fill(Color.nbAccent).frame(width: 7, height: 7)
    }
    Spacer()
    Text("✎ auto-saved")
        .font(.custom("Caveat", size: 20))
        .foregroundColor(.nbInkLight)
}
```

(Adjust to the existing TitleBar structure / bindings — keep its EnvironmentObject + filename binding.)

- [ ] **Step 10.2: Toolbar bottom dashed separator**

The toolbar's bottom border: in `MainWindow.swift`, the existing horizontal separator (`installTitlebarSeparator` `hline`) — restyle to `1px dashed` accent-faint, or leave a solid faint line. Minimal: set the `hline` color to `rgba(0,0,0,0.08)` (separator token) and keep 1px. (Dashed in AppKit needs a CAShapeLayer with `lineDashPattern`; acceptable to keep solid faint for Phase 1 — note in commit.)

- [ ] **Step 10.3: Build + smoke + commit**

```bash
./build.sh debug
```
Manual smoke (user): toolbar shows the filename in big Caveat, a red dot when unsaved, `✎ auto-saved` on the right; faint separator under the toolbar; paper shows through above it.

```bash
git add Sources/MarkdownEditor/TitleBar.swift Sources/MarkdownEditor/MainWindow.swift \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(notebook): toolbar reskin — Caveat title + dirty dot + auto-saved

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Full verification + smoke pass

- [ ] **Step 11.1: Full pipeline**

```bash
npm run typecheck
npm test               # 97 + 4 (heading-squiggle) = 101 tests pass
npm run build
./build.sh debug
```
All green.

- [ ] **Step 11.2: Full manual smoke (user runs)**

```bash
osascript -e 'quit app "Markdown Note"' 2>/dev/null; sleep 1; open "build/Markdown Note.app"
```
Verify the DoD checklist from the spec §8:
- 52px marble spine + vertical label
- paper sidebar + stamp box (Subject = folder) + Kalam tree + footer
- Caveat toolbar title + dirty dot + auto-saved + dashed-ish separator
- 30px ruled lines, 84px red double margin, text on the lines
- H1 Caveat 44 + squiggle, H2 Caveat 28 + § marker, red list bullets
- Kalam body
- current-line accent border + tint, thin red caret
- no right TOC pane (3 columns: spine|sidebar|body)
- paper continuous behind toolbar
- regressions OK: autosave, image drag/paste, Mermaid toggle, ⌘F search, ⌘T new window, ⌘⇧D sidebar toggle, selection click-to-deselect

- [ ] **Step 11.3: If smoke passes, summarize (no merge yet — Phase 1 on its own branch)**

Report: branch `feature/composition-notebook-skin`, commit list, smoke result. The user decides when to merge / proceed to Phase 2.

---

## Out of scope (Phase 2–4)

HandCheckbox/HandStrike/HandBox decorations, live-preview marker dimming, Dark/Sepia/Paper palettes + ⌘⇧1–4, PenNib caret marker, Find & Replace re-theme, ⌘K switcher, Preferences sheet. Each its own spec.

---

## Spec coverage self-check

| Spec §  | Plan task |
|---|---|
| §3 Light tokens | Task 2 |
| §4.1 window fullSizeContentView | Task 7 |
| §4.2 layout / TOC removal | Task 7 |
| §4.3 marble spine | Task 8 |
| §4.4 sidebar stamp/tree/footer | Task 9 |
| §4.5 toolbar Caveat/dot/auto-saved | Task 10 |
| §4.6 titlebar surgery → paper | Task 7 (bg) + Task 10 (separator) |
| §5.1 ruled paper + margin | Task 3 |
| §5.2 palette CSS vars | Task 2 |
| §5.3 Caveat/Kalam + headings | Task 4 |
| §5.3 squiggle | Task 5 |
| §5.4 current-line + caret | Task 6 |
| §5.5 selection | Task 6 |
| §6 fonts | Task 1 |
| §8 DoD smoke | Task 11 |
