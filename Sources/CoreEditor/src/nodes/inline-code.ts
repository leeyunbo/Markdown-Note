import { Decoration } from '@codemirror/view';
import { nodeMatcher } from '../utils/matchers/lezer';

export const inlineCodeMatcher = nodeMatcher('InlineCode', (node) => [
  Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to),
]);
