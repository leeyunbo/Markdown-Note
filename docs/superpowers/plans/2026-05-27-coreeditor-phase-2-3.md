# CoreEditor Phase 2 + 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Phase 2 (IME bug fix + 80% mutation gate) and Phase 3 (MarkEdit matcher-pattern adoption) on the same `feature/coreeditor-ts-migration` branch. Final state: merge to main.

**Architecture:** Apply two patterns that MarkEdit uses to keep its decoration code small and safe:
1. **Matcher abstraction** (`utils/matchers/lezer.ts`) — a single ViewPlugin runs an array of `NodeMatcher`s. Each matcher is `{ match: nodeName, decorate(node) → decorations[] }`. Replaces the 6 hand-written `ViewPlugin.fromClass` blocks under `nodes/`.
2. **Tag class table** (`styling/markdown-tags.ts`) — lezer `tags.strong → 'cm-md-bold'` etc. Single source for "which CSS class for which markdown element".

**Tech Stack:** TypeScript 5+, esbuild, Jest, Stryker (existing setup unchanged).

**Branch:** `feature/coreeditor-ts-migration` (same as Phase 1).

---

## File Plan (delta from current state)

```
Sources/CoreEditor/src/
  styling/
    markdown-tags.ts                 — NEW. tag → CSS class table
  utils/
    matchers/
      lezer.ts                       — NEW. NodeMatcher + nodeMatcherPlugin
  nodes/
    list-mark.ts                     — REWRITTEN as NodeMatcher (was ViewPlugin)
    inline-code.ts                   — REWRITTEN as NodeMatcher
    indented-reset.ts                — REWRITTEN as NodeMatcher
    code-block.ts                    — REWRITTEN as NodeMatcher
    table.ts                         — KEEP as ViewPlugin (doesn't use lezer)
    image.ts                         — KEEP as StateField (block decoration, not iterable)
    mermaid.ts                       — KEEP as StateField (same reason)
  commands/
    ime-list-continue.ts             — IME fix: clamp range to current doc length
  extensions.ts                      — Replace 4 individual plugins with one matcherPlugin

Sources/CoreEditor/test/
  commands/ime-list-continue.test.ts — Add boundary test for empty-list-clear branch
  utils/matchers/lezer.test.ts       — Tests for matcher infrastructure
  nodes/list-mark-matcher.test.ts    — etc., add tests covering matcher conversions
```

---

## Decisions

| Item | Decision |
|---|---|
| IME fix approach | Clamp the change range to `tr.state.doc.length` (not pre-transaction). The empty-list-clear branch operates on post-transaction state. |
| Matcher pattern scope | Convert nodes that iterate the lezer tree with simple per-node Decoration emit. Leave block-decoration StateFields (image, mermaid) untouched — different lifecycle. |
| `markdown-tags.ts` integration | Replace inline lezer tag→class entries in `mdHighlight` with a single import. Cosmetic — same output. |
| Main merge | `--no-ff` to preserve the migration as a single squashable history block. |
| Coverage gate | Restore Stryker `break: 80` after IME fix lands (IME fix removes 8 NoCoverage mutants → expected jump to ~82%). |

---

## Task 1: Fix IME filter empty-list-clear range bug + add boundary test

**Files:** `Sources/CoreEditor/src/commands/ime-list-continue.ts`, `Sources/CoreEditor/test/commands/ime-list-continue.test.ts`

The bug: in `imeListContinueFilter`, the empty-list-clear branch returns
```ts
{ changes: { from: beforeLine.from, to: newlineAt + 1, insert: '' }, ... }
```
`tr.state` is post-transaction, so `newlineAt + 1 > pre-transaction doc length` → `RangeError` when applied. Replace with `Math.min(newlineAt + 1, tr.state.doc.length)`.

- [ ] **Step 1.1: Add failing test for the empty-list-clear branch**

In `Sources/CoreEditor/test/commands/ime-list-continue.test.ts`, append:

