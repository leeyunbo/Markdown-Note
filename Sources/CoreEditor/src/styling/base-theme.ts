import { EditorView } from '@codemirror/view';

export const baseTheme = EditorView.theme({
  "&": { height: "100%" },
  // Mock A: body 13.5px / lh 22px, padTop 12 / padX 20, max line ~720
  ".cm-content": {
    fontFamily: "var(--editor-font)",
    fontSize: "16.5px",
    lineHeight: "30px",
    letterSpacing: "0.1px",
    paddingLeft: "98px",
    // 우상단 date stamp가 떠 있어 본문이 그 영역으로 들어가면 겹침. 110px 확보.
    paddingRight: "110px",
  },
  // 한국어 단어 음절 단위 wrap 차단("보장하기" → "보장하" + "기" 회피).
  // CM6의 EditorView.lineWrapping은 .cm-content에 .cm-lineWrapping 클래스를 박고
  // `overflow-wrap: anywhere`로 단어 안에서도 어디서나 wrap 허용 → keep-all이
  // 무력화. selector를 .cm-content.cm-lineWrapping으로 specificity (0,2,0) 올리고
  // overflow-wrap을 break-word로 덮어 단어 단위 wrap만 허용.
  ".cm-content.cm-lineWrapping": {
    wordBreak: "keep-all",
    overflowWrap: "break-word",
  },
  ".cm-line": { padding: "0" },

  // cursor line 강조는 비활성화 (사용자 요청)
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },

  // Search panel — Apple HIG-ish 톤
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--marker)",
    background: "var(--bg)",
  },
  ".cm-panel.cm-search": {
    padding: "8px 14px",
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
    fontSize: "12px",
    background: "var(--bg)",
    color: "var(--fg)",
  },
  ".cm-search .cm-textfield": {
    background: "var(--bg)",
    color: "var(--fg)",
    border: "1px solid var(--marker)",
    borderRadius: "5px",
    padding: "3px 9px",
    outline: "none",
    minWidth: "180px",
    height: "26px",
    fontSize: "12px",
    margin: "0",
    transition: "border-color 0.12s ease, box-shadow 0.12s ease",
  },
  ".cm-search .cm-textfield:focus": {
    borderColor: "var(--link)",
    boxShadow: "0 0 0 3px rgba(0, 102, 204, 0.18)",
  },
  ".cm-search .cm-textfield::placeholder": {
    color: "var(--secondary)",
    opacity: "0.55",
  },
  ".cm-search .cm-button": {
    background: "transparent",
    backgroundImage: "none",
    border: "1px solid transparent",
    borderRadius: "5px",
    padding: "3px 10px",
    cursor: "pointer",
    color: "var(--fg)",
    fontSize: "12px",
    fontWeight: "500",
    height: "26px",
    margin: "0",
    fontFamily: "inherit",
    boxShadow: "none",
    textTransform: "none",
  },
  ".cm-search .cm-button:hover": { background: "var(--code-bg)" },
  ".cm-search .cm-button:active": { background: "var(--marker)" },
  ".cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    color: "var(--secondary)",
    cursor: "pointer",
    margin: "0 4px",
  },
  ".cm-search label input[type=checkbox]": {
    margin: "0 2px 0 0",
    accentColor: "var(--link)",
  },
  ".cm-search [name=close]": {
    position: "absolute",
    right: "8px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "24px",
    height: "24px",
    padding: "0",
    fontSize: "16px",
    color: "var(--secondary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  },
  ".cm-search [name=close]:hover": { color: "var(--fg)" },

  // Table line — monospace + 배경. header/alignment/zebra 구분.
  ".cm-content .cm-table-line": {
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontSize: "13px",
    background: "var(--code-bg)",
    paddingLeft: "12px",
    paddingRight: "12px",
    letterSpacing: "0.02em",
    color: "var(--fg)",
  },
  ".cm-content .cm-table-line.cm-table-header": {
    fontWeight: "600",
    background: "var(--code-bg)",
  },
  ".cm-content .cm-table-line.cm-table-align": {
    color: "var(--marker)",
    fontSize: "11px",
  },
  ".cm-content .cm-table-line.cm-table-zebra": {
    background: "rgba(0, 0, 0, 0.025)",
  },
  ".cm-content .cm-table-line.cm-table-first": {
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    marginTop: "2px",
    paddingTop: "2px",
  },
  ".cm-content .cm-table-line.cm-table-last": {
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    marginBottom: "2px",
    paddingBottom: "2px",
  },
  // pipe(|)는 흐리게 — 보는 데 거슬리지 않음
  ".cm-content .cm-table-pipe": {
    color: "var(--marker)",
    opacity: "0.6",
  },

  // done task — README §Hand-drawn primitives "HandStrike: wavy horizontal strike".
  // textDecoration line-through 대신 SVG wavy stroke를 background로 깔아 손그림 strike.
  // 색은 inkLight(secondary)로 dim.
  ".cm-content .cm-task-done": {
    color: "var(--secondary)",
    backgroundImage:
      'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 200 4"><path d="M2,2 Q14,0.4 28,2 Q42,3.6 56,2 Q70,0.4 84,2 Q98,3.6 112,2 Q126,0.4 140,2 Q154,3.6 168,2 Q182,0.4 196,2" stroke="%23c8442a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7"/></svg>\')',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 4px',
    backgroundPosition: '0 56%',
  },

  // 라인 gutter — 좌측에 h1/h2/¶/│ 등 작은 라벨
  ".cm-gutters": {
    background: "var(--bg)",
    border: "none",
    color: "var(--secondary)",
  },
  ".cm-line-kind-gutter": {
    minWidth: "44px",
    width: "44px",
  },
  ".cm-line-kind-gutter .cm-gutterElement": {
    padding: "0 12px 0 16px",
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontSize: "10px",
    lineHeight: "1.7",
    textAlign: "right",
    color: "var(--secondary)",
    opacity: "0.7",
    minWidth: "44px",
  },
  ".cm-line-kind": {
    display: "inline-block",
  },

  // 하단 status bar
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid var(--marker)",
    background: "var(--bg)",
  },
  ".cm-status-bar": {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "4px 14px",
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    fontSize: "10.5px",
    color: "var(--secondary)",
    height: "22px",
    letterSpacing: "0.02em",
  },
  ".cm-status-bar .cm-status-spacer": { flex: "1" },
  ".cm-status-bar .cm-status-pos": { color: "var(--fg)" },
  ".cm-status-bar .cm-status-meta": { opacity: "0.7" },
  ".cm-status-bar .cm-status-format": { opacity: "0.6" },
  ".cm-status-bar .cm-status-tasks": { opacity: "0.7" },
  ".cm-status-bar .cm-status-size": { opacity: "0.7" },
});
