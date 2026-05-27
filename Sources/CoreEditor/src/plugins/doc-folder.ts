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