```typescript
import { EditorState, EditorSelection } from '@codemirror/state';
import { imeListContinueFilter } from '../../src/commands/ime-list-continue';

describe('imeListContinueFilter — empty list marker clear', () => {
  function applyEnter(initialDoc: string, cursorPos: number) {
    const state = EditorState.create({
      doc: initialDoc,
      selection: EditorSelection.cursor(cursorPos),
      extensions: [imeListContinueFilter],
    });
    return state.update({
      changes: { from: cursorPos, to: cursorPos, insert: '\n' },
      selection: EditorSelection.cursor(cursorPos + 1),
    });
  }

  it('clears an empty bullet marker on Enter without error', () => {
    expect(() => applyEnter('- ', 2)).not.toThrow();
    const tr = applyEnter('- ', 2);
    expect(tr.newDoc.toString()).toBe('');
  });

  it('clears an empty numbered marker on Enter without error', () => {
    expect(() => applyEnter('1. ', 3)).not.toThrow();
    const tr = applyEnter('1. ', 3);
    expect(tr.newDoc.toString()).toBe('');
  });

  it('clears an empty checkbox marker on Enter without error', () => {
    expect(() => applyEnter('- [ ] ', 6)).not.toThrow();
    const tr = applyEnter('- [ ] ', 6);
    expect(tr.newDoc.toString()).toBe('');
  });
});
```

- [ ] **Step 1.2: Run tests — verify FAIL with RangeError or wrong output**

`npm test -- ime-list-continue` — expect new tests fail.

- [ ] **Step 1.3: Fix the production code**

In `Sources/CoreEditor/src/commands/ime-list-continue.ts`, find:

```typescript
  if (contentAfter === '' && newlineAt === beforeLine.to) {
    return [
      {
        changes: { from: beforeLine.from, to: newlineAt + 1, insert: '' },
        selection: { anchor: beforeLine.from },
      },
    ];
  }
```

Replace with:

```typescript
  if (contentAfter === '' && newlineAt === beforeLine.to) {
    const clearTo = Math.min(newlineAt + 1, tr.state.doc.length);
    return [
      {
        changes: { from: beforeLine.from, to: clearTo, insert: '' },
        selection: { anchor: beforeLine.from },
      },
    ];
  }
```

- [ ] **Step 1.4: Run tests — verify PASS**

`npm test` — all 90+3 = 93 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add Sources/CoreEditor/src/commands/ime-list-continue.ts \
        Sources/CoreEditor/test/commands/ime-list-continue.test.ts \
        Sources/MarkdownEditor/Resources/cm.bundle.js
npm run build
git add Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "$(cat <<'EOF'
fix(coreeditor): clamp empty-list-clear range to current doc length

imeListContinueFilter's empty-list-clear branch returned
{ from: beforeLine.from, to: newlineAt + 1 } but newlineAt + 1 can
exceed the pre-transaction doc length (the inserted \n was counted
against tr.state, the post-transaction state). Clamp to
tr.state.doc.length to keep the range valid.

Pre-existing bug surfaced by Stryker mutation analysis. Adds three
boundary tests covering bullet / numbered / checkbox empty-marker
clear paths through the full transaction filter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Restore Stryker break:80 and verify

After Task 1, the 8 NoCoverage mutants in the IME filter are now covered. Expected new score: ~82%.

- [ ] **Step 2.1: Run mutation testing**

`npm run test:mutate` (≈30s). Capture overall score.

- [ ] **Step 2.2: If overall ≥ 80%, tighten Stryker threshold**

Edit `stryker.conf.json`:
```json
  "thresholds": { "high": 90, "low": 70, "break": 80 },
```

If still under 80%, identify remaining surviving mutants and add killing tests. Iterate up to 3x.

- [ ] **Step 2.3: Commit**

```bash
git add stryker.conf.json
git commit -m "$(cat <<'EOF'
chore(coreeditor): restore Stryker break threshold to 80%

IME bug fix in prior commit kills the 8 NoCoverage mutants in
imeListContinueFilter's empty-list-clear branch. Overall score now
above 80%; restore the spec target.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `styling/markdown-tags.ts` (lezer tag → CSS class table)

**Files:** `Sources/CoreEditor/src/styling/markdown-tags.ts` (new), `Sources/CoreEditor/src/styling/highlight.ts` (refactor)

`mdHighlight` currently has the lezer tag → CSS class mapping inlined in HighlightStyle.define. Extract into a `tagClasses` table.

- [ ] **Step 3.1: Create `Sources/CoreEditor/src/styling/markdown-tags.ts`**

```typescript
import { tags } from '@lezer/highlight';

