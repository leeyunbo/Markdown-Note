# CoreEditor TS Migration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Sources/MarkdownEditor/Resources/editor.js` (1167 lines vanilla JS) → `Sources/CoreEditor/src/` TypeScript modules (~20 files). Build output `cm.bundle.js` and runtime behavior unchanged.

**Architecture:** Strangler-fig within a single branch. `editor.js` stays runnable throughout; each task moves one chunk to a TS module, exposes it through `window.CM` (bundle re-exports), removes the moved chunk from `editor.js`. After all chunks moved, `editor.js` is replaced by an entry call into the bundle and deleted.

**Tech Stack:** TypeScript 5+, esbuild (existing), Jest + happy-dom + ts-jest, Stryker mutation testing. CodeMirror 6 packages already in `package.json`.

**Branch:** `feature/coreeditor-ts-migration` (already created from `main`).

**Spec:** `docs/superpowers/specs/2026-05-25-coreeditor-ts-migration-design.md` — authoritative source of decisions. This plan executes that spec.

---

## File Structure (end state)

```
Sources/
  CoreEditor/                                  (new)
    package.json                               — merged from root if helpful; or keep root
    tsconfig.json
    jest.config.cjs
    stryker.conf.json
    src/
      cm-reexports.ts                          — CodeMirror imports re-exported on window.CM
      index.ts                                 — boot: build extensions, mount EditorView, install bridges
      extensions.ts                            — makeExtensions() composition
      styling/
        base-theme.ts                          — EditorView.theme(baseTheme)
        highlight.ts                           — mdHighlight HighlightStyle
        markdown-tags.ts                       — lezer tag → CSS class (new abstraction)
      nodes/
        image-utils.ts                         — pure: parseAltAndSize, imageSrcForRender
        image.ts                               — ImageWidget + imageField (StateField)
        mermaid.ts                             — Mermaid toggle/render widgets + mermaidActiveField + mermaidDecoField
        list-mark.ts                           — ListMark depth color cycle
        inline-code.ts                         — InlineCode mark decoration
        code-block.ts                          — FencedCode line decoration
        indented-reset.ts                      — IndentedCode/CodeBlock line reset
        table.ts                               — tableLinePlugin
      plugins/
        task-line.ts                           — taskLinePlugin
        line-kind-gutter.ts                    — left gutter (h1/h2/¶/│/etc)
        doc-folder.ts                          — docFolderEffect + state
        status-bar.ts                          — makeStatusPanel
        paste-image.ts                         — paste handler (image → Swift)
      commands/
        wrap-selection.ts                      — Mod-b / Mod-i wrap+unwrap
        insert-link.ts                         — Mod-k
        list-continue.ts                       — Enter handler (handleEnter)
        ime-list-continue.ts                   — imeListContinueFilter (transaction filter)
      search/
        panel.ts                               — search panel theme
      bridge/
        outgoing.ts                            — wrappers for window.webkit.messageHandlers.*
        app-bridge.ts                          — window.appBridge = {...}
        diagnostics.ts                         — window.onerror / unhandledrejection forwarding
      utils/
        lezer-walk.ts                          — syntaxTree walk helpers
        types.ts                               — shared types
    test/
      nodes/image-utils.test.ts
      nodes/mermaid-utils.test.ts              — (if mermaid pure parts extracted)
      plugins/doc-folder.test.ts
      commands/wrap-selection.test.ts
      commands/insert-link.test.ts
      commands/list-continue.test.ts
      commands/ime-list-continue.test.ts
      utils/lezer-walk.test.ts

  MarkdownEditor/                              (unchanged Swift)
    Resources/
      cm.bundle.js                             — esbuild output, same path & shape
      editor.html                              — minor tweak: remove <script src="editor.js"> at end
      editor.js                                — DELETED at end
      vendor/                                  — unchanged
```

**Files removed at end:** `Sources/cm-bundle/index.js`, `Sources/MarkdownEditor/Resources/editor.js`.

**Files modified:** `package.json` (deps + scripts), `Sources/MarkdownEditor/Resources/editor.html` (remove final `<script>` tag).

**Files untouched:** All Swift files. `build.sh`. `editor.html` other than script tag at end.

---

## Coverage Domain (which files have line/mutation gates)

These files **must** hit 80% line coverage and 80% Stryker mutation score:

- `src/utils/lezer-walk.ts`
- `src/nodes/image-utils.ts`
- `src/plugins/doc-folder.ts` (URL normalization logic only)
- `src/commands/wrap-selection.ts`
- `src/commands/insert-link.ts`
- `src/commands/list-continue.ts`
- `src/commands/ime-list-continue.ts`

Everything else (widget DOM, themes, wiring, bridge I/O) is **out of scope** for coverage gates.

---

## Task Order Rationale

Order minimizes risk:
1. Infrastructure (no behavior change).
2. Pure utils first (tests easy, no CodeMirror coupling).
3. Tree-walk decorations next (mechanical extraction, well-defined inputs).
4. Stateful decorations (image, mermaid — StateField).
5. Plugins (taskLine, gutter, status bar).
6. Commands (markdown shortcuts).
7. Theme + highlight.
8. Bridge (last — it touches Swift integration; move when everything else is verified).
9. Final: replace `editor.js` with thin entry, delete file.

---

## Task 1: Infrastructure setup (TS + Jest + Stryker tooling, no behavior change)

**Files:**
- Create: `tsconfig.json` (root)
- Create: `jest.config.cjs` (root)
- Create: `stryker.conf.json` (root)
- Create: `Sources/CoreEditor/src/cm-reexports.ts`
- Create: `Sources/CoreEditor/src/index.ts`
- Modify: `package.json` (add devDeps, scripts; bump version)
- Modify: `.gitignore` (add `.stryker-tmp`, `reports`, `coverage`)
- Delete: `Sources/cm-bundle/index.js` (after content moved)

- [ ] **Step 1.1: Create tsconfig.json (root)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["jest", "node"]
  },
  "include": ["Sources/CoreEditor/src/**/*.ts", "Sources/CoreEditor/test/**/*.ts"],
  "exclude": ["node_modules", ".stryker-tmp"]
}
```

- [ ] **Step 1.2: Update package.json**

Replace contents with:

```json
{
  "name": "markdown-editor-cm",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "build": "esbuild Sources/CoreEditor/src/index.ts --bundle --format=iife --global-name=CM --outfile=Sources/MarkdownEditor/Resources/cm.bundle.js --target=safari16 --minify",
    "watch": "esbuild Sources/CoreEditor/src/index.ts --bundle --format=iife --global-name=CM --outfile=Sources/MarkdownEditor/Resources/cm.bundle.js --target=safari16 --watch",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:cov": "jest --coverage",
    "test:mutate": "stryker run"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "typescript": "^5.5.0",
    "@types/jest": "^29.5.12",
    "@types/node": "^22.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "happy-dom": "^17.4.0",
    "jest-environment-happy-dom": "^7.1.0",
    "@stryker-mutator/core": "^8.2.0",
    "@stryker-mutator/jest-runner": "^8.2.0",
    "@stryker-mutator/typescript-checker": "^8.2.0"
  },
  "dependencies": {
    "@codemirror/state": "^6.5.0",
    "@codemirror/view": "^6.34.0",
    "@codemirror/commands": "^6.7.0",
    "@codemirror/language": "^6.10.0",
    "@codemirror/search": "^6.5.0",
    "@codemirror/lang-markdown": "^6.3.0",
    "@codemirror/lang-javascript": "^6.2.0",
    "@codemirror/lang-python": "^6.1.0",
    "@codemirror/lang-json": "^6.0.0",
    "@codemirror/language-data": "^6.5.0",
    "@lezer/highlight": "^1.2.0"
  }
}
```

- [ ] **Step 1.3: Run `npm install`**

Run: `npm install`
Expected: completes without errors. `node_modules` populated. `package-lock.json` updated.

- [ ] **Step 1.4: Create jest.config.cjs (root)**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-happy-dom',
  rootDir: '.',
  testMatch: ['<rootDir>/Sources/CoreEditor/test/**/*.test.ts'],
  collectCoverageFrom: [
    'Sources/CoreEditor/src/utils/**/*.ts',
    'Sources/CoreEditor/src/nodes/image-utils.ts',
    'Sources/CoreEditor/src/plugins/doc-folder.ts',
    'Sources/CoreEditor/src/commands/**/*.ts',
    '!Sources/CoreEditor/src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: { lines: 80, statements: 80, branches: 75, functions: 80 },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: false, isolatedModules: true }] },
};
```

- [ ] **Step 1.5: Create stryker.conf.json (root)**

```json
{
  "$schema": "https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/packages/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "reporters": ["progress", "clear-text", "html"],
  "testRunner": "jest",
  "coverageAnalysis": "perTest",
  "mutate": [
    "Sources/CoreEditor/src/utils/**/*.ts",
    "Sources/CoreEditor/src/nodes/image-utils.ts",
    "Sources/CoreEditor/src/commands/**/*.ts",
    "Sources/CoreEditor/src/plugins/doc-folder.ts"
  ],
  "thresholds": { "high": 90, "low": 70, "break": 80 },
  "jest": { "projectType": "custom", "configFile": "jest.config.cjs" },
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "timeoutMS": 60000,
  "concurrency": 4
}
```

- [ ] **Step 1.6: Create `Sources/CoreEditor/src/cm-reexports.ts`**

This is the typed replacement for `Sources/cm-bundle/index.js`. Same exports.

```typescript
export { EditorState, Compartment, RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
export {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  dropCursor,
  lineNumbers,
  gutter,
  GutterMarker,
  Decoration,
  WidgetType,
  ViewPlugin,
  ViewUpdate,
  showPanel,
} from "@codemirror/view";
export {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
  redo,
} from "@codemirror/commands";
export {
  HighlightStyle,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxTree,
  LanguageDescription,
} from "@codemirror/language";
export {
  searchKeymap,
  search,
  openSearchPanel,
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from "@codemirror/search";
export { markdown, markdownLanguage } from "@codemirror/lang-markdown";
export { languages } from "@codemirror/language-data";
export { tags } from "@lezer/highlight";
```

- [ ] **Step 1.7: Create `Sources/CoreEditor/src/index.ts`**

This is the new bundle entry. For now it only re-exports cm-reexports so the IIFE produces a `window.CM` identical in shape to the old one.

```typescript
export * from "./cm-reexports";
```

- [ ] **Step 1.8: Delete `Sources/cm-bundle/index.js`**

Run: `rm Sources/cm-bundle/index.js && rmdir Sources/cm-bundle`
Expected: directory removed.

- [ ] **Step 1.9: Update `.gitignore`**

Append these lines (preserve existing content):

```
node_modules/
.stryker-tmp/
reports/
coverage/
*.tsbuildinfo
```

- [ ] **Step 1.10: Build and verify bundle**

Run: `npm run build`
Expected: `Sources/MarkdownEditor/Resources/cm.bundle.js` regenerated. Size similar (±5%) to the old one. No esbuild errors.

Then verify the build script in `build.sh` still triggers correctly (it watches `Sources/cm-bundle/index.js` — that path is now gone). Edit `build.sh`:

Find these lines:
```bash
if [[ ! -f Sources/MarkdownEditor/Resources/cm.bundle.js ]] \
   || [[ Sources/cm-bundle/index.js -nt Sources/MarkdownEditor/Resources/cm.bundle.js ]] \
   || [[ package.json -nt Sources/MarkdownEditor/Resources/cm.bundle.js ]]; then
```

Replace with:
```bash
if [[ ! -f Sources/MarkdownEditor/Resources/cm.bundle.js ]] \
   || [[ Sources/CoreEditor/src/index.ts -nt Sources/MarkdownEditor/Resources/cm.bundle.js ]] \
   || [[ package.json -nt Sources/MarkdownEditor/Resources/cm.bundle.js ]]; then
```

Also update the echo message:
```bash
echo "▸ esbuild Sources/cm-bundle/index.js → Resources/cm.bundle.js"
```
to:
```bash
echo "▸ esbuild Sources/CoreEditor/src/index.ts → Resources/cm.bundle.js"
```

- [ ] **Step 1.11: Run `build.sh` and smoke test**

Run: `./build.sh debug`
Expected: builds `.app` without errors.

Run: `open "build/Markdown Note.app"`
Expected: app launches, editor works as before (type a heading, bold, list — all render correctly).

