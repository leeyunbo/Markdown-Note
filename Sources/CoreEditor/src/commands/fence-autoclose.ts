import { EditorView } from '@codemirror/view';

/** Notion-style fence auto-close.
 *
 *  사용자가 `\`\`\`lang` (또는 `\`\`\``)을 입력하고 enter를 누르면 자동으로 닫는
 *  fence를 박고 커서를 그 사이 빈 줄로 옮겨 즉시 코드 작성을 시작할 수 있게 한다.
 *
 *  before:
 *    ```ts|       ← 커서가 line 끝
 *
 *  after enter:
 *    ```ts
 *    |           ← 커서가 빈 line
 *    ```
 *
 *  조건:
 *    - selection이 비어있고 line의 끝에 있다.
 *    - line이 정확히 `\`\`\`...` 또는 `~~~...` (뒤에 lang 식별자만 허용).
 *    - 이 line 앞에 짝수 개의 fence line이 있어야 한다(홀수면 이미 코드블록
 *      안이라 사용자가 닫는 fence를 타이핑 중일 수 있음 — 그땐 일반 enter).
 *
 *  return:
 *    - true: 처리함, 기본 enter 동작 안 함
 *    - false: 조건 불충족 → 다음 enter handler로 통과 (list-continue 등) */
export function fenceAutoClose(view: EditorView): boolean {
  const state = view.state;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const head = sel.head;
  const line = state.doc.lineAt(head);
  if (head !== line.to) return false;
  const fenceMatch = line.text.match(/^(```|~~~)([a-zA-Z0-9_+-]*)$/);
  if (!fenceMatch) return false;
  const fenceChars = fenceMatch[1] ?? '';

  // 앞쪽 fence 줄 개수 검사. 짝수(0 포함)면 새 코드블록 시작으로 간주.
  let fenceCount = 0;
  for (let i = 1; i < line.number; i++) {
    if (/^(```|~~~)/.test(state.doc.line(i).text)) fenceCount++;
  }
  if (fenceCount % 2 === 1) return false;

  view.dispatch({
    changes: { from: head, insert: `\n\n${fenceChars}` },
    selection: { anchor: head + 1 },
    scrollIntoView: true,
    userEvent: 'input.fence-autoclose',
  });
  return true;
}