/** Lezer tag → CSS class assignments for markdown rendering.
 *  Single source of truth — consumed by mdHighlight and any future
 *  per-node decoration code that wants to reference the same classes. */
export const markdownTagClasses = [
  { tag: tags.heading1, class: 'cm-md-header cm-md-heading1' },
  { tag: tags.heading2, class: 'cm-md-header cm-md-heading2' },
  { tag: tags.heading3, class: 'cm-md-header cm-md-heading3' },
  { tag: tags.heading4, class: 'cm-md-header cm-md-heading4' },
  { tag: tags.heading5, class: 'cm-md-header cm-md-heading5' },
  { tag: tags.heading6, class: 'cm-md-header cm-md-heading6' },
  { tag: tags.strong, class: 'cm-md-bold' },
  { tag: tags.emphasis, class: 'cm-md-italic' },
  { tag: tags.strikethrough, class: 'cm-md-strikethrough' },
  { tag: tags.link, class: 'cm-md-link' },
  { tag: tags.url, class: 'cm-md-url' },
  { tag: tags.monospace, class: 'cm-md-mono' },
  { tag: tags.processingInstruction, class: 'cm-md-marker' },
  { tag: tags.contentSeparator, class: 'cm-md-hr' },
  { tag: tags.quote, class: 'cm-md-quote' },
  { tag: tags.meta, class: 'cm-md-meta' },
] as const;
```

- [ ] **Step 3.2: Refactor `Sources/CoreEditor/src/styling/highlight.ts` to consume the table**

Read current highlight.ts (the existing `HighlightStyle.define([...])`). The current array has color rules; we keep those AND add class assignments via the new table.

Replace with:

```typescript
import { HighlightStyle } from '@codemirror/language';
import { markdownTagClasses } from './markdown-tags';

// Existing color rules — keep verbatim from prior version
// (paste the original array entries here, but reference markdownTagClasses
// for class assignments where they overlap)
export const mdHighlight = HighlightStyle.define([
  // ... existing color/style entries from the prior version
  ...markdownTagClasses,
]);
```

NOTE: read the actual current `highlight.ts` content first; merge the existing color rules with the new class entries without removing any visual styling. If a tag already had inline class assignment, prefer the new table entry (consistent source).

- [ ] **Step 3.3: Export markdownTagClasses from index.ts**

Append `export { markdownTagClasses } from './styling/markdown-tags';`

- [ ] **Step 3.4: Build, typecheck, test, smoke**

```bash
npm run build
npm run typecheck
npm test
./build.sh debug
```

Smoke: open .app, verify headings/bold/italic/etc all still render the same.

- [ ] **Step 3.5: Commit**

```bash
git add Sources/CoreEditor/src/styling/markdown-tags.ts \
        Sources/CoreEditor/src/styling/highlight.ts \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "$(cat <<'EOF'
feat(coreeditor): introduce styling/markdown-tags.ts

Single source of truth for lezer tag → CSS class assignments
(MarkEdit pattern). highlight.ts now imports the table instead of
inlining. No visual change — same classes attached to same tags.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `utils/matchers/lezer.ts` matcher infrastructure

**Files:** `Sources/CoreEditor/src/utils/matchers/lezer.ts` (new), `Sources/CoreEditor/test/utils/matchers/lezer.test.ts` (new)

- [ ] **Step 4.1: Write failing test**

Create `Sources/CoreEditor/test/utils/matchers/lezer.test.ts`:

