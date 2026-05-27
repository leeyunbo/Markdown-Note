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