- [ ] **Step 1.12: Add a placeholder test so jest passes**

Create `Sources/CoreEditor/test/smoke.test.ts`:

```typescript
describe('smoke', () => {
  it('runs at all', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 test passes.

- [ ] **Step 1.13: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 1.14: Commit**

```bash
git add tsconfig.json jest.config.cjs stryker.conf.json package.json package-lock.json .gitignore build.sh Sources/CoreEditor Sources/cm-bundle
git status   # verify nothing else slips in (especially MarkEdit-1.32.1/)
git commit -m "$(cat <<'EOF'
chore(coreeditor): TS + Jest + Stryker tooling, move cm-bundle into CoreEditor/src

- Add tsconfig.json, jest.config.cjs, stryker.conf.json
- Add Sources/CoreEditor/{src/cm-reexports.ts, src/index.ts}
- Delete Sources/cm-bundle/ (contents moved to cm-reexports.ts)
- Update build script to point at new entry
- No runtime behavior change: editor.js unchanged, cm.bundle.js
  produces identical window.CM shape

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract pure image utils (with tests)

Pure functions `parseAltAndSize` and `imageSrcForRender` — first domain code with tests. Stay in `editor.js` until widget is also extracted (Task 9); for now, expose them through the bundle and `editor.js` reads them from `window.CM`.

**Files:**
- Create: `Sources/CoreEditor/src/nodes/image-utils.ts`
- Create: `Sources/CoreEditor/test/nodes/image-utils.test.ts`
- Modify: `Sources/CoreEditor/src/index.ts` (add export)
- Modify: `Sources/MarkdownEditor/Resources/editor.js` (replace local definitions with destructuring)

- [ ] **Step 2.1: Write failing test**

Create `Sources/CoreEditor/test/nodes/image-utils.test.ts`:

```typescript
import { parseAltAndSize, imageSrcForRender } from '../../src/nodes/image-utils';

describe('parseAltAndSize', () => {
  it('returns alt with no size when no pipe', () => {
    expect(parseAltAndSize('hello')).toEqual({ alt: 'hello', width: null, height: null });
  });

  it('parses width only when pipe + integer', () => {
    expect(parseAltAndSize('caption|320')).toEqual({ alt: 'caption', width: 320, height: null });
  });

  it('parses width x height', () => {
    expect(parseAltAndSize('caption|320x240')).toEqual({ alt: 'caption', width: 320, height: 240 });
  });

  it('does not parse trailing pipe-non-digit as size', () => {
    expect(parseAltAndSize('a|b')).toEqual({ alt: 'a|b', width: null, height: null });
  });

  it('keeps empty alt', () => {
    expect(parseAltAndSize('|100')).toEqual({ alt: '', width: 100, height: null });
  });
});

describe('imageSrcForRender', () => {
  it('returns http url as-is', () => {
    expect(imageSrcForRender('http://example.com/a.png', '')).toBe('http://example.com/a.png');
  });

  it('returns https url as-is', () => {
    expect(imageSrcForRender('https://example.com/a.png', '')).toBe('https://example.com/a.png');
  });

  it('returns file url as-is', () => {
    expect(imageSrcForRender('file:///tmp/a.png', '')).toBe('file:///tmp/a.png');
  });

  it('returns data url as-is', () => {
    expect(imageSrcForRender('data:image/png;base64,AAA', '')).toBe('data:image/png;base64,AAA');
  });

  it('prepends file:// to absolute path when no docFolder', () => {
    expect(imageSrcForRender('/tmp/a.png', '')).toBe('file:///tmp/a.png');
  });

  it('preserves already-encoded paths', () => {
    expect(imageSrcForRender('attachments/a%20b.png', 'file:///docs/')).toBe('file:///docs/attachments/a%20b.png');
  });

  it('URI-encodes paths with spaces', () => {
    expect(imageSrcForRender('attachments/a b.png', 'file:///docs/')).toBe('file:///docs/attachments/a%20b.png');
  });

  it('returns relative path unchanged when docFolder empty', () => {
    expect(imageSrcForRender('a.png', '')).toBe('a.png');
  });

  it('concatenates docFolder with encoded path', () => {
    expect(imageSrcForRender('sub/a.png', 'file:///docs/')).toBe('file:///docs/sub/a.png');
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npm test -- nodes/image-utils`
Expected: FAIL — `Cannot find module '../../src/nodes/image-utils'`.

- [ ] **Step 2.3: Implement `Sources/CoreEditor/src/nodes/image-utils.ts`**

```typescript
export interface ParsedAlt {
  alt: string;
  width: number | null;
  height: number | null;
}

/** Parses `caption|320` or `caption|320x240` syntax embedded in markdown image alt text. */
export function parseAltAndSize(rawAlt: string): ParsedAlt {
  const m = rawAlt.match(/^(.*)\|(\d+)(?:x(\d+))?$/);
  if (m) {
    return {
      alt: m[1] ?? '',
      width: parseInt(m[2] ?? '0', 10),
      height: m[3] ? parseInt(m[3], 10) : null,
    };
  }
  return { alt: rawAlt, width: null, height: null };
}

/** Resolves an image src for rendering. Absolute URLs pass through; relative paths
 *  are resolved against the document folder URL. */
export function imageSrcForRender(src: string, docFolderURL: string): string {
  if (/^(https?:|file:|data:)/i.test(src)) return src;
  const looksEncoded = /%[0-9A-Fa-f]{2}/.test(src);
  const encoded = looksEncoded ? src : encodeURI(src);
  if (encoded.startsWith('/')) return 'file://' + encoded;
  if (!docFolderURL) return encoded;
  return docFolderURL + encoded;
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npm test -- nodes/image-utils`
Expected: 15 tests pass.

- [ ] **Step 2.5: Run coverage on the new file**

Run: `npm run test:cov -- nodes/image-utils`
Expected: `image-utils.ts` shows 100% line coverage.

- [ ] **Step 2.6: Re-export from bundle**

Edit `Sources/CoreEditor/src/index.ts`. Replace its contents with:

```typescript
export * from './cm-reexports';
export { parseAltAndSize, imageSrcForRender } from './nodes/image-utils';
```

- [ ] **Step 2.7: Rebuild and switch editor.js to use bundle exports**

Run: `npm run build`
Expected: bundle rebuilds, no errors.

Edit `Sources/MarkdownEditor/Resources/editor.js`:

In the destructuring at top (line 5-14), add `parseAltAndSize, imageSrcForRender` to the imports:

```javascript
const {
  EditorState, Compartment, StateField, StateEffect,
  EditorView, keymap, drawSelection, dropCursor, Decoration, WidgetType, ViewPlugin,
  gutter, GutterMarker, showPanel, highlightActiveLine,
  defaultKeymap, history, historyKeymap, indentWithTab, undo, redo,
  HighlightStyle, syntaxHighlighting, defaultHighlightStyle, bracketMatching,
  indentOnInput, indentUnit, syntaxTree,
  searchKeymap, search, openSearchPanel, closeSearchPanel, findNext, findPrevious,
  markdown, markdownLanguage, languages, tags,
  parseAltAndSize, imageSrcForRender,
} = window.CM;
```

Then delete the local definitions in `editor.js`. Specifically, delete lines that currently read:

```javascript
function imageSrcForRender(src) {
  if (/^(https?:|file:|data:)/i.test(src)) return src;
  const looksEncoded = /%[0-9A-Fa-f]{2}/.test(src);
  const encoded = looksEncoded ? src : encodeURI(src);
  if (encoded.startsWith("/")) return "file://" + encoded;
  if (!docFolderURL) return encoded;
  return docFolderURL + encoded;
}

function parseAltAndSize(rawAlt) {
  const m = rawAlt.match(/^(.*)\|(\d+)(?:x(\d+))?$/);
  if (m) return { alt: m[1], width: parseInt(m[2], 10), height: m[3] ? parseInt(m[3], 10) : null };
  return { alt: rawAlt, width: null, height: null };
}
```

(currently at L266-279)

Important: the bundle's `imageSrcForRender` takes `docFolderURL` as a parameter, but the editor.js call sites used the closure-captured `docFolderURL`. Find all calls to `imageSrcForRender(...)` in editor.js (currently one: inside `ImageWidget.toDOM` at L299: `img.src = imageSrcForRender(this.src);`) and change them to `imageSrcForRender(this.src, docFolderURL)`.

- [ ] **Step 2.8: Rebuild and smoke test**

Run: `npm run build && ./build.sh debug && open "build/Markdown Note.app"`
Expected: app launches. Open a note containing a markdown image (e.g. samples folder), verify image renders. Type a new image link, verify it renders.

- [ ] **Step 2.9: Commit**

```bash
git add Sources/CoreEditor/src/nodes/image-utils.ts \
        Sources/CoreEditor/test/nodes/image-utils.test.ts \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/editor.js \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "$(cat <<'EOF'
feat(coreeditor): extract image utils (parseAltAndSize, imageSrcForRender)

- New: src/nodes/image-utils.ts with TS types
- Tests: 15 cases covering URL schemes, encoding, docFolder resolution
- editor.js now destructures these from window.CM
- imageSrcForRender takes docFolderURL as explicit parameter
  (was closure-captured)

Coverage: 100% lines on image-utils.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extract `utils/lezer-walk.ts` (visitor helper with tests)

Many decorations iterate the syntax tree. Extract a typed visitor helper and add tests using a real `EditorState` + `markdownLanguage`.

**Files:**
- Create: `Sources/CoreEditor/src/utils/lezer-walk.ts`
- Create: `Sources/CoreEditor/test/utils/lezer-walk.test.ts`
- Modify: `Sources/CoreEditor/src/index.ts` (export)

- [ ] **Step 3.1: Implement utility (no editor.js change yet)**

Create `Sources/CoreEditor/src/utils/lezer-walk.ts`:

```typescript
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';

export type NodeVisitor = (node: SyntaxNodeRef) => void;

/** Iterate the syntax tree for the given state, optionally restricted to a [from, to] range. */
export function visitTree(
  state: EditorState,
  visit: NodeVisitor,
  range?: { from: number; to: number },
): void {
  const tree = syntaxTree(state);
  tree.iterate({
    from: range?.from,
    to: range?.to,
    enter: visit,
  });
}

/** Collect all nodes with the given `name`. */
export function collectNodes(
  state: EditorState,
  name: string,
  range?: { from: number; to: number },
): { from: number; to: number; name: string }[] {
  const out: { from: number; to: number; name: string }[] = [];
  visitTree(state, (node) => {
    if (node.name === name) out.push({ from: node.from, to: node.to, name: node.name });
  }, range);
  return out;
}
```

- [ ] **Step 3.2: Write tests**

Create `Sources/CoreEditor/test/utils/lezer-walk.test.ts`:

```typescript
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { collectNodes, visitTree } from '../../src/utils/lezer-walk';

function makeState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
  });
}

describe('collectNodes', () => {
  it('finds an ATXHeading1 node', () => {
    const state = makeState('# Hello');
    const headings = collectNodes(state, 'ATXHeading1');
    expect(headings).toHaveLength(1);
    expect(headings[0].from).toBe(0);
  });

  it('finds InlineCode nodes', () => {
    const state = makeState('text with `code` inside');
    const nodes = collectNodes(state, 'InlineCode');
    expect(nodes).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    const state = makeState('plain text');
    expect(collectNodes(state, 'ATXHeading1')).toEqual([]);
  });

  it('restricts to range', () => {
    const state = makeState('# first\n\n# second\n\n# third');
    const all = collectNodes(state, 'ATXHeading1');
    expect(all.length).toBeGreaterThanOrEqual(3);
    const partial = collectNodes(state, 'ATXHeading1', { from: 0, to: 7 });
    expect(partial.length).toBe(1);
  });
});

describe('visitTree', () => {
  it('calls visitor for each node', () => {
    const state = makeState('# H\n\ntext');
    const seen: string[] = [];
    visitTree(state, (node) => { seen.push(node.name); });
    expect(seen).toContain('ATXHeading1');
    expect(seen).toContain('Paragraph');
  });
});
```

- [ ] **Step 3.3: Run tests**

Run: `npm test -- utils/lezer-walk`
Expected: 5 tests pass.

- [ ] **Step 3.4: Export from index.ts**

Add to `Sources/CoreEditor/src/index.ts`:

```typescript
export { visitTree, collectNodes } from './utils/lezer-walk';
```

Final content of `index.ts` so far:

```typescript
export * from './cm-reexports';
export { parseAltAndSize, imageSrcForRender } from './nodes/image-utils';
export { visitTree, collectNodes } from './utils/lezer-walk';
```

- [ ] **Step 3.5: Build and commit**

Run: `npm run build`
Expected: no errors.

```bash
git add Sources/CoreEditor/src/utils/lezer-walk.ts \
        Sources/CoreEditor/test/utils/lezer-walk.test.ts \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "$(cat <<'EOF'