```typescript
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Decoration, EditorView } from '@codemirror/view';
import { nodeMatcher, runMatchers } from '../../../src/utils/matchers/lezer';

function makeState(doc: string) {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
}

describe('nodeMatcher + runMatchers', () => {
  it('runs a single matcher and returns its decorations', () => {
    const matcher = nodeMatcher('InlineCode', (node) => [
      Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
    ]);
    const state = makeState('text `code` more');
    const decos = runMatchers(state, [matcher]);
    const ranges = decos.size;
    expect(ranges).toBe(1);
  });

  it('runs multiple matchers in one pass', () => {
    const inline = nodeMatcher('InlineCode', (node) => [
      Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
    ]);
    const heading = nodeMatcher('ATXHeading1', (node) => [
      Decoration.line({ class: 'cm-md-h1' }).range(state.doc.lineAt(node.from).from),
    ]);
    const state = makeState('# H\n\nbody with `code`');
    const decos = runMatchers(state, [inline, heading]);
    expect(decos.size).toBe(2);
  });

  it('returns empty set when no nodes match', () => {
    const matcher = nodeMatcher('InlineCode', (node) => [
      Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
    ]);
    const state = makeState('plain text only');
    const decos = runMatchers(state, [matcher]);
    expect(decos.size).toBe(0);
  });

  it('respects optional viewport range', () => {
    const matcher = nodeMatcher('ATXHeading1', (node) => [
      Decoration.line({ class: 'cm-h1' }).range(node.from),
    ]);
    const state = makeState('# a\n\n# b\n\n# c');
    const all = runMatchers(state, [matcher]);
    expect(all.size).toBe(3);
    const partial = runMatchers(state, [matcher], { from: 0, to: 3 });
    expect(partial.size).toBe(1);
  });
});
```

- [ ] **Step 4.2: Run — verify fail (module not found)**

- [ ] **Step 4.3: Implement `Sources/CoreEditor/src/utils/matchers/lezer.ts`**

```typescript
import { EditorState, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';

export type NodeDecorator = (
  node: SyntaxNodeRef,
  state: EditorState,
) => Range<Decoration>[];

export interface NodeMatcher {
  /** Lezer node name (e.g. 'InlineCode', 'FencedCode'). */
  name: string;
  /** Produce decorations for each matched node. */
  decorate: NodeDecorator;
}

/** Construct a NodeMatcher. */
export function nodeMatcher(name: string, decorate: NodeDecorator): NodeMatcher {
  return { name, decorate };
}

/** Run all matchers against the state's syntax tree, returning a DecorationSet.
 *  Optional viewport range limits iteration. */
export function runMatchers(
  state: EditorState,
  matchers: NodeMatcher[],
  range?: { from: number; to: number },
): DecorationSet {
  const builder: Range<Decoration>[] = [];
  const byName = new Map<string, NodeDecorator[]>();
  for (const m of matchers) {
    const list = byName.get(m.name) ?? [];
    list.push(m.decorate);
    byName.set(m.name, list);
  }

  const tree = syntaxTree(state);
  tree.iterate({
    from: range?.from,
    to: range?.to,
    enter(node) {
      const decorators = byName.get(node.name);
      if (!decorators) return;
      for (const d of decorators) {
        for (const r of d(node, state)) builder.push(r);
      }
    },
  });
  return Decoration.set(builder, true);
}

/** ViewPlugin that runs the given matchers across visible ranges and
 *  re-runs on doc/viewport changes. Use this for any plugin whose
 *  decorations are derived purely from lezer tree nodes. */
export function matcherViewPlugin(matchers: NodeMatcher[]) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const builder: Range<Decoration>[] = [];
        for (const { from, to } of view.visibleRanges) {
          const partial = runMatchers(view.state, matchers, { from, to });
          partial.between(from, to, (f, t, value) => {
            builder.push(value.range(f, t));
            return undefined;
          });
        }
        return Decoration.set(builder, true);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
```

- [ ] **Step 4.4: Run — verify PASS**

`npm test -- matchers/lezer` — 4 tests pass.

- [ ] **Step 4.5: Export from index.ts**

Append:
```typescript
export { nodeMatcher, runMatchers, matcherViewPlugin } from './utils/matchers/lezer';
export type { NodeMatcher, NodeDecorator } from './utils/matchers/lezer';
```

- [ ] **Step 4.6: Build, typecheck, commit**

```bash
npm run build && npm run typecheck && npm test
git add Sources/CoreEditor/src/utils/matchers/ \
        Sources/CoreEditor/test/utils/matchers/ \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "$(cat <<'EOF'
feat(coreeditor): add utils/matchers/lezer.ts NodeMatcher pattern

MarkEdit-style abstraction. NodeMatcher = { name, decorate }; one
matcherViewPlugin runs a list of matchers and rebuilds on doc/viewport
change. Lets per-node decoration code be a 5-line declaration instead
of a 25-line ViewPlugin.fromClass boilerplate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Convert 5 node modules to NodeMatcher pattern

**Files:** rewrite each of:
- `Sources/CoreEditor/src/nodes/list-mark.ts`
- `Sources/CoreEditor/src/nodes/inline-code.ts`
- `Sources/CoreEditor/src/nodes/indented-reset.ts`
- `Sources/CoreEditor/src/nodes/code-block.ts`

Plus `extensions.ts` to wire them as one `matcherViewPlugin([...])` instead of 4 separate plugins.

`nodes/table.ts` stays — it doesn't use lezer iteration (operates on doc lines via regex). Skip.

### Step 5.1: Rewrite `Sources/CoreEditor/src/nodes/list-mark.ts`

```typescript
import { Decoration, Range } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { nodeMatcher } from '../utils/matchers/lezer';