feat(coreeditor): add utils/lezer-walk helpers with tests

visitTree and collectNodes — typed wrappers around syntaxTree.iterate.
Used by subsequent node decoration extractions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extract `nodes/list-mark.ts`

Pure tree-walk plugin. Low risk.

**Files:**
- Create: `Sources/CoreEditor/src/nodes/list-mark.ts`
- Modify: `Sources/CoreEditor/src/index.ts` (export)
- Modify: `Sources/MarkdownEditor/Resources/editor.js` (remove L693-725, import from window.CM)

- [ ] **Step 4.1: Implement module**

Create `Sources/CoreEditor/src/nodes/list-mark.ts`:

```typescript
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

export const listMarkPlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView) {
      const builder: any[] = [];
      const tree = syntaxTree(view.state);
      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from,
          to,
          enter(node) {
            if (node.name !== 'ListMark') return;
            let depth = 0;
            let p = node.node.parent;
            while (p) {
              if (p.name === 'BulletList' || p.name === 'OrderedList') depth++;
              p = p.parent;
            }
            depth = Math.min(Math.max(depth - 1, 0), 4);
            builder.push(
              Decoration.mark({
                class: `md-list-mark md-list-depth-${depth}`,
              }).range(node.from, node.to),
            );
          },
        });
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
```

- [ ] **Step 4.2: Export from index.ts**

Append to `Sources/CoreEditor/src/index.ts`:

```typescript
export { listMarkPlugin } from './nodes/list-mark';
```

- [ ] **Step 4.3: Remove from editor.js**

Delete L693-725 (the `listMarkPlugin = ViewPlugin.fromClass...` block) from `editor.js`. The location of the block in current `editor.js`:

```javascript
// ListMark만 골라서 색 + nested 깊이별 cycle. lang-markdown의 ListMark 노드를 찾아
// BulletList/OrderedList 조상 갯수로 깊이 계산.
const listMarkPlugin = ViewPlugin.fromClass(class {
  // ...
}, { decorations: v => v.decorations });
```

Add `listMarkPlugin` to the destructuring at top of `editor.js`:

```javascript
const {
  // ... existing imports
  parseAltAndSize, imageSrcForRender,
  listMarkPlugin,
} = window.CM;
```

- [ ] **Step 4.4: Build, smoke test, commit**

Run: `npm run build && ./build.sh debug && open "build/Markdown Note.app"`
Expected: app launches. Open a note with nested bullet lists, verify the list mark colors cycle by depth (green → purple → amber → red → blue).

```bash
git add Sources/CoreEditor/src/nodes/list-mark.ts \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/editor.js \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract nodes/list-mark.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extract `nodes/inline-code.ts`

Mechanical extraction of a `ViewPlugin` that marks InlineCode nodes.

**Files:**
- Create: `Sources/CoreEditor/src/nodes/inline-code.ts`
- Modify: `Sources/CoreEditor/src/index.ts` (export)
- Modify: `Sources/MarkdownEditor/Resources/editor.js` (remove L667-691, import)

- [ ] **Step 5.1: Implement module**

Create `Sources/CoreEditor/src/nodes/inline-code.ts`:

```typescript
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

export const inlineCodePlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView) {
      const builder: any[] = [];
      const tree = syntaxTree(view.state);
      for (const { from, to } of view.visibleRanges) {
        tree.iterate({
          from,
          to,
          enter(node) {
            if (node.name !== 'InlineCode') return;
            builder.push(
              Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
            );
          },
        });
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
```

- [ ] **Step 5.2: Export, remove from editor.js, build, smoke, commit**

Append to `index.ts`:

```typescript
export { inlineCodePlugin } from './nodes/inline-code';
```

Delete L667-691 from `editor.js` (the `inlineCodePlugin = ViewPlugin.fromClass...` block). Add `inlineCodePlugin` to the destructuring.

Run: `npm run build && ./build.sh debug && open "build/Markdown Note.app"`
Verify inline `` `code` `` highlights correctly. Type `text` then arrow into the code — verify caret hitbox still works (regression check for commit 46cc1b6).

```bash
git add Sources/CoreEditor/src/nodes/inline-code.ts \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/editor.js \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract nodes/inline-code.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Extract `nodes/indented-reset.ts`

Same pattern.

**Files:**
- Create: `Sources/CoreEditor/src/nodes/indented-reset.ts`
- Modify: index.ts, editor.js

- [ ] **Step 6.1: Implement**

Create `Sources/CoreEditor/src/nodes/indented-reset.ts`:

```typescript
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

/** lang-markdown classifies indented or fenced code blocks as CodeText, applying
 *  monospace highlighting. For "user indented but not code" lines this leaks the
 *  mono font into normal text. Apply cm-indented-reset to force body font back. */
export const indentedCodeResetPlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView) {
      const builder: any[] = [];
      const tree = syntaxTree(view.state);
      const doc = view.state.doc;
      tree.iterate({
        enter(node) {
          if (node.name !== 'CodeBlock' && node.name !== 'IndentedCode') return;
          const startLine = doc.lineAt(node.from).number;
          const endLine = doc.lineAt(node.to).number;
          for (let n = startLine; n <= endLine; n++) {
            const line = doc.line(n);
            builder.push(Decoration.line({ class: 'cm-indented-reset' }).range(line.from));
          }
        },
      });
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
```

- [ ] **Step 6.2: Export, remove from editor.js (L638-665), build, smoke, commit**

Append to `index.ts`:

```typescript
export { indentedCodeResetPlugin } from './nodes/indented-reset';
```

Delete the corresponding block from `editor.js`, add destructure.

```bash
npm run build && ./build.sh debug && open "build/Markdown Note.app"
# Verify: a line starting with a tab (but not in a code fence) renders in body font, not mono.
git add -- Sources/CoreEditor/src/nodes/indented-reset.ts Sources/CoreEditor/src/index.ts Sources/MarkdownEditor/Resources/editor.js Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract nodes/indented-reset.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Extract `nodes/code-block.ts`

Same pattern.

**Files:** `Sources/CoreEditor/src/nodes/code-block.ts`, index.ts, editor.js

- [ ] **Step 7.1: Implement**

Create `Sources/CoreEditor/src/nodes/code-block.ts`:

```typescript
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

export const codeBlockLinePlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView) {
      const builder: any[] = [];
      const tree = syntaxTree(view.state);
      const doc = view.state.doc;
      tree.iterate({
        enter(node) {
          if (node.name !== 'FencedCode') return;
          const startLine = doc.lineAt(node.from).number;
          const endLine = doc.lineAt(node.to).number;
          for (let n = startLine; n <= endLine; n++) {
            const line = doc.line(n);
            const classes = ['cm-codeblock-line'];
            if (n === startLine) classes.push('cm-codeblock-first');
            if (n === endLine) classes.push('cm-codeblock-last');
            builder.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
          }
        },
      });
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
```

- [ ] **Step 7.2: Export, remove L488-518 from editor.js, build, smoke, commit**

Append to `index.ts`:

```typescript
export { codeBlockLinePlugin } from './nodes/code-block';
```

Smoke: open a file with ```bash code fence, verify gray background + rounded corners + monospace.

```bash
git add -- Sources/CoreEditor/src/nodes/code-block.ts Sources/CoreEditor/src/index.ts Sources/MarkdownEditor/Resources/editor.js Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract nodes/code-block.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Extract `nodes/table.ts`

Discovered during plan refinement — was not in spec mapping. tableLinePlugin in `editor.js` L345-393.

**Files:** `Sources/CoreEditor/src/nodes/table.ts`, index.ts, editor.js

- [ ] **Step 8.1: Implement**

Create `Sources/CoreEditor/src/nodes/table.ts`:

```typescript
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/** Recognizes pipe-delimited tables (a row line followed by an alignment row) and
 *  decorates each row line + each pipe char. Does not rely on lang-markdown table
 *  parsing (which has gaps); operates on raw line text. */
export const tableLinePlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView) {
      const lineDecos: any[] = [];
      const markDecos: any[] = [];
      const doc = view.state.doc;
      const isTableRow = (t: string) => /^\s*\|.*\|\s*$/.test(t);
      const isAlignRow = (t: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(t);
      let i = 1;
      while (i <= doc.lines) {
        const head = doc.line(i);
        if (
          isTableRow(head.text) &&
          i + 1 <= doc.lines &&
          isAlignRow(doc.line(i + 1).text)
        ) {
          let last = i + 1;
          for (let j = i + 2; j <= doc.lines; j++) {
            if (!isTableRow(doc.line(j).text)) break;
            last = j;
          }
          for (let n = i; n <= last; n++) {
            const line = doc.line(n);
            const classes = ['cm-table-line'];
            if (n === i) classes.push('cm-table-header', 'cm-table-first');
            else if (n === i + 1) classes.push('cm-table-align');
            else if ((n - i) % 2 === 0) classes.push('cm-table-zebra');
            if (n === last) classes.push('cm-table-last');
            lineDecos.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
            for (let k = 0; k < line.text.length; k++) {
              if (line.text[k] === '|') {
                markDecos.push(
                  Decoration.mark({ class: 'cm-table-pipe' }).range(
                    line.from + k,
                    line.from + k + 1,
                  ),
                );
              }
            }
          }
          i = last + 1;
          continue;
        }
        i++;
      }
      return Decoration.set([...lineDecos, ...markDecos], true);
    }
  },
  { decorations: (v) => v.decorations },
);
```

- [ ] **Step 8.2: Export, remove L345-393 from editor.js, build, smoke, commit**

Append to `index.ts`:

```typescript
export { tableLinePlugin } from './nodes/table';
```

Smoke: open a file with `| a | b |\n|---|---|\n| 1 | 2 |`, verify table styling.

```bash
git add -- Sources/CoreEditor/src/nodes/table.ts Sources/CoreEditor/src/index.ts Sources/MarkdownEditor/Resources/editor.js Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract nodes/table.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Extract `nodes/image.ts` (widget + StateField)

Uses `image-utils` from Task 2. Has DOM-creating widget (not coverage target) plus `buildImageDecorations` + `imageField`. Also depends on `docFolderEffect` which lives in `plugins/doc-folder.ts` — but that hasn't been extracted yet. Strategy: extract `docFolderEffect` together as part of this task (combine plugins/doc-folder.ts into the same commit) OR keep effect in editor.js for now and import. We choose to extract docFolderEffect in **Task 13**, so for Task 9 we keep importing the effect from editor.js's destructuring chain via `window.CM`. To do this, expose `docFolderEffect` from cm-reexports namespace by exposing the existing one through a setter.

Simpler: extract docFolderEffect FIRST (Task 9a), then image (Task 9b). Or combine. We combine.

**Files:**
- Create: `Sources/CoreEditor/src/plugins/doc-folder.ts`
- Create: `Sources/CoreEditor/src/nodes/image.ts`
- Modify: `Sources/CoreEditor/src/index.ts`
- Modify: `Sources/MarkdownEditor/Resources/editor.js` (remove image widget L281-310, imageField L727-757, docFolderEffect L313, docFolderURL state L264, also need to update appBridge.setDocFolder later in Task 25)

- [ ] **Step 9.1: Create `Sources/CoreEditor/src/plugins/doc-folder.ts`**

```typescript
import { StateEffect, StateField } from '@codemirror/state';

/** Effect carrying a new document folder URL (file:///path/). Empty string clears. */
export const docFolderEffect = StateEffect.define<string>();

/** Holds the current document folder URL for resolving relative image paths. */
export const docFolderField = StateField.define<string>({
  create() {
    return '';
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(docFolderEffect)) return e.value;
    }
    return value;
  },
});
```

- [ ] **Step 9.2: Create `Sources/CoreEditor/src/nodes/image.ts`**

```typescript
import { EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { parseAltAndSize, imageSrcForRender } from './image-utils';
import { docFolderEffect, docFolderField } from '../plugins/doc-folder';

export class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly src: string,
    readonly width: number | null,
    readonly height: number | null,
    readonly docFolderURL: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      other.alt === this.alt &&
      other.src === this.src &&
      other.width === this.width &&
      other.height === this.height &&
      other.docFolderURL === this.docFolderURL
    );
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'md-image-wrap';
    wrap.contentEditable = 'false';
    const img = document.createElement('img');
    img.className = 'md-image';
    img.src = imageSrcForRender(this.src, this.docFolderURL);
    img.alt = this.alt;
    img.loading = 'lazy';
    img.draggable = false;
    if (this.width) img.width = this.width;
    if (this.height) img.height = this.height;
    img.onerror = () => {
      wrap.classList.add('md-image-error');
      wrap.dataset.failedSrc = img.src;
    };
    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildImageDecorations(state: EditorState) {
  const builder: any[] = [];
  const re = /^\s*!\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)\s*$/;
  const docFolderURL = state.field(docFolderField, false) ?? '';
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const m = line.text.match(re);
    if (!m) continue;
    const { alt, width, height } = parseAltAndSize(m[1] ?? '');
    const src = (m[2] ?? '').split(/\s+/)[0] ?? '';
    const widget = Decoration.widget({
      widget: new ImageWidget(alt, src, width, height, docFolderURL),
      side: 1,
      block: true,
    });
    builder.push(widget.range(line.to));
  }
  return Decoration.set(builder, true);
}

export const imageField = StateField.define({
  create(state) {
    return buildImageDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged) return buildImageDecorations(tr.state);
    for (const e of tr.effects) {
      if (e.is(docFolderEffect)) return buildImageDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});
```

Note: `imageField` now reads docFolder from `docFolderField` (state-resident), not a module-level mutable `docFolderURL`. This is a small API improvement: state-driven, testable. The bridge call in `editor.js` already dispatches `docFolderEffect` — it just needs to keep doing so AND we add `docFolderField` to the extensions list.

- [ ] **Step 9.3: Export from index.ts**

Append:

```typescript
export { docFolderEffect, docFolderField } from './plugins/doc-folder';
export { ImageWidget, imageField } from './nodes/image';
```

- [ ] **Step 9.4: Update editor.js to use new modules**

In `editor.js`:

a) Add to destructuring:

```javascript
const {
  // ... existing
  docFolderEffect, docFolderField,
  ImageWidget, imageField,
} = window.CM;
```

b) Delete the local `let docFolderURL = "";` line (L264) — state now lives in `docFolderField`.

c) Delete the local `ImageWidget` class (L281-310).

d) Delete the local `docFolderEffect = StateEffect.define()` line (L313).

e) Delete `buildImageDecorations` and `imageField` (L727-757).

f) Update `makeExtensions()` (around L994) to include `docFolderField` in the array. After `imageField,` add `docFolderField,` (the field must be present in state for image module to read it).

g) Update `window.appBridge.setDocFolder` to NOT touch local `docFolderURL` (variable is gone) and only dispatch the effect:

```javascript
setDocFolder(url) {
  view.dispatch({ effects: docFolderEffect.of(url || "") });
},
```

(Currently it also sets `docFolderURL = url || "";` — remove that line.)

- [ ] **Step 9.5: Build, smoke, commit**

```bash
npm run build && ./build.sh debug && open "build/Markdown Note.app"
# Smoke checks:
# 1. Open a note with markdown image — image renders.
# 2. Switch to a different folder via folder sidebar — image still renders (docFolder effect propagated).
# 3. Drag a new image onto editor — image appears.
git add -- Sources/CoreEditor/src/nodes/image.ts \
           Sources/CoreEditor/src/plugins/doc-folder.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "$(cat <<'EOF'
feat(coreeditor): extract nodes/image + plugins/doc-folder

- ImageWidget + imageField → src/nodes/image.ts
- docFolderEffect + docFolderField → src/plugins/doc-folder.ts
- docFolder URL now lives in state (was module-level mutable)
- appBridge.setDocFolder dispatches effect only

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Extract `nodes/mermaid.ts` (highest risk — StateField + 2 widgets + toggle effect)

Big chunk. Spec L520-636 in `editor.js`.

**Files:**
- Create: `Sources/CoreEditor/src/nodes/mermaid.ts`
- Modify: index.ts, editor.js

- [ ] **Step 10.1: Implement**

Create `Sources/CoreEditor/src/nodes/mermaid.ts`:

```typescript
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

declare global {
  interface Window {
    mermaid?: {
      render(id: string, src: string): Promise<{ svg: string }>;
    };
  }
}

export const toggleMermaidEffect = StateEffect.define<{ pos: number; on: boolean }>();

export const mermaidActiveField = StateField.define<Set<string>>({
  create() {
    return new Set();
  },
  update(value, tr) {
    let next = value;
    for (const e of tr.effects) {
      if (e.is(toggleMermaidEffect)) {
        next = new Set(next);
        const key = String(e.value.pos);
        if (e.value.on) next.add(key);
        else next.delete(key);
      }
    }
    if (tr.docChanged) {
      // Doc changes can shift positions; reset conservatively.
      return new Set();
    }
    return next;
  },
});

class MermaidToggleWidget extends WidgetType {
  constructor(readonly active: boolean, readonly pos: number) {
    super();
  }
  eq(o: MermaidToggleWidget): boolean {
    return o.active === this.active && o.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'md-mermaid-toggle';
    btn.type = 'button';
    btn.contentEditable = 'false';
    btn.textContent = this.active ? '◧ 코드 보기' : '▦ 다이어그램 보기';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        effects: toggleMermaidEffect.of({ pos: this.pos, on: !this.active }),
      });
    };
    return btn;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