function depthOf(node: SyntaxNodeRef): number {
  let depth = 0;
  let p = node.node.parent;
  while (p) {
    if (p.name === 'BulletList' || p.name === 'OrderedList') depth++;
    p = p.parent;
  }
  return Math.min(Math.max(depth - 1, 0), 4);
}

export const listMarkMatcher = nodeMatcher('ListMark', (node) => [
  Decoration.mark({
    class: `md-list-mark md-list-depth-${depthOf(node)}`,
  }).range(node.from, node.to),
]);
```

### Step 5.2: Rewrite `Sources/CoreEditor/src/nodes/inline-code.ts`

```typescript
import { Decoration } from '@codemirror/view';
import { nodeMatcher } from '../utils/matchers/lezer';

export const inlineCodeMatcher = nodeMatcher('InlineCode', (node) => [
  Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
]);
```

### Step 5.3: Rewrite `Sources/CoreEditor/src/nodes/indented-reset.ts`

```typescript
import { Decoration, Range } from '@codemirror/view';
import { nodeMatcher, NodeMatcher } from '../utils/matchers/lezer';

const linesFor: (name: string) => NodeMatcher = (name) =>
  nodeMatcher(name, (node, state) => {
    const decos: Range<Decoration>[] = [];
    const doc = state.doc;
    const startLine = doc.lineAt(node.from).number;
    const endLine = doc.lineAt(node.to).number;
    for (let n = startLine; n <= endLine; n++) {
      const line = doc.line(n);
      decos.push(Decoration.line({ class: 'cm-indented-reset' }).range(line.from));
    }
    return decos;
  });

/** lang-markdown classifies indented or fenced code blocks as CodeText, applying
 *  monospace highlighting. For "user indented but not code" lines this leaks the
 *  mono font into normal text. Apply cm-indented-reset to force body font back. */
export const indentedResetMatchers: NodeMatcher[] = [linesFor('CodeBlock'), linesFor('IndentedCode')];
```

### Step 5.4: Rewrite `Sources/CoreEditor/src/nodes/code-block.ts`

```typescript
import { Decoration, Range } from '@codemirror/view';
import { nodeMatcher } from '../utils/matchers/lezer';

export const codeBlockMatcher = nodeMatcher('FencedCode', (node, state) => {
  const decos: Range<Decoration>[] = [];
  const doc = state.doc;
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;
  for (let n = startLine; n <= endLine; n++) {
    const line = doc.line(n);
    const classes = ['cm-codeblock-line'];
    if (n === startLine) classes.push('cm-codeblock-first');
    if (n === endLine) classes.push('cm-codeblock-last');
    decos.push(Decoration.line({ class: classes.join(' ') }).range(line.from));
  }
  return decos;
});
```

### Step 5.5: Update `Sources/CoreEditor/src/extensions.ts`

Replace these four imports + array entries:

```typescript
import { listMarkPlugin } from './nodes/list-mark';
import { inlineCodePlugin } from './nodes/inline-code';
import { indentedCodeResetPlugin } from './nodes/indented-reset';
import { codeBlockLinePlugin } from './nodes/code-block';
// ... in returned array:
    listMarkPlugin,
    inlineCodePlugin,
    indentedCodeResetPlugin,
    codeBlockLinePlugin,
```

With:

```typescript
import { listMarkMatcher } from './nodes/list-mark';
import { inlineCodeMatcher } from './nodes/inline-code';
import { indentedResetMatchers } from './nodes/indented-reset';
import { codeBlockMatcher } from './nodes/code-block';
import { matcherViewPlugin } from './utils/matchers/lezer';
// ... in returned array, replace the four lines with:
    matcherViewPlugin([
      listMarkMatcher,
      inlineCodeMatcher,
      ...indentedResetMatchers,
      codeBlockMatcher,
    ]),