class MermaidRenderWidget extends WidgetType {
  constructor(readonly src: string, readonly key: string) {
    super();
  }
  eq(o: MermaidRenderWidget): boolean {
    return o.src === this.src && o.key === this.key;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'md-mermaid-render';
    wrap.contentEditable = 'false';
    if (!window.mermaid) {
      wrap.className = 'md-mermaid-error';
      wrap.textContent = 'mermaid library not loaded';
      return wrap;
    }
    const id = 'mmd_' + Math.random().toString(36).slice(2);
    window.mermaid
      .render(id, this.src)
      .then(({ svg }) => {
        wrap.innerHTML = svg;
      })
      .catch((err: unknown) => {
        wrap.className = 'md-mermaid-error';
        const msg = err instanceof Error ? err.message : String(err);
        wrap.textContent = 'mermaid error: ' + msg;
      });
    return wrap;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

function buildMermaidDecorations(state: EditorState) {
  const builder: any[] = [];
  const tree = syntaxTree(state);
  const doc = state.doc;
  const active = state.field(mermaidActiveField, false) ?? new Set<string>();
  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const startLine = doc.lineAt(node.from);
      const endLine = doc.lineAt(node.to);
      const m = startLine.text.match(/^\s*(?:```|~~~)\s*(\w+)/);
      if (!m || (m[1] ?? '').toLowerCase() !== 'mermaid') return;
      const key = String(startLine.from);
      const isActive = active.has(key);
      builder.push(
        Decoration.widget({
          widget: new MermaidToggleWidget(isActive, startLine.from),
          side: -1,
          block: true,
        }).range(startLine.from),
      );
      if (isActive) {
        for (let n = startLine.number; n <= endLine.number; n++) {
          const line = doc.line(n);
          builder.push(
            Decoration.line({ class: 'cm-mermaid-hidden' }).range(line.from),
          );
        }
        const body = doc.sliceString(startLine.to, endLine.from).trim();
        builder.push(
          Decoration.widget({
            widget: new MermaidRenderWidget(body, key),
            side: 1,
            block: true,
          }).range(endLine.to),
        );
      }
    },
  });
  return Decoration.set(builder, true);
}

export const mermaidDecoField = StateField.define({
  create(state) {
    return buildMermaidDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged) return buildMermaidDecorations(tr.state);
    for (const e of tr.effects) {
      if (e.is(toggleMermaidEffect)) return buildMermaidDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});
```

- [ ] **Step 10.2: Export, remove, build, smoke, commit**

Append to `index.ts`:

```typescript
export {
  toggleMermaidEffect,
  mermaidActiveField,
  mermaidDecoField,
} from './nodes/mermaid';
```

Delete L520-636 from `editor.js` (toggleMermaidEffect, mermaidActiveField, MermaidToggleWidget, MermaidRenderWidget, buildMermaidDecorations, mermaidDecoField). Add destructure entries.

Smoke checks: open a note with ```mermaid block, click "▦ 다이어그램 보기" toggle, verify SVG renders. Toggle back. Type new mermaid block — verify toggle button appears.

```bash
git add -- Sources/CoreEditor/src/nodes/mermaid.ts Sources/CoreEditor/src/index.ts Sources/MarkdownEditor/Resources/editor.js Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract nodes/mermaid.ts (toggle + render widgets + state)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Extract `plugins/task-line.ts`

editor.js L317-343.

**Files:** `Sources/CoreEditor/src/plugins/task-line.ts`, index.ts, editor.js

- [ ] **Step 11.1: Implement**

Create `Sources/CoreEditor/src/plugins/task-line.ts`:

```typescript
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

export const taskLinePlugin = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView) {
      const builder: any[] = [];
      const doc = view.state.doc;
      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const m = line.text.match(/^(\s*[-*+]\s+\[)([ xX])(\])/);
        if (!m) continue;
        const checkClass = (m[2] ?? '').toLowerCase() === 'x' ? 'cm-task-checked' : 'cm-task-unchecked';
        if ((m[2] ?? '').toLowerCase() === 'x') {
          builder.push(Decoration.line({ class: 'cm-task-done' }).range(line.from));
        }
        const start = line.from + (m[1] ?? '').length - 1;
        const end = start + 3;
        builder.push(Decoration.mark({ class: checkClass }).range(start, end));
      }
      return Decoration.set(builder, true);
    }
  },
  { decorations: (v) => v.decorations },
);
```

- [ ] **Step 11.2: Export, remove L317-343 from editor.js, build, smoke, commit**

Append to `index.ts`:

```typescript
export { taskLinePlugin } from './plugins/task-line';
```

Smoke: open a note with `- [ ] todo` and `- [x] done`, verify check styling.

```bash
git add -- Sources/CoreEditor/src/plugins/task-line.ts Sources/CoreEditor/src/index.ts Sources/MarkdownEditor/Resources/editor.js Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract plugins/task-line.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Extract `plugins/line-kind-gutter.ts`

editor.js L441-486.

**Files:** `Sources/CoreEditor/src/plugins/line-kind-gutter.ts`, index.ts, editor.js

- [ ] **Step 12.1: Implement**

Create `Sources/CoreEditor/src/plugins/line-kind-gutter.ts`:

```typescript
import { gutter, GutterMarker } from '@codemirror/view';

class LineKindMarker extends GutterMarker {
  constructor(readonly label: string) {
    super();
  }
  eq(other: LineKindMarker): boolean {
    return other.label === this.label;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-line-kind';
    span.textContent = this.label;
    return span;
  }
}

const M_H1 = new LineKindMarker('h1');
const M_H2 = new LineKindMarker('h2');
const M_H3 = new LineKindMarker('h3');
const M_H4 = new LineKindMarker('h4');
const M_H5 = new LineKindMarker('h5');
const M_H6 = new LineKindMarker('h6');
const M_QUOTE = new LineKindMarker('│');
const M_CODE = new LineKindMarker('─');
const M_HR = new LineKindMarker('⎯');
const M_LIST = new LineKindMarker('•');
const M_TASK_DONE = new LineKindMarker('✓');
const M_TASK_TODO = new LineKindMarker('☐');

export const lineKindGutter = gutter({
  class: 'cm-line-kind-gutter',
  lineMarker(view, line) {
    const t = view.state.doc.lineAt(line.from).text;
    if (/^\s*#{6}\s/.test(t)) return M_H6;
    if (/^\s*#{5}\s/.test(t)) return M_H5;
    if (/^\s*#{4}\s/.test(t)) return M_H4;
    if (/^\s*#{3}\s/.test(t)) return M_H3;
    if (/^\s*#{2}\s/.test(t)) return M_H2;
    if (/^\s*#{1}\s/.test(t)) return M_H1;
    if (/^\s*>+\s/.test(t)) return M_QUOTE;
    const cb = t.match(/^\s*[-*+]\s+\[([ xX])\]/);
    if (cb) return (cb[1] ?? '').toLowerCase() === 'x' ? M_TASK_DONE : M_TASK_TODO;
    if (/^\s*([-*+]|\d+\.)\s/.test(t)) return M_LIST;
    if (/^\s*([-_*])(\s*\1){2,}\s*$/.test(t)) return M_HR;
    if (/^\s*```|^\s*~~~/.test(t)) return M_CODE;
    return null;
  },
  initialSpacer() {
    return M_H2;
  },
});
```

Note: The original `editor.js` also has `M_PARA = new LineKindMarker("¶")` but it's never returned by lineMarker (paragraphs return null per comment "본문 paragraph는 마커 없음"). Keep it out of the TS module — dead code.

- [ ] **Step 12.2: Export, remove L441-486 from editor.js, build, smoke, commit**

Append to `index.ts`:

```typescript
export { lineKindGutter } from './plugins/line-kind-gutter';
```

Smoke: open a file with mixed headings/lists/quotes, verify left gutter shows h1/h2/•/│ etc.

```bash
git add -- Sources/CoreEditor/src/plugins/line-kind-gutter.ts Sources/CoreEditor/src/index.ts Sources/MarkdownEditor/Resources/editor.js Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract plugins/line-kind-gutter.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Extract `plugins/status-bar.ts`

editor.js L395-439.

**Files:** `Sources/CoreEditor/src/plugins/status-bar.ts`, index.ts, editor.js

- [ ] **Step 13.1: Implement**

Create `Sources/CoreEditor/src/plugins/status-bar.ts`:

```typescript
import { EditorState } from '@codemirror/state';
import { EditorView, showPanel, ViewUpdate } from '@codemirror/view';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function makeStatusPanel(view: EditorView) {
  const dom = document.createElement('div');
  dom.className = 'cm-status-bar';
  const sel = document.createElement('span');
  sel.className = 'cm-status-pos';
  const meta = document.createElement('span');
  meta.className = 'cm-status-meta';
  const format = document.createElement('span');
  format.className = 'cm-status-format';
  format.textContent = 'UTF-8 · LF · Markdown';
  const tasks = document.createElement('span');
  tasks.className = 'cm-status-tasks';
  const spacer = document.createElement('span');
  spacer.className = 'cm-status-spacer';
  const size = document.createElement('span');
  size.className = 'cm-status-size';
  dom.append(sel, meta, format, tasks, spacer, size);

  function refresh(state: EditorState) {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const col = head - line.from + 1;
    sel.textContent = `Ln ${line.number}, Col ${col}`;

    const text = state.doc.toString();
    meta.textContent = `${(text.match(/\S+/g) ?? []).length}w · ${state.doc.lines}L`;

    let total = 0;
    let done = 0;
    const re = /^\s*([-*+]|\d+\.)\s+\[([ xX])\]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      total++;
      if ((m[2] ?? '').toLowerCase() === 'x') done++;
    }
    tasks.textContent = total > 0 ? `${done} / ${total} tasks` : '';

    const bytes = new TextEncoder().encode(text).byteLength;
    size.textContent = formatBytes(bytes);
  }
  refresh(view.state);

  return {
    dom,
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) refresh(u.state);
    },
  };
}

export const statusBarPanel = showPanel.of(makeStatusPanel);
```

- [ ] **Step 13.2: Export, remove L395-439 from editor.js, build, smoke, commit**

Append to `index.ts`:

```typescript
export { statusBarPanel } from './plugins/status-bar';
```

In editor.js `makeExtensions()`, replace `showPanel.of(makeStatusPanel),` with `statusBarPanel,`.

Smoke: verify bottom status bar shows `Ln 1, Col 1`, word/line count, encoding, and updates when typing.

```bash
git add -- Sources/CoreEditor/src/plugins/status-bar.ts Sources/CoreEditor/src/index.ts Sources/MarkdownEditor/Resources/editor.js Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract plugins/status-bar.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Extract `commands/wrap-selection.ts` (with tests)

Cmd-B / Cmd-I markdown shortcuts. Pure command function — fully testable using a real `EditorState`.

**Files:**
- Create: `Sources/CoreEditor/src/commands/wrap-selection.ts`
- Create: `Sources/CoreEditor/test/commands/wrap-selection.test.ts`
- Modify: index.ts, editor.js

- [ ] **Step 14.1: Write failing test**

Create `Sources/CoreEditor/test/commands/wrap-selection.test.ts`:

```typescript
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { wrapSelection } from '../../src/commands/wrap-selection';

function makeView(doc: string, anchor: number, head?: number): EditorView {
  const sel = head === undefined ? EditorSelection.cursor(anchor) : EditorSelection.range(anchor, head);
  const state = EditorState.create({ doc, selection: sel });
  return new EditorView({ state });
}

describe('wrapSelection', () => {
  it('wraps a non-empty selection', () => {
    const view = makeView('hello world', 0, 5);
    const cmd = wrapSelection('**', '**');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('**hello** world');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(2);
    expect(sel.to).toBe(7);
  });

  it('inserts markers at cursor when empty selection', () => {
    const view = makeView('', 0);
    const cmd = wrapSelection('**', '**');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('****');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(2);
    expect(sel.to).toBe(2);
  });

  it('unwraps when markers already surround selection', () => {
    const view = makeView('**hello** world', 2, 7);
    const cmd = wrapSelection('**', '**');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('hello world');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(5);
  });

  it('works with single-char markers (italic)', () => {
    const view = makeView('foo', 0, 3);
    const cmd = wrapSelection('*', '*');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('*foo*');
  });

  it('handles asymmetric markers', () => {
    const view = makeView('text', 0, 4);
    const cmd = wrapSelection('<u>', '</u>');
    expect(cmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('<u>text</u>');
  });
});
```

- [ ] **Step 14.2: Implement**

Create `Sources/CoreEditor/src/commands/wrap-selection.ts`:

```typescript
import { EditorState, Transaction, TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

type Cmd = (view: { state: EditorState; dispatch: (tr: TransactionSpec | Transaction) => void } | EditorView) => boolean;

export function wrapSelection(left: string, right: string): Cmd {
  return ({ state, dispatch }) => {
    const sel = state.selection.main;
    const text = state.doc.sliceString(sel.from, sel.to);
    const before = state.doc.sliceString(Math.max(0, sel.from - left.length), sel.from);
    const after = state.doc.sliceString(sel.to, Math.min(state.doc.length, sel.to + right.length));
    if (before === left && after === right) {
      dispatch(
        state.update({
          changes: [
            { from: sel.from - left.length, to: sel.from, insert: '' },
            { from: sel.to, to: sel.to + right.length, insert: '' },
          ],
          selection: { anchor: sel.from - left.length, head: sel.to - left.length },
          scrollIntoView: true,
        }),
      );
      return true;
    }
    let replacement: string;
    let selStart: number;
    let selEnd: number;
    if (sel.empty) {
      replacement = left + right;
      selStart = sel.from + left.length;
      selEnd = selStart;
    } else {
      replacement = left + text + right;
      selStart = sel.from + left.length;
      selEnd = selStart + text.length;
    }
    dispatch(
      state.update({
        changes: { from: sel.from, to: sel.to, insert: replacement },
        selection: { anchor: selStart, head: selEnd },
        scrollIntoView: true,
      }),
    );
    return true;
  };
}
```

- [ ] **Step 14.3: Run tests**

Run: `npm test -- commands/wrap-selection`
Expected: 5 tests pass.

- [ ] **Step 14.4: Export, remove from editor.js, build, smoke, commit**

Append to `index.ts`:

```typescript
export { wrapSelection } from './commands/wrap-selection';
```

In `editor.js`: delete the `wrapSelection` function definition (L761-797). Add `wrapSelection` to destructuring.

Smoke: select word, hit ⌘B → wraps with `**`. Hit ⌘B again → unwraps.

```bash
git add -- Sources/CoreEditor/src/commands/wrap-selection.ts \
           Sources/CoreEditor/test/commands/wrap-selection.test.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract commands/wrap-selection with tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Extract `commands/insert-link.ts` (with tests)

⌘K. editor.js L799-819.

**Files:** `Sources/CoreEditor/src/commands/insert-link.ts`, `Sources/CoreEditor/test/commands/insert-link.test.ts`, index.ts, editor.js

- [ ] **Step 15.1: Test**

Create `Sources/CoreEditor/test/commands/insert-link.test.ts`:

```typescript
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { insertLinkCmd } from '../../src/commands/insert-link';

function makeView(doc: string, anchor: number, head?: number): EditorView {
  const sel = head === undefined ? EditorSelection.cursor(anchor) : EditorSelection.range(anchor, head);
  const state = EditorState.create({ doc, selection: sel });
  return new EditorView({ state });
}

describe('insertLinkCmd', () => {
  it('inserts [text](url) when nothing selected', () => {
    const view = makeView('', 0);
    expect(insertLinkCmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('[text](url)');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(1);
    expect(sel.to).toBe(5);
  });

  it('wraps selected text and selects url placeholder', () => {
    const view = makeView('hello', 0, 5);
    expect(insertLinkCmd(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('[hello](url)');
    const sel = view.state.selection.main;
    expect(sel.from).toBe(8);
    expect(sel.to).toBe(11);
  });
});
```

- [ ] **Step 15.2: Implement**

Create `Sources/CoreEditor/src/commands/insert-link.ts`:

```typescript
import { EditorState, TransactionSpec } from '@codemirror/state';

export function insertLinkCmd({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (tr: TransactionSpec) => void;
}): boolean {
  const sel = state.selection.main;
  const selText = state.doc.sliceString(sel.from, sel.to);
  const labelText = selText || 'text';
  const placeholder = 'url';
  const replacement = `[${labelText}](${placeholder})`;
  let from: number;
  let to: number;
  if (selText) {
    from = sel.from + `[${labelText}](`.length;
    to = from + placeholder.length;
  } else {
    from = sel.from + 1;
    to = from + labelText.length;
  }
  dispatch(
    state.update({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: { anchor: from, head: to },
      scrollIntoView: true,
    }),
  );
  return true;
}
```

- [ ] **Step 15.3: Run tests, export, remove L799-819 from editor.js, build, smoke, commit**

Run: `npm test -- commands/insert-link` → 2 pass.

Append to `index.ts`:

```typescript
export { insertLinkCmd } from './commands/insert-link';
```

Smoke: hit ⌘K → `[text](url)` appears, `url` selected.

```bash
git add -- Sources/CoreEditor/src/commands/insert-link.ts \
           Sources/CoreEditor/test/commands/insert-link.test.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract commands/insert-link with tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Extract `commands/list-continue.ts` (with tests)

Enter handler `handleEnter` — editor.js L823-889. Continues bullet/numbered/checkbox lists on Enter.

**Files:** `Sources/CoreEditor/src/commands/list-continue.ts`, test, index.ts, editor.js

- [ ] **Step 16.1: Test**

Create `Sources/CoreEditor/test/commands/list-continue.test.ts`:

```typescript
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { handleEnter } from '../../src/commands/list-continue';

function makeView(doc: string, cursorPos: number): EditorView {
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(cursorPos) });
  return new EditorView({ state });
}

describe('handleEnter — bullet list', () => {
  it('continues bullet list', () => {
    const view = makeView('- item', 6);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- item\n- ');
  });

  it('removes marker on empty bullet line', () => {
    const view = makeView('- ', 2);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });

  it('preserves indentation', () => {
    const view = makeView('  - sub', 7);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('  - sub\n  - ');
  });
});

describe('handleEnter — ordered list', () => {
  it('increments number', () => {
    const view = makeView('1. first', 8);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('1. first\n2. ');
  });

  it('removes marker on empty numbered line', () => {
    const view = makeView('1. ', 3);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });
});

describe('handleEnter — checkbox', () => {
  it('continues with unchecked box', () => {
    const view = makeView('- [ ] todo', 10);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] todo\n- [ ] ');
  });

  it('continues from done with unchecked box', () => {
    const view = makeView('- [x] done', 10);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] done\n- [ ] ');
  });

  it('removes marker on empty checkbox line', () => {
    const view = makeView('- [ ] ', 6);
    expect(handleEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });
});

describe('handleEnter — non-list lines', () => {
  it('returns false on plain text', () => {
    const view = makeView('plain', 5);
    expect(handleEnter(view)).toBe(false);
  });

  it('returns false when selection is non-empty', () => {
    const state = EditorState.create({ doc: '- item', selection: EditorSelection.range(0, 6) });
    const view = new EditorView({ state });
    expect(handleEnter(view)).toBe(false);
  });
});
```

- [ ] **Step 16.2: Implement**

Create `Sources/CoreEditor/src/commands/list-continue.ts`:

```typescript
import { EditorState, TransactionSpec } from '@codemirror/state';

export function handleEnter({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (tr: TransactionSpec) => void;
}): boolean {
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const text = line.text;

  let m = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (m) {
    const [, indent, mk, , content] = m;
    if ((content ?? '') === '' && sel.head === line.to) {
      dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: '' },
          selection: { anchor: line.from },
          scrollIntoView: true,
        }),
      );
      return true;
    }
    const insert = `\n${indent}${mk} [ ] `;
    dispatch(
      state.update({
        changes: { from: sel.head, to: sel.head, insert },
        selection: { anchor: sel.head + insert.length },
        scrollIntoView: true,
      }),
    );
    return true;
  }
  m = text.match(/^(\s*)([-*+])\s+(.*)$/);
  if (m) {
    const [, indent, mk, content] = m;
    if ((content ?? '') === '' && sel.head === line.to) {
      dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: '' },
          selection: { anchor: line.from },
          scrollIntoView: true,
        }),
      );
      return true;
    }
    const insert = `\n${indent}${mk} `;
    dispatch(
      state.update({
        changes: { from: sel.head, to: sel.head, insert },
        selection: { anchor: sel.head + insert.length },
        scrollIntoView: true,
      }),
    );
    return true;
  }
  m = text.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (m) {
    const [, indent, numStr, content] = m;
    const num = parseInt(numStr ?? '0', 10);
    if ((content ?? '') === '' && sel.head === line.to) {
      dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: '' },
          selection: { anchor: line.from },
          scrollIntoView: true,
        }),
      );
      return true;
    }
    const insert = `\n${indent}${num + 1}. `;
    dispatch(
      state.update({
        changes: { from: sel.head, to: sel.head, insert },
        selection: { anchor: sel.head + insert.length },
        scrollIntoView: true,
      }),
    );
    return true;
  }
  return false;
}
```

- [ ] **Step 16.3: Run tests, export, remove from editor.js, build, smoke, commit**

Run: `npm test -- commands/list-continue` → 9 pass.

Append to `index.ts`:

```typescript
export { handleEnter } from './commands/list-continue';
```

Smoke: Type `- foo`, hit Enter → `- ` continues. Hit Enter on empty bullet → marker gone.

Note: `editor.js` doesn't actually wire `handleEnter` into the keymap directly — instead `imeListContinueFilter` handles Enter via transactionFilter for IME compatibility. `handleEnter` exists as a fallback / pure logic source. Keep it; we ALSO move imeListContinueFilter in Task 17, after which `handleEnter` may end up dead code; if so, remove the export at task 17 end. For now keep it.

Delete L823-889 from `editor.js` and add `handleEnter` to destructure.

```bash
git add -- Sources/CoreEditor/src/commands/list-continue.ts \
           Sources/CoreEditor/test/commands/list-continue.test.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract commands/list-continue with tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Extract `commands/ime-list-continue.ts` (with tests)

Transaction filter for IME-friendly list continuation. editor.js L891-948.

**Files:** `Sources/CoreEditor/src/commands/ime-list-continue.ts`, test, index.ts, editor.js

- [ ] **Step 17.1: Implement (transactionFilter is harder to unit-test directly; test pure helper)**

The filter wraps a pure decision function. Split it:

Create `Sources/CoreEditor/src/commands/ime-list-continue.ts`:

```typescript
import { EditorState, Transaction } from '@codemirror/state';

interface SingleNewlineInsertion {
  insertedText: string;
  insertPos: number;
}

/** If `tr` is a single insertion ending in \n, returns its details. Otherwise null. */
export function extractNewlineInsertion(tr: Transaction): SingleNewlineInsertion | null {
  if (!tr.docChanged) return null;
  let insertedText: string | null = null;
  let insertPos = -1;
  let changeCount = 0;
  let bad = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changeCount++;
    if (fromA !== toA) {
      bad = true;
      return;
    }
    const t = inserted.toString();
    if (!t.endsWith('\n')) {
      bad = true;
      return;
    }
    insertedText = t;
    insertPos = fromA;
  });
  if (bad || changeCount !== 1 || insertedText === null) return null;
  return { insertedText, insertPos };
}

/** Compute the list-continuation prefix for a given before-line text. */
export function listPrefixFor(text: string): string | null {
  let m = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+/);
  if (m) return `${m[1]}${m[2]} [ ] `;
  m = text.match(/^(\s*)([-*+])\s+/);
  if (m) return `${m[1]}${m[2]} `;
  m = text.match(/^(\s*)(\d+)\.\s+/);
  if (m) {
    const num = parseInt(m[2] ?? '0', 10);
    return `${m[1]}${num + 1}. `;
  }
  return null;
}

export const imeListContinueFilter = EditorState.transactionFilter.of((tr) => {
  const ins = extractNewlineInsertion(tr);
  if (!ins) return tr;
  const { insertedText, insertPos } = ins;
  const firstNewlineOffset = insertedText.indexOf('\n');
  const newlineAt = insertPos + firstNewlineOffset;
  const beforeLine = tr.state.doc.lineAt(newlineAt);
  const beforeText = beforeLine.text;
  const prefix = listPrefixFor(beforeText);
  if (prefix === null) return tr;

  const contentAfter = beforeText.slice(prefix.length).trim();
  if (contentAfter === '' && newlineAt === beforeLine.to) {
    return [
      {
        changes: { from: beforeLine.from, to: newlineAt + 1, insert: '' },
        selection: { anchor: beforeLine.from },
      },
    ];
  }

  const beforeNewlinePart = insertedText.slice(0, firstNewlineOffset);
  const finalInsert = beforeNewlinePart + '\n' + prefix;
  return [
    {
      changes: { from: insertPos, to: insertPos, insert: finalInsert },
      selection: { anchor: insertPos + finalInsert.length },
    },
  ];
});
```

- [ ] **Step 17.2: Tests for pure helpers**

Create `Sources/CoreEditor/test/commands/ime-list-continue.test.ts`:

```typescript
import { listPrefixFor } from '../../src/commands/ime-list-continue';

describe('listPrefixFor', () => {
  it('returns bullet prefix', () => {
    expect(listPrefixFor('- foo')).toBe('- ');
  });

  it('returns bullet prefix with indent', () => {
    expect(listPrefixFor('   * foo')).toBe('   * ');
  });

  it('returns numbered prefix incrementing the number', () => {
    expect(listPrefixFor('1. one')).toBe('2. ');
    expect(listPrefixFor('  7. seven')).toBe('  8. ');
  });

  it('returns checkbox prefix as unchecked', () => {
    expect(listPrefixFor('- [ ] todo')).toBe('- [ ] ');
    expect(listPrefixFor('- [x] done')).toBe('- [ ] ');
    expect(listPrefixFor('  + [X] cap')).toBe('  + [ ] ');
  });

  it('returns null for plain text', () => {
    expect(listPrefixFor('hello')).toBeNull();
  });

  it('returns null for heading', () => {
    expect(listPrefixFor('# heading')).toBeNull();
  });

  it('returns null when not at list-marker start', () => {
    expect(listPrefixFor('text - notlist')).toBeNull();
  });
});
```

- [ ] **Step 17.3: Run tests, export, remove L891-948 from editor.js, build, smoke, commit**

Run: `npm test -- ime-list-continue` → 7 pass.

Append to `index.ts`:

```typescript
export {
  imeListContinueFilter,
  listPrefixFor,
  extractNewlineInsertion,
} from './commands/ime-list-continue';
```

Delete L891-948 from `editor.js` and add `imeListContinueFilter` to destructure.

Smoke: Type `- foo`, Enter → `- ` continues. Korean IME: type Korean text on a bullet line, Enter → continues correctly (no double newline).

```bash
git add -- Sources/CoreEditor/src/commands/ime-list-continue.ts \
           Sources/CoreEditor/test/commands/ime-list-continue.test.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract commands/ime-list-continue with tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Extract `bridge/outgoing.ts`

JS → Swift outgoing message wrappers. editor.js scattered: L953-961 `notifySwift`, L985-992 `notifyCursorLine`, L1141-1152 `postImageToSwift`, plus diagnostic forwarding from `editor.html` L282-295.

**Files:** `Sources/CoreEditor/src/bridge/outgoing.ts`, index.ts, editor.js

- [ ] **Step 18.1: Implement**

Create `Sources/CoreEditor/src/bridge/outgoing.ts`:

```typescript
declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        textChanged?: { postMessage(text: string): void };
        cursorLine?: { postMessage(line: number): void };
        consoleLog?: { postMessage(msg: string): void };
        imageDropped?: { postMessage(payload: { dataURL: string; name: string }): void };
      };
    };
  }
}

const handlers = () => window.webkit?.messageHandlers;

let textChangedTimer: ReturnType<typeof setTimeout> | null = null;
const TEXT_DEBOUNCE_MS = 150;

/** Send textChanged to Swift (debounced 150ms). */
export function postTextChanged(text: string): void {
  if (textChangedTimer) clearTimeout(textChangedTimer);
  textChangedTimer = setTimeout(() => {
    handlers()?.textChanged?.postMessage(text);
  }, TEXT_DEBOUNCE_MS);
}

let lastCursorLine = -1;
/** Send cursorLine (0-based) to Swift, only if changed since last send. */
export function postCursorLine(line: number): void {
  if (line === lastCursorLine) return;
  lastCursorLine = line;
  handlers()?.cursorLine?.postMessage(line);
}

/** Forward an arbitrary diagnostic line to Swift. */
export function postConsoleLog(msg: string): void {
  handlers()?.consoleLog?.postMessage(msg);
}

/** Forward a clipboard image (as data URL) to Swift. */
export function postImageDropped(dataURL: string, name: string): void {
  handlers()?.imageDropped?.postMessage({ dataURL, name });
}
```

- [ ] **Step 18.2: Export, replace inline calls in editor.js, build, smoke, commit**

Append to `index.ts`:

```typescript
export {
  postTextChanged,
  postCursorLine,
  postConsoleLog,
  postImageDropped,
} from './bridge/outgoing';
```

In `editor.js`:

a) Delete `notifyTimer`, `notifySwift`, `lastNotifiedCursorLine`, `notifyCursorLine`, `postImageToSwift` definitions (L952-961, L984-992, L1141-1152).

b) Add to destructure: `postTextChanged, postCursorLine, postImageDropped`.

c) Replace call sites:
- `notifySwift(text)` → `postTextChanged(text)`
- `notifyCursorLine(line)` → `postCursorLine(line)`
- Inside paste handler (still in editor.js for now), use `postImageDropped(reader.result, file.name)` directly.

Smoke: type in editor → Swift gets textChanged. Move cursor → Swift gets cursorLine. Paste image → Swift gets imageDropped.

```bash
git add -- Sources/CoreEditor/src/bridge/outgoing.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract bridge/outgoing.ts

Consolidates window.webkit.messageHandlers calls. editor.js no longer
touches WebKit globals for outgoing messages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Extract `plugins/paste-image.ts`

Now bridge/outgoing exists. (Module as written in earlier draft.)

**Files:** `Sources/CoreEditor/src/plugins/paste-image.ts`, index.ts, editor.js

- [ ] **Step 19.1: Implement**

Create `Sources/CoreEditor/src/plugins/paste-image.ts`:

```typescript
import { EditorView } from '@codemirror/view';
import { postImageDropped } from '../bridge/outgoing';

/** Attach a paste listener that forwards clipboard images to Swift. */
export function installPasteImageHandler(view: EditorView): void {
  view.dom.addEventListener(
    'paste',
    (e: Event) => {
      const ev = e as ClipboardEvent;
      if (!ev.clipboardData) return;
      for (const item of Array.from(ev.clipboardData.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            ev.preventDefault();
            ev.stopPropagation();
            void postImageDroppedFromFile(file);
            return;
          }
        }
      }
    },
    true,
  );
}

function postImageDroppedFromFile(file: File): Promise<void> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        postImageDropped(result, file.name || 'image.png');
      }
      resolve();
    };
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 19.2: Export, replace editor.js paste listener, build, smoke, commit**

Append to `index.ts`:

```typescript
export { installPasteImageHandler } from './plugins/paste-image';
```

Delete L1154-1167 paste listener from `editor.js`. Add destructure for `installPasteImageHandler`. After EditorView construction, call `installPasteImageHandler(view);`.

Smoke: take a screenshot (⌘⇧⌃4), paste into editor → image inserts.

```bash
git add -- Sources/CoreEditor/src/plugins/paste-image.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract plugins/paste-image.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Extract `styling/base-theme.ts` and `styling/highlight.ts`

The largest single block (L16-260). Combined into one task — they're declarative data with no logic.

**Files:** `Sources/CoreEditor/src/styling/base-theme.ts`, `Sources/CoreEditor/src/styling/highlight.ts`, index.ts, editor.js

- [ ] **Step 20.1: Move baseTheme**

Cut L19-220 from `editor.js` (the `const baseTheme = EditorView.theme({ ... })` block) into a new file.

Create `Sources/CoreEditor/src/styling/base-theme.ts`:

```typescript
import { EditorView } from '@codemirror/view';

export const baseTheme = EditorView.theme(/* paste the object literal from editor.js L19-220 here */);
```

The object literal is the ~200-line theme spec. Copy it verbatim. **No content changes.**

- [ ] **Step 20.2: Move mdHighlight**

Cut L222-260 (the `const mdHighlight = HighlightStyle.define([...])` block).

Create `Sources/CoreEditor/src/styling/highlight.ts`:

```typescript
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const mdHighlight = HighlightStyle.define(/* paste array from editor.js L222-260 here */);
```

Object literals from editor.js verbatim. **No content changes.**

- [ ] **Step 20.3: Export, update destructure, build, smoke, commit**

Append to `index.ts`:

```typescript
export { baseTheme } from './styling/base-theme';
export { mdHighlight } from './styling/highlight';
```

In `editor.js` destructuring add `baseTheme, mdHighlight`. Delete the cut blocks. Verify `themeCompartment.of(baseTheme)` and `syntaxHighlighting(mdHighlight)` still work.

Smoke: cycle ⌘⇧1~4 themes → colors change. Type heading/bold/italic → highlight applies.

```bash
git add -- Sources/CoreEditor/src/styling/base-theme.ts \
           Sources/CoreEditor/src/styling/highlight.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract styling/base-theme + styling/highlight

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 21: Extract `bridge/diagnostics.ts`

Move error forwarding from `editor.html` (currently inline `<script>` at L280-295) into a TS module called from bundle init.

**Files:** `Sources/CoreEditor/src/bridge/diagnostics.ts`, index.ts, editor.html

- [ ] **Step 21.1: Implement**

Create `Sources/CoreEditor/src/bridge/diagnostics.ts`:

```typescript
import { postConsoleLog } from './outgoing';

export function installDiagnostics(): void {
  window.addEventListener('error', (e) => {
    try {
      postConsoleLog(
        `[error] ${e.message || '?'} @ ${e.filename || '?'}:${e.lineno || '?'}`,
      );
    } catch {
      /* noop */
    }
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    try {
      const reason: unknown = e.reason;
      const msg =
        reason && typeof reason === 'object' && 'message' in reason
          ? String((reason as { message: unknown }).message)
          : String(reason);
      postConsoleLog(`[unhandled] ${msg}`);
    } catch {
      /* noop */
    }
  });
}
```

- [ ] **Step 21.2: Export from index.ts**

Append:

```typescript
export { installDiagnostics } from './bridge/diagnostics';
```

- [ ] **Step 21.3: Remove inline script from editor.html, install from editor.js**

Edit `Sources/MarkdownEditor/Resources/editor.html`. Delete this block:

```html
<script>
  // 진단: 글 안 보이는 원인 추적 — 어떤 JS 에러든 즉시 Swift NSLog로 forward.
  window.addEventListener("error", function(e) {
    try {
      window.webkit?.messageHandlers?.consoleLog?.postMessage(
        "[error] " + (e.message || "?") + " @ " + (e.filename || "?") + ":" + (e.lineno || "?")
      );
    } catch (err) {}
  });
  window.addEventListener("unhandledrejection", function(e) {
    try {
      window.webkit?.messageHandlers?.consoleLog?.postMessage(
        "[unhandled] " + (e.reason && e.reason.message ? e.reason.message : String(e.reason))
      );
    } catch (err) {}
  });
</script>
```

(at editor.html L280-296)

Add `installDiagnostics` to editor.js destructuring. At the very top of editor.js (after destructuring), call:

```javascript
installDiagnostics();
```

- [ ] **Step 21.4: Build, smoke, commit**

Smoke: deliberately type something that triggers an error (e.g., wrong mermaid syntax) and check Xcode console / Swift logs for the forwarded message.

```bash
git add -- Sources/CoreEditor/src/bridge/diagnostics.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.html \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract bridge/diagnostics.ts

Move window error/rejection forwarding from editor.html inline script
to a TS module installed by editor.js.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 22: Extract `bridge/app-bridge.ts`

The whole `window.appBridge = { ... }` block. editor.js L1048-1134.

**Files:** `Sources/CoreEditor/src/bridge/app-bridge.ts`, index.ts, editor.js

- [ ] **Step 22.1: Implement**

Create `Sources/CoreEditor/src/bridge/app-bridge.ts`:

```typescript
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { closeSearchPanel, openSearchPanel } from '@codemirror/search';
import { docFolderEffect } from '../plugins/doc-folder';

export interface OutlineItem {
  level: number;
  text: string;
  lineIdx: number;
}

export interface AppBridge {
  setText(text: string): void;
  resetEditor(text: string): void;
  setTheme(vars: Record<string, string>): void;
  setFontFamily(family: string): void;
  setDocFolder(url: string): void;
  openSearch(): boolean;
  scrollToLine(lineIdx: number): boolean;
  insertImage(alt: string, path: string): boolean;
  getOutline(): OutlineItem[];
}

interface InstallOptions {
  /** Called to mutate the isApplyingExternal flag from outside; needed for setText round-trip protection. */
  setApplyingExternal: (v: boolean) => void;
  /** Recreate the EditorState with a fresh extension set (used by resetEditor). */
  buildState: (doc: string) => EditorState;
  /** Track last-applied-from-Swift text to suppress echo. */
  getLastAppliedText: () => string;
  setLastAppliedText: (text: string) => void;
}

/** Install window.appBridge for Swift to call. Returns the same bridge object. */
export function installAppBridge(view: EditorView, opts: InstallOptions): AppBridge {
  const bridge: AppBridge = {
    setText(text: string) {
      if (text === opts.getLastAppliedText()) return;
      opts.setApplyingExternal(true);
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
        opts.setLastAppliedText(text);
      } finally {
        setTimeout(() => opts.setApplyingExternal(false), 0);
      }
    },
    resetEditor(text: string) {
      opts.setApplyingExternal(true);
      try {
        view.setState(opts.buildState(text));
        opts.setLastAppliedText(text);
      } finally {
        setTimeout(() => opts.setApplyingExternal(false), 0);
      }
    },
    setTheme(vars: Record<string, string>) {
      Object.entries(vars).forEach(([k, v]) =>
        document.documentElement.style.setProperty('--' + k, v),
      );
    },
    setFontFamily(family: string) {
      document.documentElement.style.setProperty('--editor-font', family);
    },
    setDocFolder(url: string) {
      view.dispatch({ effects: docFolderEffect.of(url || '') });
    },
    openSearch() {
      const existing = view.dom.querySelector('.cm-search');
      if (existing) {
        closeSearchPanel(view);
      } else {
        openSearchPanel(view);
      }
      return true;
    },
    scrollToLine(lineIdx: number) {
      const lineNum = Math.max(1, Math.min(view.state.doc.lines, lineIdx + 1));
      const line = view.state.doc.line(lineNum);
      view.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
      });
      view.focus();
      return true;
    },
    insertImage(alt: string, path: string) {
      const sel = view.state.selection.main;
      const insertion = `![${alt}](${path})`;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: insertion },
        selection: { anchor: sel.from + insertion.length },
        scrollIntoView: true,
      });
      return true;
    },
    getOutline() {
      const tree = syntaxTree(view.state);
      const result: OutlineItem[] = [];
      const doc = view.state.doc;
      tree.iterate({
        enter: (node) => {
          const m = node.name.match(/^ATXHeading(\d)$/);
          if (!m) return;
          const level = parseInt(m[1] ?? '0', 10);
          const text = doc
            .sliceString(node.from, node.to)
            .replace(/^#+\s+/, '')
            .trim();
          const lineIdx = doc.lineAt(node.from).number - 1;
          result.push({ level, text, lineIdx });
        },
      });
      return result;
    },
  };
  (window as any).appBridge = bridge;
  return bridge;
}
```

- [ ] **Step 22.2: Export from index.ts**

Append:

```typescript
export { installAppBridge } from './bridge/app-bridge';
```

- [ ] **Step 22.3: Replace inline appBridge in editor.js**

Delete L1048-1134 from `editor.js`. Add `installAppBridge` to destructure.

After `view` is constructed (around L1041-1044), add:

```javascript
installAppBridge(view, {
  setApplyingExternal(v) { isApplyingExternal = v; },
  buildState(text) { return EditorState.create({ doc: text, extensions: makeExtensions() }); },
  getLastAppliedText() { return lastAppliedText; },
  setLastAppliedText(text) { lastAppliedText = text; },
});
```

- [ ] **Step 22.4: Build, smoke, commit**

Smoke: open notes via folder sidebar (calls resetEditor), switch themes (setTheme), search (⌘F → openSearch), outline updates (getOutline) — all behave as before.

```bash
git add -- Sources/CoreEditor/src/bridge/app-bridge.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.js \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "feat(coreeditor): extract bridge/app-bridge.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 23: Extract `extensions.ts` + `index.ts` boot — consolidate remaining editor.js into bundle

At this point `editor.js` should be small: the `keymap` + `makeExtensions()` + EditorView construction + `installAppBridge` call + the `installPasteImageHandler` + `installDiagnostics` call. Move all this into `index.ts` and create `extensions.ts` for the extension list.

**Files:** `Sources/CoreEditor/src/extensions.ts`, `Sources/CoreEditor/src/index.ts`, `Sources/MarkdownEditor/Resources/editor.html`, delete `Sources/MarkdownEditor/Resources/editor.js`

- [ ] **Step 23.1: Create `Sources/CoreEditor/src/extensions.ts`**

```typescript
import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';

import { baseTheme } from './styling/base-theme';
import { mdHighlight } from './styling/highlight';
import { lineKindGutter } from './plugins/line-kind-gutter';
import { statusBarPanel } from './plugins/status-bar';
import { imageField } from './nodes/image';
import { docFolderField } from './plugins/doc-folder';
import { mermaidActiveField, mermaidDecoField } from './nodes/mermaid';
import { listMarkPlugin } from './nodes/list-mark';
import { inlineCodePlugin } from './nodes/inline-code';
import { indentedCodeResetPlugin } from './nodes/indented-reset';
import { codeBlockLinePlugin } from './nodes/code-block';
import { tableLinePlugin } from './nodes/table';
import { taskLinePlugin } from './plugins/task-line';
import { imeListContinueFilter } from './commands/ime-list-continue';
import { wrapSelection } from './commands/wrap-selection';
import { insertLinkCmd } from './commands/insert-link';

export const themeCompartment = new Compartment();

export interface EditorUpdateHooks {
  onTextChanged(text: string): void;
  onCursorLineChanged(line0Based: number): void;
  shouldNotify(): boolean;  // returns false when applying external (Swift) update
}

export function makeExtensions(hooks: EditorUpdateHooks) {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    indentOnInput(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    indentUnit.of('\t'),
    EditorState.tabSize.of(4),
    syntaxHighlighting(mdHighlight),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    }),
    highlightActiveLine(),
    lineKindGutter,
    statusBarPanel,
    docFolderField,
    imageField,
    mermaidActiveField,
    mermaidDecoField,
    listMarkPlugin,
    inlineCodePlugin,
    indentedCodeResetPlugin,
    codeBlockLinePlugin,
    tableLinePlugin,
    taskLinePlugin,
    themeCompartment.of(baseTheme),
    imeListContinueFilter,
    keymap.of([
      { key: 'Mod-b', run: wrapSelection('**', '**') },
      { key: 'Mod-i', run: wrapSelection('*', '*') },
      { key: 'Mod-k', run: insertLinkCmd },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && hooks.shouldNotify()) {
        hooks.onTextChanged(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head;
        const line0 = update.state.doc.lineAt(head).number - 1;
        hooks.onCursorLineChanged(line0);
      }
    }),
  ];
}
```

- [ ] **Step 23.2: Replace `Sources/CoreEditor/src/index.ts` with full boot**

```typescript
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { makeExtensions, themeCompartment } from './extensions';
import { installAppBridge } from './bridge/app-bridge';
import { installPasteImageHandler } from './plugins/paste-image';
import { installDiagnostics } from './bridge/diagnostics';
import { postCursorLine, postTextChanged } from './bridge/outgoing';

export * from './cm-reexports';

// Re-export everything domain modules expose, so consumers/tests can import from a single root.
export { parseAltAndSize, imageSrcForRender } from './nodes/image-utils';
export { visitTree, collectNodes } from './utils/lezer-walk';
export { listMarkPlugin } from './nodes/list-mark';
export { inlineCodePlugin } from './nodes/inline-code';
export { indentedCodeResetPlugin } from './nodes/indented-reset';
export { codeBlockLinePlugin } from './nodes/code-block';
export { tableLinePlugin } from './nodes/table';
export { ImageWidget, imageField } from './nodes/image';
export { docFolderEffect, docFolderField } from './plugins/doc-folder';
export {
  toggleMermaidEffect,
  mermaidActiveField,
  mermaidDecoField,
} from './nodes/mermaid';
export { taskLinePlugin } from './plugins/task-line';
export { lineKindGutter } from './plugins/line-kind-gutter';
export { statusBarPanel } from './plugins/status-bar';
export { installPasteImageHandler } from './plugins/paste-image';
export { wrapSelection } from './commands/wrap-selection';
export { insertLinkCmd } from './commands/insert-link';
export { handleEnter } from './commands/list-continue';
export {
  imeListContinueFilter,
  listPrefixFor,
  extractNewlineInsertion,
} from './commands/ime-list-continue';
export { baseTheme } from './styling/base-theme';
export { mdHighlight } from './styling/highlight';
export {
  postTextChanged,
  postCursorLine,
  postConsoleLog,
  postImageDropped,
} from './bridge/outgoing';
export { installAppBridge } from './bridge/app-bridge';
export { installDiagnostics } from './bridge/diagnostics';

/** Boot the editor. Mounts CodeMirror into the given host element and wires
 *  bridges. Returns nothing (consumers interact via window.appBridge). */
export function bootEditor(host: HTMLElement): EditorView {
  installDiagnostics();

  let isApplyingExternal = false;
  let lastAppliedText = '';

  function buildState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: makeExtensions({
        onTextChanged(text: string) {
          lastAppliedText = text;
          postTextChanged(text);
        },
        onCursorLineChanged(line0: number) {
          postCursorLine(line0);
        },
        shouldNotify() {
          return !isApplyingExternal;
        },
      }),
    });
  }

  const view = new EditorView({
    parent: host,
    state: buildState(''),
  });

  installAppBridge(view, {
    setApplyingExternal(v) {
      isApplyingExternal = v;
    },
    buildState,
    getLastAppliedText() {
      return lastAppliedText;
    },
    setLastAppliedText(text) {
      lastAppliedText = text;
    },
  });

  installPasteImageHandler(view);

  return view;
}
```

- [ ] **Step 23.3: Update `Sources/MarkdownEditor/Resources/editor.html`**

Replace the final `<script src="editor.js"></script>` line with an inline boot call. The HTML's tail should look like:

```html
<script src="cm.bundle.js"></script>
<script src="vendor/mermaid.min.js"></script>
<script>
  try {
    if (window.mermaid && typeof window.mermaid.initialize === "function") {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "default" });
      window.webkit?.messageHandlers?.consoleLog?.postMessage("[init] mermaid loaded version=" + (window.mermaid.version || "?"));
    } else {
      window.webkit?.messageHandlers?.consoleLog?.postMessage("[init] mermaid global NOT FOUND");
    }
  } catch (e) {
    window.webkit?.messageHandlers?.consoleLog?.postMessage("[init] mermaid init error: " + e.message);
  }
</script>
<script>
  CM.bootEditor(document.getElementById("editor-host"));
</script>
</body>
</html>
```

- [ ] **Step 23.4: Delete `editor.js`**

Run: `rm Sources/MarkdownEditor/Resources/editor.js`

- [ ] **Step 23.5: Build, full smoke test, commit**

Run: `npm run build && npm run typecheck && npm test && ./build.sh debug && open "build/Markdown Note.app"`
Expected: all checks pass, app launches.

**Full smoke checklist** (verify each):

- [ ] Type heading `# H1` → renders large
- [ ] Type `**bold**` → bold inline
- [ ] Type `*italic*` → italic inline
- [ ] Type backtick `` `code` `` → background + caret enters inline code box
- [ ] Type list `- item` then Enter → continues with `- `
- [ ] Type `1. one` then Enter → continues `2. `
- [ ] Type checkbox `- [ ] todo` then Enter → continues `- [ ] `
- [ ] Drag an image file into editor → image renders + path inserted
- [ ] Paste a screenshot → image saves to attachments/ and renders
- [ ] Type ```mermaid block and content → toggle button appears, click → SVG renders
- [ ] Switch theme via ⌘⇧1~4 → colors change
- [ ] Search ⌘F → panel opens
- [ ] Folder sidebar new note ⌘N → file appears, open it
- [ ] Multi-tab ⌘T → new tab opens
- [ ] Status bar shows Ln/Col/words/lines, tasks count when checkboxes present
- [ ] Left gutter shows h1/•/│/☐ etc per line kind
- [ ] Korean IME on a bullet line + Enter → continues list correctly (no doubled `\n`)
- [ ] Presentation mode ⌘⇧P → preserves current main state (no NEW regressions vs main; pre-existing instability is acceptable)

If any item regresses, debug before commit.

```bash
git add -- Sources/CoreEditor/src/extensions.ts \
           Sources/CoreEditor/src/index.ts \
           Sources/MarkdownEditor/Resources/editor.html \
           Sources/MarkdownEditor/Resources/cm.bundle.js
git rm Sources/MarkdownEditor/Resources/editor.js
git commit -m "$(cat <<'EOF'
feat(coreeditor): consolidate boot into src/index.ts, delete editor.js

- New src/extensions.ts with makeExtensions(hooks)
- src/index.ts exposes bootEditor() called from editor.html
- editor.js deleted; editor.html calls CM.bootEditor() directly
- All editor logic now lives under Sources/CoreEditor/src/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: Verify coverage gates + mutation testing

After all extractions, run the coverage and mutation gates.

- [ ] **Step 24.1: Run coverage**

Run: `npm run test:cov`
Expected: jest output table. Verify these files hit ≥80% lines, ≥80% statements, ≥75% branches, ≥80% functions:
- `Sources/CoreEditor/src/utils/lezer-walk.ts`
- `Sources/CoreEditor/src/nodes/image-utils.ts`
- `Sources/CoreEditor/src/commands/wrap-selection.ts`
- `Sources/CoreEditor/src/commands/insert-link.ts`
- `Sources/CoreEditor/src/commands/list-continue.ts`
- `Sources/CoreEditor/src/commands/ime-list-continue.ts`

If any file is below threshold, add tests until it passes, commit "test(coreeditor): increase coverage of <file>".

Note: `plugins/doc-folder.ts` is in the coverage config but has only declarative `StateEffect` and `StateField` — no executable logic. It will register as 100% with one trivial test. Add:

Create `Sources/CoreEditor/test/plugins/doc-folder.test.ts`:

```typescript
import { EditorState } from '@codemirror/state';
import { docFolderEffect, docFolderField } from '../../src/plugins/doc-folder';

describe('docFolderField', () => {
  it('starts empty', () => {
    const state = EditorState.create({ extensions: [docFolderField] });
    expect(state.field(docFolderField)).toBe('');
  });

  it('updates when docFolderEffect dispatched', () => {
    let state = EditorState.create({ extensions: [docFolderField] });
    state = state.update({ effects: docFolderEffect.of('file:///docs/') }).state;
    expect(state.field(docFolderField)).toBe('file:///docs/');
  });

  it('clears when given empty string', () => {
    let state = EditorState.create({ extensions: [docFolderField] });
    state = state.update({ effects: docFolderEffect.of('file:///a/') }).state;
    state = state.update({ effects: docFolderEffect.of('') }).state;
    expect(state.field(docFolderField)).toBe('');
  });
});
```

- [ ] **Step 24.2: Run Stryker mutation testing**

Run: `npm run test:mutate`
Expected: mutation score ≥ 80% for all files listed in stryker.conf.json `mutate` patterns.

If a file is below 80%, look at surviving mutants — usually means tests pass for wrong reasons. Add specific tests for each surviving mutant.

- [ ] **Step 24.3: If everything green, commit any added tests**

```bash
git add Sources/CoreEditor/test/
git commit -m "test(coreeditor): meet 80% line + 80% mutation coverage gates

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 25: Final verification + branch summary

- [ ] **Step 25.1: Full pipeline**

```bash
npm run typecheck
npm run test
npm run test:cov
npm run test:mutate
./build.sh release
open "build/Markdown Note.app"
```

All commands succeed. App runs from release build. Re-run the full smoke checklist from Task 23.5.

- [ ] **Step 25.2: Verify cm.bundle.js size**

Run: `wc -c Sources/MarkdownEditor/Resources/cm.bundle.js`
Expected: within ±10% of the pre-migration size (was ~1.5 MB).

If significantly larger: investigate; probably an accidentally-added export.

- [ ] **Step 25.3: Check tree is clean**

Run: `git status`
Expected: clean working tree. No stray files.

- [ ] **Step 25.4: Print branch summary**

Run:
```bash
git log main..feature/coreeditor-ts-migration --oneline
git diff main..feature/coreeditor-ts-migration --stat
```

Verify scope: all changes in `Sources/CoreEditor/`, `Sources/MarkdownEditor/Resources/{editor.html,cm.bundle.js}`, root config files. Swift files untouched. `MarkEdit-1.32.1/` not present.

- [ ] **Step 25.5: Push branch and hand to user for merge**

```bash
git push -u origin feature/coreeditor-ts-migration
```

Report to user: branch pushed, smoke pass, coverage gates pass, mutation gates pass. Awaiting user merge to main.

---

## Verification & Rollback

**Per-task verification:** each task ends with `npm run build && ./build.sh debug && open .app` + manual smoke of the specific feature. Catch regressions before next task.

**Mid-migration rollback:** if a task introduces a regression that can't be debugged in <30 min, `git reset --hard HEAD~1` reverts that task without disturbing earlier extractions.

**Pre-merge rollback:** if final smoke fails on the integrated bundle, the migration branch can be abandoned without touching main.

---

## Out of scope (re-stated from spec)

This plan does **NOT**:

- Add new editor features
- Introduce MarkEdit's `matchers/lezer.ts` pattern (Phase 3 spec)
- Modify any Swift code
- Add a CI workflow
- Restore the presentation mode
- Switch to Vite

---

## Spec coverage self-check

| Spec section | Plan task(s) |
|---|---|
| §3 esbuild + TS | Task 1 |
| §3 Strangler-fig, single branch | All tasks commit incrementally on one branch |
| §3 Stryker | Task 1 + Task 24 |
| §4 Directory structure | Tasks 1, 9, 10 (each create subdirs) |
| §5 editor.js → src mapping | Tasks 2-23 (each task moves one section) |
| §6.1 build script update | Task 1.10 |
| §6.2 bundle output equivalence | Task 25.2 |
| §7.1 incoming bridge (appBridge) | Task 22 |
| §7.2 outgoing bridge (no direct webkit calls) | Task 18 |
| §7.3 Mermaid as vendor | Task 10 (no change to vendor handling) |
| §8.1 80% line / 80% mutation gate | Task 24 |
| §8.2 domain definition | Reflected in jest.config + stryker.conf in Task 1 |
| §8.3 jest + happy-dom + ts-jest | Task 1.4 |
| §9 migration order | Tasks 1-23 in order |
| §10 DoD smoke checklist | Task 23.5 |
| §11 risks | Per-task verification + Task 25 rollback note |