```

### Step 5.6: Update `Sources/CoreEditor/src/index.ts`

Replace the four old exports:
```typescript
export { listMarkPlugin } from './nodes/list-mark';
export { inlineCodePlugin } from './nodes/inline-code';
export { indentedCodeResetPlugin } from './nodes/indented-reset';
export { codeBlockLinePlugin } from './nodes/code-block';
```

With:
```typescript
export { listMarkMatcher } from './nodes/list-mark';
export { inlineCodeMatcher } from './nodes/inline-code';
export { indentedResetMatchers } from './nodes/indented-reset';
export { codeBlockMatcher } from './nodes/code-block';
```

### Step 5.7: Build, typecheck, test

```bash
npm run build
npm run typecheck
npm test           # all existing tests pass
./build.sh debug
```

Smoke: open .app, verify:
- nested lists render with depth-colored markers (md-list-depth-0..4)
- `` `inline code` `` highlight
- fenced ```code block with rounded corners + gray bg
- indented code with body font (not mono leak)

### Step 5.8: Commit

```bash
git add Sources/CoreEditor/src/nodes/list-mark.ts \
        Sources/CoreEditor/src/nodes/inline-code.ts \
        Sources/CoreEditor/src/nodes/indented-reset.ts \
        Sources/CoreEditor/src/nodes/code-block.ts \
        Sources/CoreEditor/src/extensions.ts \
        Sources/CoreEditor/src/index.ts \
        Sources/MarkdownEditor/Resources/cm.bundle.js
git commit -m "$(cat <<'EOF'
refactor(coreeditor): convert 4 nodes to NodeMatcher pattern

list-mark / inline-code / indented-reset / code-block now declare
themselves as matchers (5-line declarations). extensions.ts replaces
4 ViewPlugin entries with one matcherViewPlugin running all matchers
in a single tree pass — fewer plugin instances, fewer iterate() calls,
clearer per-node code.

table.ts (regex-based) and image.ts / mermaid.ts (block decorations
via StateField) keep their original shape — different lifecycle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification + merge to main

- [ ] **Step 6.1: Full pipeline**

```bash
npm run typecheck
npm test
npm run test:cov
npm run test:mutate       # ≥80% with restored break threshold
npm run build
./build.sh release
```

All must pass.

- [ ] **Step 6.2: Smoke test (user manual)**

`open "build/Markdown Note.app"` — full feature pass. Run through the smoke checklist:
- headings, bold, italic, inline code, list continuation, IME list continuation
- image drag-drop, paste image, mermaid toggle
- theme cycle, search, folder sidebar, tabs
- selection layer click-to-deselect (the prior fix)

If any regression, debug + fix before merge.

- [ ] **Step 6.3: Merge to main (--no-ff)**

```bash
git checkout main
git pull origin main      # sanity check no upstream changes
git merge --no-ff feature/coreeditor-ts-migration -m "$(cat <<'EOF'
Merge branch 'feature/coreeditor-ts-migration'

Phase 1: editor.js (1167 lines vanilla JS) → 26 TS modules under
Sources/CoreEditor/src/ with 90+ unit tests.
Phase 2: IME filter empty-list-clear range bug fix; Stryker break
threshold restored to 80%.
Phase 3: NodeMatcher pattern (utils/matchers/lezer.ts) replaces 4
per-node ViewPlugin boilerplates. markdown-tags.ts as single source
for lezer tag → CSS class mappings.

Coverage gates: line ≥80%, mutation ≥80%. cm.bundle.js size within
2% of pre-migration.
EOF
)"
git push origin main
```

- [ ] **Step 6.4: Cleanup local branch (optional)**

```bash
git branch -d feature/coreeditor-ts-migration
git push origin --delete feature/coreeditor-ts-migration  # only if user agrees
```

(Skip the remote delete unless user confirms — branch may be useful as PR reference.)

- [ ] **Step 6.5: Report final state**

- Total commits merged into main
- Final coverage / mutation numbers
- Smoke checklist outcome
- Any concerns

---

## Out of scope

- New editor features (frontMatter, completion, snippets, MarkEdit-api extension layer)
- Swift code changes
- CI workflow setup
- Presentation mode restoration

These are tracked for future spec cycles.
