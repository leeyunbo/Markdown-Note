"use strict";

const editor = document.getElementById('editor');

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ----- Inline highlight (single line) -----

function highlightInline(rawLine) {
  let m = rawLine.match(/^(\s*)(#{1,6})(\s+)(.*)$/);
  if (m) {
    const lvl = m[2].length;
    return `${m[1]}<span class="marker">${m[2]}</span>${m[3]}<span class="h${lvl}">${escapeHTML(m[4])}</span>`;
  }
  if (/^\s*([-_*])(\s*\1){2,}\s*$/.test(rawLine)) {
    return `<span class="hr">${escapeHTML(rawLine)}</span>`;
  }

  let html = escapeHTML(rawLine);

  html = html.replace(/^(\s*)(&gt;+\s?)(.*)$/, (_, sp, mark, rest) =>
    `${sp}<span class="marker">${mark}</span><span class="blockquote">${rest}</span>`);
  html = html.replace(/^(\s*)([-*+]|\d+\.)(\s)/, (_, sp, mk, rest) => {
    const depth = Math.min(Math.floor(sp.length / 2), 4);
    return `${sp}<span class="list-marker depth-${depth}">${mk}</span>${rest}`;
  });
  html = html.replace(/(\[)( |x|X)(\])/, (_, l, c, r) =>
    `<span class="marker">${l}</span><span class="list-marker">${c}</span><span class="marker">${r}</span>`);
  html = html.replace(/(!\[)([^\]]*)(\]\()([^)]+)(\))/g,
    '<span class="marker">$1</span><span class="link">$2</span><span class="marker">$3</span><span class="secondary">$4</span><span class="marker">$5</span>');
  html = html.replace(/(?<!!)(\[)([^\]]+)(\]\()([^)]+)(\))/g,
    '<span class="marker">$1</span><span class="link">$2</span><span class="marker">$3</span><span class="secondary">$4</span><span class="marker">$5</span>');
  html = html.replace(/(\*\*|__)([^\n]+?)\1/g,
    '<span class="marker">$1</span><span class="bold">$2</span><span class="marker">$1</span>');
  html = html.replace(/(?<![*_\\])([*_])(?!\s)([^*_\n]+?)(?<!\s)\1(?![*_])/g,
    '<span class="marker">$1</span><span class="italic">$2</span><span class="marker">$1</span>');
  html = html.replace(/(~~)([^\n]+?)(~~)/g,
    '<span class="marker">$1</span><span class="strike">$2</span><span class="marker">$3</span>');
  html = html.replace(/(`+)([^`\n]+?)\1/g,
    '<span class="marker">$1</span><span class="code">$2</span><span class="marker">$1</span>');
  html = html.replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^&]*?)?\/?&gt;)/g,
    '<span class="html-tag">$1</span>');

  return html;
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isAlignmentRow(line) {
  return /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line);
}

function parseAlignment(line) {
  const inner = line.trim().slice(1, -1);
  return inner.split('|').map(c => {
    const t = c.trim();
    const left = t.startsWith(':');
    const right = t.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function parseTableCells(line) {
  return line.trim().slice(1, -1).split('|').map(c => c.trim());
}

function tableRowHTML(line) {
  return escapeHTML(line).replace(/\|/g, '<span class="pipe">|</span>');
}

// 인라인 마크업을 cell 안에서도 적용 (bold, italic, code, link 등)
function highlightInlineInCell(text) {
  let html = escapeHTML(text);
  html = html.replace(/(\*\*|__)([^\n]+?)\1/g, '<strong>$2</strong>');
  html = html.replace(/(?<![*_\\])([*_])(?!\s)([^*_\n]+?)(?<!\s)\1(?![*_])/g, '<em>$2</em>');
  html = html.replace(/(~~)([^\n]+?)(~~)/g, '<del>$2</del>');
  html = html.replace(/(`+)([^`\n]+?)\1/g, '<code>$2</code>');
  html = html.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text, url) => `<a href="${escapeHTML(url)}">${text}</a>`);
  return html;
}

function buildTableHTML(rawLines) {
  const headerLine = rawLines[0];
  const alignLine = rawLines[1] && isAlignmentRow(rawLines[1]) ? rawLines[1] : null;
  const bodyLines = alignLine ? rawLines.slice(2) : rawLines.slice(1);

  const headerCells = parseTableCells(headerLine);
  const alignments = alignLine ? parseAlignment(alignLine) : [];

  const alignAttr = (i) => {
    const a = alignments[i];
    return a ? ` style="text-align:${a}"` : '';
  };

  let html = '<div class="md-table-wrap"><table class="md-table">';
  html += '<thead><tr>';
  headerCells.forEach((cell, i) => {
    html += `<th${alignAttr(i)} contenteditable="true">${highlightInlineInCell(cell)}</th>`;
  });
  html += '</tr></thead><tbody>';
  bodyLines.forEach(bodyLine => {
    const cells = parseTableCells(bodyLine);
    html += '<tr>';
    cells.forEach((cell, i) => {
      html += `<td${alignAttr(i)} contenteditable="true">${highlightInlineInCell(cell)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // raw markdown은 base64로 저장 (JSON quote escape 회피)
  const raw = btoa(unescape(encodeURIComponent(rawLines.join('\n'))));
  return `<div class="line table-block" data-raw="${raw}">${html}</div>`;
}

function decodeRaw(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function isFenceMarker(line) {
  const t = line.trim();
  return t.startsWith('```') || t.startsWith('~~~');
}

function extractFenceLang(line) {
  const m = line.match(/^\s*(?:```|~~~)\s*([\w+-]+)?/);
  return m && m[1] ? m[1].toLowerCase() : '';
}

// ----- Syntax highlight (라인 단위 — multi-line string/comment는 끊길 수 있음) -----

const _LANG_JS = {
  keywords: ['const','let','var','function','return','if','else','for','while','do','class','extends','new','this','super','null','undefined','true','false','try','catch','finally','throw','async','await','import','export','from','as','default','typeof','instanceof','in','of','break','continue','switch','case','void','yield','static','get','set','delete'],
  builtins: ['console','window','document','Array','Object','String','Number','Boolean','Promise','Map','Set','JSON','Math','Date','RegExp','Error','Symbol'],
  comments: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  strings: /(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g,
  numbers: /\b\d+(?:\.\d+)?\b/g,
};
const _LANG_PY = {
  keywords: ['def','class','if','elif','else','for','while','return','import','from','as','try','except','finally','raise','with','pass','lambda','None','True','False','and','or','not','in','is','yield','async','await','global','nonlocal','break','continue'],
  builtins: ['print','len','range','list','dict','set','tuple','str','int','float','bool','open','input','enumerate','zip','map','filter','isinstance','type'],
  comments: /#[^\n]*/g,
  strings: /(['"])(?:\\.|(?!\1).)*\1/g,
  numbers: /\b\d+(?:\.\d+)?\b/g,
};
const _LANG_SWIFT = {
  keywords: ['func','let','var','class','struct','enum','protocol','extension','if','else','for','while','do','switch','case','default','return','guard','defer','throw','throws','try','catch','as','is','nil','true','false','self','Self','init','deinit','public','private','internal','fileprivate','open','static','final','mutating','nonmutating','async','await','some','any','where','import','typealias','associatedtype','inout','rethrows','indirect','convenience','required','override','lazy','weak','unowned'],
  builtins: ['print','String','Int','Double','Float','Bool','Array','Dictionary','Set','Optional','Range','Error'],
  comments: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  strings: /"(?:\\.|[^"\\])*"/g,
  numbers: /\b\d+(?:\.\d+)?\b/g,
};
const _LANG_JSON = {
  keywords: ['true','false','null'],
  comments: null,
  strings: /"(?:\\.|[^"\\])*"/g,
  numbers: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,
};
const _LANG_BASH = {
  keywords: ['if','then','else','elif','fi','for','while','do','done','case','esac','function','in','return','export','source','echo','exit','set','unset','local','readonly'],
  builtins: ['cd','ls','grep','sed','awk','cat','tail','head','find','curl','wget','rm','cp','mv','mkdir','chmod','chown','sudo'],
  comments: /#[^\n]*/g,
  strings: /(['"])(?:\\.|(?!\1).)*\1/g,
  numbers: /\b\d+\b/g,
};
const _LANG_JAVA = {
  keywords: ['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','false','final','finally','float','for','goto','if','implements','import','instanceof','int','interface','long','native','new','null','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','true','try','void','volatile','while','var','yield','record','sealed','permits'],
  builtins: ['String','Integer','Long','Double','Float','Boolean','Byte','Short','Character','Object','Class','System','Math','Arrays','List','ArrayList','Map','HashMap','Set','HashSet','Collection','Optional','Stream','Exception','RuntimeException','Thread','Override','Deprecated','SuppressWarnings','FunctionalInterface'],
  comments: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  strings: /"(?:\\.|[^"\\])*"/g,
  numbers: /\b\d+(?:\.\d+)?[LlFfDd]?\b|\b0x[0-9a-fA-F]+\b/g,
};
const _LANG_KOTLIN = {
  keywords: ['fun','val','var','class','object','interface','if','else','for','while','do','when','return','import','package','as','is','in','out','by','lazy','null','true','false','this','super','companion','data','sealed','open','final','abstract','override','private','protected','public','internal','suspend','typealias','where'],
  builtins: ['String','Int','Long','Double','Float','Boolean','Char','Byte','Short','Any','Unit','Nothing','List','Map','Set','Array','MutableList','MutableMap','MutableSet'],
  comments: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
  strings: /"(?:\\.|[^"\\])*"/g,
  numbers: /\b\d+(?:\.\d+)?[LlFf]?\b/g,
};
const SYNTAX_LANGS = {
  js: _LANG_JS, javascript: _LANG_JS, jsx: _LANG_JS,
  ts: _LANG_JS, typescript: _LANG_JS, tsx: _LANG_JS,
  python: _LANG_PY, py: _LANG_PY,
  swift: _LANG_SWIFT,
  java: _LANG_JAVA,
  kotlin: _LANG_KOTLIN, kt: _LANG_KOTLIN,
  json: _LANG_JSON,
  bash: _LANG_BASH, sh: _LANG_BASH, shell: _LANG_BASH, zsh: _LANG_BASH,
};

// codeblock 라인의 token span을 유지한 채 입력될 때마다 다시 highlight하고
// 사용자 cursor 위치를 textContent offset 기준으로 복원한다.
function rehighlightCodeLine(lineDiv) {
  const lang = lineDiv.dataset && lineDiv.dataset.lang;
  if (!lang) return;

  const sel = window.getSelection();
  let offset = -1;
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (lineDiv.contains(range.startContainer)) {
      const pre = document.createRange();
      pre.selectNodeContents(lineDiv);
      pre.setEnd(range.startContainer, range.startOffset);
      offset = pre.toString().length;
    }
  }

  const text = lineDiv.textContent;
  lineDiv.innerHTML = highlightCodeLine(text, lang) || '<br>';

  if (offset >= 0) {
    let remaining = offset;
    const walker = document.createTreeWalker(lineDiv, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      if (remaining <= len) {
        const r = document.createRange();
        r.setStart(node, remaining);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      remaining -= len;
    }
    // walker가 못 잡으면 라인 끝
    const r = document.createRange();
    r.selectNodeContents(lineDiv);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function highlightCodeLine(text, lang) {
  const def = SYNTAX_LANGS[lang];
  if (!def || !text) return escapeHTML(text);

  const tokens = [];
  function pushIfFree(start, end, cls) {
    for (const t of tokens) {
      if (start < t.end && end > t.start) return false;
    }
    tokens.push({ start, end, cls });
    return true;
  }
  function tryMatch(re, cls) {
    if (!re) return;
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = r.exec(text)) !== null) {
      pushIfFree(m.index, m.index + m[0].length, cls);
      if (m[0].length === 0) r.lastIndex++;
    }
  }

  // 우선순위: comment > string > keyword > builtin > number
  tryMatch(def.comments, 'tok-comment');
  tryMatch(def.strings, 'tok-string');
  if (def.keywords && def.keywords.length) {
    tryMatch(new RegExp(`\\b(?:${def.keywords.join('|')})\\b`, 'g'), 'tok-keyword');
  }
  if (def.builtins && def.builtins.length) {
    tryMatch(new RegExp(`\\b(?:${def.builtins.join('|')})\\b`, 'g'), 'tok-builtin');
  }
  tryMatch(def.numbers, 'tok-number');

  tokens.sort((a, b) => a.start - b.start);

  let html = '';
  let cursor = 0;
  for (const t of tokens) {
    if (t.start < cursor) continue;
    html += escapeHTML(text.slice(cursor, t.start));
    html += `<span class="${t.cls}">${escapeHTML(text.slice(t.start, t.end))}</span>`;
    cursor = t.end;
  }
  html += escapeHTML(text.slice(cursor));
  return html;
}

// 라인 하나만 styled로 (in-place). 단, 떠난 라인이 표 그룹의 일부면 그룹 전체를 table로 합침.
function styleLine(lineDiv, opts) {
  // table-block은 이미 렌더된 표이므로 절대 건드리지 않음
  if (lineDiv.classList && lineDiv.classList.contains('table-block')) return;
  opts = opts || {};
  const text = (opts.text !== undefined) ? opts.text : lineDiv.textContent;
  // 명시적 inFence가 없으면 현재 className으로 추론. 호출자(클릭 후 떠난 라인 등)는
  // 라인이 fence 안인지 알 길이 없으므로, 라인 자신의 codeblock 클래스를 신뢰한다.
  const inFence = (opts.inFence !== undefined)
    ? !!opts.inFence
    : (lineDiv.classList && lineDiv.classList.contains('codeblock'));

  if (isFenceMarker(text)) {
    lineDiv.className = 'line';
    lineDiv.innerHTML = `<span class="marker">${escapeHTML(text)}</span>`;
    if (lineDiv.dataset) delete lineDiv.dataset.lang;
    return;
  }
  if (inFence) {
    const lang = (lineDiv.dataset && lineDiv.dataset.lang) || '';
    lineDiv.className = 'line codeblock';
    if (lang) lineDiv.dataset.lang = lang;
    lineDiv.innerHTML = (lang ? highlightCodeLine(text, lang) : escapeHTML(text)) || '<br>';
    return;
  }
  if (isTableRow(text)) {
    // 표 그룹 묶기 시도 (header + alignment + bodies)
    const collapsed = collapseTableGroup(lineDiv);
    if (collapsed) return;
    // 단독 |...| 줄이라면 그냥 monospace
    lineDiv.className = 'line table-row';
    lineDiv.innerHTML = tableRowHTML(text);
    return;
  }
  lineDiv.className = 'line';
  lineDiv.innerHTML = highlightInline(text) || '<br>';
  if (/^\s*>+\s/.test(text)) lineDiv.classList.add('blockquote-line');
}

// lineDiv 주변의 연속 table-row를 찾아서 table로 합치고, lineDiv를 새 wrapper로 교체.
function collapseTableGroup(lineDiv) {
  // 위/아래로 연속된 table-row 라인 div 찾기
  const rawLines = [lineDiv.textContent];
  // 위로
  let prev = lineDiv.previousElementSibling;
  while (prev && prev.classList.contains('line') && !prev.classList.contains('table-block')) {
    const t = prev.textContent;
    if (!isTableRow(t)) break;
    rawLines.unshift(t);
    prev = prev.previousElementSibling;
  }
  // 아래로
  let next = lineDiv.nextElementSibling;
  while (next && next.classList.contains('line') && !next.classList.contains('table-block')) {
    const t = next.textContent;
    if (!isTableRow(t)) break;
    rawLines.push(t);
    next = next.nextElementSibling;
  }

  if (rawLines.length < 2) return false;
  if (!isAlignmentRow(rawLines[1])) return false;

  // table HTML 만들기
  const tmp = document.createElement('div');
  tmp.innerHTML = buildTableHTML(rawLines);
  const wrapper = tmp.firstElementChild;

  // 모은 모든 라인 div 제거 + wrapper 삽입
  const start = (() => {
    let p = lineDiv;
    while (p.previousElementSibling
      && p.previousElementSibling.classList.contains('line')
      && !p.previousElementSibling.classList.contains('table-block')
      && isTableRow(p.previousElementSibling.textContent)) {
      p = p.previousElementSibling;
    }
    return p;
  })();
  const end = (() => {
    let p = lineDiv;
    while (p.nextElementSibling
      && p.nextElementSibling.classList.contains('line')
      && !p.nextElementSibling.classList.contains('table-block')
      && isTableRow(p.nextElementSibling.textContent)) {
      p = p.nextElementSibling;
    }
    return p;
  })();

  start.parentNode.insertBefore(wrapper, start);
  let cur = start;
  while (cur) {
    const nxt = cur.nextElementSibling;
    cur.remove();
    if (cur === end) break;
    cur = nxt;
  }
  return true;
}

// table-block을 다시 raw line div들로 풀기 (편집용)
function expandTableBlock(tableBlock) {
  const raw = decodeRaw(tableBlock.dataset.raw || '');
  const lines = raw.split('\n');
  const fragments = lines.map(line => {
    const div = document.createElement('div');
    div.className = 'line';
    div.textContent = line;
    return div;
  });
  const parent = tableBlock.parentNode;
  fragments.forEach(d => parent.insertBefore(d, tableBlock));
  tableBlock.remove();
  return fragments;
}

// fence 컨텍스트를 위에서 한 번 훑으며 codeblock 클래스/lang을 라인별로 다시 부여.
// 라인 단위 입력만으로는 fence marker 변경이 다른 라인에 자동 반영되지 않으므로
// 떠난 라인 처리 직후, 그리고 Enter 후 호출한다.
function reflowFences() {
  let inFence = false;
  let fenceLang = '';
  for (const lineDiv of editor.children) {
    if (!lineDiv.classList || !lineDiv.classList.contains('line')) continue;
    if (lineDiv.classList.contains('table-block')) continue;
    const text = lineDiv.textContent;

    // fence marker 토글
    if (isFenceMarker(text)) {
      if (!inFence) {
        fenceLang = extractFenceLang(text);
        inFence = true;
      } else {
        inFence = false;
        fenceLang = '';
      }
      // fence marker 자체는 codeblock 클래스 X. 떠난 라인이면 styleLine으로 다시 그림
      if (lineDiv.classList.contains('codeblock')) {
        lineDiv.classList.remove('codeblock');
        if (lineDiv.dataset) delete lineDiv.dataset.lang;
        if (lineDiv !== lastLineDiv) styleLine(lineDiv);
      }
      continue;
    }

    if (inFence) {
      // codeblock으로 표시. 편집 중인 라인은 raw 유지(클래스만 부여), 떠난 라인은 highlight 적용
      const wasCodeblock = lineDiv.classList.contains('codeblock');
      lineDiv.classList.add('codeblock');
      if (fenceLang) lineDiv.dataset.lang = fenceLang;
      else if (lineDiv.dataset) delete lineDiv.dataset.lang;
      if (lineDiv !== lastLineDiv && !wasCodeblock) {
        styleLine(lineDiv, { inFence: true });
      } else if (lineDiv !== lastLineDiv) {
        // 이미 codeblock이지만 lang이 바뀌었거나 다시 그려야 할 수 있음
        styleLine(lineDiv, { inFence: true });
      }
    } else {
      // fence 밖. 이전에 codeblock이었다면 해제
      if (lineDiv.classList.contains('codeblock')) {
        lineDiv.classList.remove('codeblock');
        if (lineDiv.dataset) delete lineDiv.dataset.lang;
        if (lineDiv !== lastLineDiv) styleLine(lineDiv);
      }
    }
  }
}

// 라인 하나만 raw text로 (편집 중인 라인)
function unstyleLine(lineDiv) {
  const text = lineDiv.textContent;
  lineDiv.className = 'line';
  lineDiv.textContent = text || '';
  if (lineDiv.textContent === '') {
    lineDiv.innerHTML = '<br>';
  }
}

// ----- Build full DOM (외부 setText에서) -----

function buildContent(text) {
  const rawLines = text.split('\n');
  let html = '';
  let inFence = false;
  let fenceLang = '';
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (isFenceMarker(line)) {
      if (!inFence) {
        fenceLang = extractFenceLang(line);
        inFence = true;
      } else {
        inFence = false;
        fenceLang = '';
      }
      html += `<div class="line"><span class="marker">${escapeHTML(line)}</span></div>`;
      i++;
      continue;
    }
    if (inFence) {
      const inner = fenceLang ? highlightCodeLine(line, fenceLang) : escapeHTML(line);
      const attr = fenceLang ? ` data-lang="${escapeHTML(fenceLang)}"` : '';
      html += `<div class="line codeblock"${attr}>${inner || '<br>'}</div>`;
      i++;
      continue;
    }
    // 표 그룹 (header + alignment + bodies, 최소 alignment row 필요)
    if (isTableRow(line) && i + 1 < rawLines.length && isAlignmentRow(rawLines[i + 1])) {
      const tableLines = [line, rawLines[i + 1]];
      let j = i + 2;
      while (j < rawLines.length && isTableRow(rawLines[j])) {
        tableLines.push(rawLines[j]);
        j++;
      }
      html += buildTableHTML(tableLines);
      i = j;
      continue;
    }
    const bq = /^\s*>+\s/.test(line) ? ' blockquote-line' : '';
    html += `<div class="line${bq}">${highlightInline(line) || '<br>'}</div>`;
    i++;
  }
  return html;
}

// backward compat for any remaining caller
function buildLines(text) { return buildContent(text); }

// ----- Caret tracking -----

function getCurrentLineDiv() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node = sel.getRangeAt(0).startContainer;
  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE
        && node.classList && node.classList.contains('line')) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

// ----- External API -----

let isApplyingExternal = false;
let lastLineDiv = null;

window.appBridge = {
  setText: function(text) {
    isApplyingExternal = true;
    editor.innerHTML = buildContent(text);
    lastLineDiv = null;
    setTimeout(() => { isApplyingExternal = false; }, 0);
  },
  setTheme: function(vars) {
    Object.entries(vars).forEach(([k, v]) =>
      document.documentElement.style.setProperty('--' + k, v));
  }
};

// ----- Input handling: 떠나는 라인만 style 적용 -----

let composing = false;
let notifyTimer = null;

// 측정 훅: 큰 문서에서 실제로 느려질 때 콘솔로 확인하기 위함.
// 임계 초과 시에만 로그 (잡음 방지). window.__mdPerf로 기록도 남김.
window.__mdPerf = { lastGetPlainText: 0, sampleCount: 0, maxMs: 0 };

function getPlainText() {
  const t0 = performance.now();
  // table-block은 dataset.raw에 raw markdown을 보존 (innerText는 cell 텍스트만)
  const out = [];
  for (const child of editor.children) {
    if (child.classList && child.classList.contains('table-block')) {
      out.push(decodeRaw(child.dataset.raw || ''));
    } else {
      out.push(child.textContent || '');
    }
  }
  const result = out.join('\n');
  const dt = performance.now() - t0;
  window.__mdPerf.lastGetPlainText = dt;
  window.__mdPerf.sampleCount++;
  if (dt > window.__mdPerf.maxMs) window.__mdPerf.maxMs = dt;
  if (dt > 16) {
    console.warn(`getPlainText slow: ${dt.toFixed(1)}ms (${editor.children.length} blocks)`);
  }
  return result;
}

function notifySwift() {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    const txt = getPlainText();
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.textChanged) {
      window.webkit.messageHandlers.textChanged.postMessage(txt);
    }
  }, 150);
}

editor.addEventListener('compositionstart', () => { composing = true; });
editor.addEventListener('compositionend', () => {
  composing = false;
  // IME 조합 끝났을 때 codeblock 라인이면 re-highlight
  const cur = getCurrentLineDiv();
  if (cur && cur.classList.contains('codeblock') && cur.dataset && cur.dataset.lang) {
    rehighlightCodeLine(cur);
  }
  notifySwift();
});

editor.addEventListener('input', () => {
  if (isApplyingExternal) return;
  // 표 셀 input 핸들러는 별도 (rebuildTableRaw). codeblock은 즉시 re-highlight,
  // blockquote-line 클래스도 입력 시점에 토글 (vertical bar가 한 박자 늦지 않게)
  if (!composing) {
    const cur = getCurrentLineDiv();
    if (cur) {
      if (cur.classList.contains('codeblock') && cur.dataset && cur.dataset.lang) {
        rehighlightCodeLine(cur);
      }
      const text = cur.textContent || '';
      if (/^\s*>+\s/.test(text)) cur.classList.add('blockquote-line');
      else cur.classList.remove('blockquote-line');
    }
  }
  notifySwift();
});

// 떠난 라인만 styled로. 진입 라인은 그대로 둬서 layout shift 방지.
function handleLineFocusChange() {
  if (composing || isApplyingExternal) return;

  // multi-character selection(드래그 / Shift+화살표 확장)이면 styling을 손대면
  // 라인의 innerHTML이 다시 그려지면서 selection이 무효화된다 — 그냥 통과.
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) return;

  // lastLineDiv가 DOM에서 분리된 경우(backspace 라인 합치기, 외부 setText 등) 트래킹 리셋
  if (lastLineDiv && !editor.contains(lastLineDiv)) {
    lastLineDiv = null;
  }

  const cur = getCurrentLineDiv();
  if (!cur) return;
  if (cur === lastLineDiv) return;

  if (lastLineDiv && lastLineDiv !== cur) {
    styleLine(lastLineDiv);
    // 떠난 라인이 fence marker였거나 fence 안 라인이었을 수 있음 — 다음 라인들 재계산
    reflowFences();
  }
  // codeblock은 token span을 유지한다. 입력 시 input 핸들러가 즉시 re-highlight.
  ensureCaretSafe(cur);
  lastLineDiv = cur;
}

// 빈 라인(BR만)에 들어가면 textnode를 추가해 입력이 라인 안에 들어가도록 보장
function ensureCaretSafe(lineDiv) {
  if (lineDiv.classList && lineDiv.classList.contains('table-block')) return;
  if (lineDiv.children.length === 1 && lineDiv.children[0].tagName === 'BR') {
    const tn = document.createTextNode('');
    lineDiv.insertBefore(tn, lineDiv.firstChild);
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(tn, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function unstyleLineKeepCaret(lineDiv) {
  // cursor offset within the line
  const sel = window.getSelection();
  if (!sel.rangeCount) {
    unstyleLine(lineDiv);
    return;
  }
  const range = sel.getRangeAt(0);
  if (!lineDiv.contains(range.endContainer)) {
    unstyleLine(lineDiv);
    return;
  }

  const pre = range.cloneRange();
  pre.selectNodeContents(lineDiv);
  pre.setEnd(range.endContainer, range.endOffset);
  const offset = pre.toString().length;

  const text = lineDiv.textContent;
  // 이미 plain text면 (단일 textnode) 그대로 둠
  if (lineDiv.childNodes.length === 1 && lineDiv.firstChild.nodeType === Node.TEXT_NODE) {
    return;
  }
  // 빈 라인 (BR만)
  if (lineDiv.children.length === 1 && lineDiv.children[0].tagName === 'BR') {
    return;
  }

  // codeblock / blockquote-line은 클래스 유지
  const wasCodeblock = lineDiv.classList && lineDiv.classList.contains('codeblock');
  const wasBlockquote = lineDiv.classList && lineDiv.classList.contains('blockquote-line');
  const cls = ['line'];
  if (wasCodeblock) cls.push('codeblock');
  if (wasBlockquote) cls.push('blockquote-line');
  lineDiv.className = cls.join(' ');
  if (text === '') {
    lineDiv.innerHTML = '<br>';
    return;
  }
  lineDiv.textContent = text;

  // cursor 복원
  const newRange = document.createRange();
  const tn = lineDiv.firstChild;
  if (tn && tn.nodeType === Node.TEXT_NODE) {
    const safe = Math.max(0, Math.min(offset, tn.nodeValue.length));
    newRange.setStart(tn, safe);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

// 표 안 cell 외부 영역 입력 차단 (table 자체나 wrap 클릭하고 입력하는 케이스)
editor.addEventListener('beforeinput', (e) => {
  const sel = window.getSelection();
  if (sel.rangeCount === 0) return;
  const startNode = sel.getRangeAt(0).startContainer;
  let n = startNode.nodeType === Node.ELEMENT_NODE ? startNode : startNode.parentNode;
  let block = null, cell = null;
  while (n && n !== editor) {
    if (!cell && (n.tagName === 'TH' || n.tagName === 'TD')) cell = n;
    if (n.classList && n.classList.contains('table-block')) { block = n; break; }
    n = n.parentNode;
  }
  if (block && !cell) {
    e.preventDefault();
  }
});

// 표 셀 직접 편집: 셀 input → dataset.raw 동기화
editor.addEventListener('input', (e) => {
  const cell = e.target.closest && e.target.closest('th, td');
  if (!cell) return;
  const block = cell.closest('.table-block');
  if (!block) return;
  rebuildTableRaw(block);
  notifySwift();
});

// 셀 안에서 Enter 누르면 셀 안에 줄바꿈 들어가지 않게 (마크다운 표 셀은 단일 라인)
editor.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const cell = e.target.closest && e.target.closest('th, td');
  if (!cell) return;
  e.preventDefault();
  // Shift+Enter는 다음 행, 일반 Enter는 표 아래 새 라인
  const block = cell.closest('.table-block');
  if (!block) return;
  const newLine = document.createElement('div');
  newLine.className = 'line';
  newLine.appendChild(document.createTextNode(''));
  block.parentNode.insertBefore(newLine, block.nextSibling);
  const r = document.createRange();
  r.setStart(newLine.firstChild, 0);
  r.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  lastLineDiv = newLine;
});

// Tab 키: 표 셀 → 다음 셀, 리스트 라인 → indent/outdent, 그 외 → default 막기만
editor.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  if (composing) return;

  // 표 셀: 다음 셀로 이동
  const cell = e.target.closest && e.target.closest('th, td');
  if (cell) {
    e.preventDefault();
    const cells = cell.closest('table').querySelectorAll('th, td');
    const arr = Array.from(cells);
    const idx = arr.indexOf(cell);
    const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
    if (nextIdx >= 0 && nextIdx < arr.length) {
      arr[nextIdx].focus();
      const r = document.createRange();
      r.selectNodeContents(arr[nextIdx]);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return;
  }

  // 일반 라인
  const cur = getCurrentLineDiv();
  if (!cur || cur.classList.contains('table-block')) return;

  // 리스트 라인이 아니면 focus 이동만 차단하고 아무것도 안 함
  // (마크다운에서 4-space 들여쓰기는 코드블록이 되어버려서 일반 라인 indent는 위험)
  const text = cur.textContent;
  const listInfo = detectListPrefix(text);
  if (!listInfo) {
    e.preventDefault();
    return;
  }

  e.preventDefault();

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const { startOff, endOff } = getLineCharRange(cur, range);

  let newText, newStart, newEnd;
  if (e.shiftKey) {
    // outdent: leading whitespace 최대 2칸 제거
    if (text.startsWith('  ')) {
      newText = text.slice(2);
      newStart = Math.max(0, startOff - 2);
      newEnd = Math.max(0, endOff - 2);
    } else if (text.startsWith(' ')) {
      newText = text.slice(1);
      newStart = Math.max(0, startOff - 1);
      newEnd = Math.max(0, endOff - 1);
    } else {
      return;  // 더 outdent 할 게 없음
    }
  } else {
    // indent: 2칸 추가
    newText = '  ' + text;
    newStart = startOff + 2;
    newEnd = endOff + 2;
  }

  replaceLineText(cur, newText, newStart, newEnd);
  notifySwift();
});

function rebuildTableRaw(block) {
  const tbl = block.querySelector('table');
  if (!tbl) return;
  const lines = [];
  const headerCells = tbl.querySelectorAll('thead th');
  lines.push('| ' + Array.from(headerCells).map(c => c.textContent.trim()).join(' | ') + ' |');

  const oldRaw = decodeRaw(block.dataset.raw || '');
  const oldLines = oldRaw.split('\n');
  if (oldLines[1] && isAlignmentRow(oldLines[1])) {
    lines.push(oldLines[1]);
  } else {
    // alignment 행 없으면 default 만들기
    const dashes = Array.from(headerCells).map(() => '---');
    lines.push('| ' + dashes.join(' | ') + ' |');
  }

  const bodyRows = tbl.querySelectorAll('tbody tr');
  bodyRows.forEach(row => {
    const cells = row.querySelectorAll('td');
    lines.push('| ' + Array.from(cells).map(c => c.textContent.trim()).join(' | ') + ' |');
  });
  block.dataset.raw = btoa(unescape(encodeURIComponent(lines.join('\n'))));
}

// selectionchange로 모든 selection 이동을 잡는다(IME 조합 후, backspace 라인 합치기, ⌘A 등 단축키 포함).
// keyup/mouseup/focus는 안전망으로 유지.
const NAV_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Tab'
]);
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  if (!editor.contains(sel.getRangeAt(0).startContainer)) return;
  handleLineFocusChange();
});
editor.addEventListener('keyup', (e) => {
  if (NAV_KEYS.has(e.key)) handleLineFocusChange();
});
editor.addEventListener('mouseup', () => {
  handleLineFocusChange();
});
editor.addEventListener('focus', () => {
  handleLineFocusChange();
});

// 리스트 마커 검출. 매치되면 prefix/isEmpty/nextPrefix 반환.
// - "- foo"   → prefix "- ",     isEmpty false, nextPrefix "- "
// - "- "      → prefix "- ",     isEmpty true,  nextPrefix "- "
// - "1. foo"  → prefix "1. ",    isEmpty false, nextPrefix "2. "
// - "- [ ] x" → prefix "- [ ] ", isEmpty false, nextPrefix "- [ ] "
function detectListPrefix(line) {
  // 체크박스 (unordered + [ ]/[x])
  let m = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (m) {
    const indent = m[1], mk = m[2], content = m[4];
    return {
      prefix: `${indent}${mk} [${m[3]}] `,
      isEmpty: content === '',
      nextPrefix: `${indent}${mk} [ ] `  // 다음 줄은 항상 빈 체크박스
    };
  }
  // unordered
  m = line.match(/^(\s*)([-*+])\s+(.*)$/);
  if (m) {
    const indent = m[1], mk = m[2], content = m[3];
    const prefix = `${indent}${mk} `;
    return { prefix, isEmpty: content === '', nextPrefix: prefix };
  }
  // ordered
  m = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (m) {
    const indent = m[1], num = parseInt(m[2], 10), content = m[3];
    return {
      prefix: `${indent}${m[2]}. `,
      isEmpty: content === '',
      nextPrefix: `${indent}${num + 1}. `
    };
  }
  return null;
}

// Enter 키: contenteditable의 자동 동작 대신 우리가 직접 라인 추가 + 리스트 컨티뉴
editor.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === 'Return') && !e.shiftKey && !composing) {
    const cur = getCurrentLineDiv();
    if (!cur) return;
    e.preventDefault();

    const sel = window.getSelection();
    const range = sel.getRangeAt(0);

    const fullText = cur.textContent;
    const pre = range.cloneRange();
    pre.selectNodeContents(cur);
    pre.setEnd(range.endContainer, range.endOffset);
    const offset = pre.toString().length;

    const before = fullText.slice(0, offset);
    const after = fullText.slice(offset);

    const listInfo = detectListPrefix(fullText);

    // 빈 리스트 항목 + 라인 끝 Enter → 마커 제거 (리스트 종료, 새 라인 안 만듦)
    if (listInfo && listInfo.isEmpty && offset === fullText.length) {
      cur.className = 'line';
      cur.innerHTML = '<br>';
      ensureCaretSafe(cur);
      lastLineDiv = cur;
      notifySwift();
      return;
    }

    // 새 라인 prefix: 리스트 라인 안에서 Enter면 nextPrefix 자동 삽입
    const newPrefix = listInfo ? listInfo.nextPrefix : '';

    // 떠나는 현재 라인 → styled
    cur.className = 'line';
    cur.textContent = before;
    styleLine(cur);

    // 새 라인
    const newLine = document.createElement('div');
    newLine.className = 'line';
    const tn = document.createTextNode(newPrefix + after);
    newLine.appendChild(tn);
    cur.parentNode.insertBefore(newLine, cur.nextSibling);

    const r = document.createRange();
    r.setStart(tn, newPrefix.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    newLine.scrollIntoView({ block: 'nearest' });

    lastLineDiv = newLine;
    // 새 라인이 fence 안에 있을 수 있으므로 codeblock 클래스/lang 부여
    reflowFences();
    notifySwift();
  }
});

// ----- Markdown shortcuts (⌘B / ⌘I / ⌘K) -----

// selection이 line div 안에서 차지하는 char offset 범위를 계산.
// styled span이 섞여 있어도 textContent 기준 offset이라 raw markdown과 일치.
function getLineCharRange(lineDiv, range) {
  const pre = document.createRange();
  pre.selectNodeContents(lineDiv);
  pre.setEnd(range.startContainer, range.startOffset);
  const startOff = pre.toString().length;
  pre.setEnd(range.endContainer, range.endOffset);
  const endOff = pre.toString().length;
  return { startOff, endOff };
}

// lineDiv를 새 텍스트로 통째로 교체 + char offset으로 selection 복원.
// execCommand를 쓰는 이유: native undo stack 등록 (⌘Z 동작). styled span이 섞여
// 있어도 selectNodeContents + insertText가 단일 textnode로 평탄화시킨다.
function replaceLineText(lineDiv, newText, selStart, selEnd) {
  const sel = window.getSelection();
  const lineRange = document.createRange();
  lineRange.selectNodeContents(lineDiv);
  sel.removeAllRanges();
  sel.addRange(lineRange);
  document.execCommand('insertText', false, newText);

  const tn = lineDiv.firstChild;
  if (tn && tn.nodeType === Node.TEXT_NODE) {
    const len = tn.nodeValue.length;
    const r = document.createRange();
    r.setStart(tn, Math.max(0, Math.min(selStart, len)));
    r.setEnd(tn, Math.max(0, Math.min(selEnd, len)));
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function wrapOrToggleSelection(left, right) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return;

  const lineDiv = getCurrentLineDiv();
  if (!lineDiv) return;
  if (lineDiv.classList.contains('table-block')) return;
  // 라인 경계를 넘는 selection은 안전하게 무시
  if (!lineDiv.contains(range.endContainer)) return;

  const { startOff, endOff } = getLineCharRange(lineDiv, range);
  const lineText = lineDiv.textContent;
  const selText = lineText.slice(startOff, endOff);

  let newText, newStart, newEnd;

  if (selText.length === 0) {
    // collapsed: 마커 + 커서 가운데
    newText = lineText.slice(0, startOff) + left + right + lineText.slice(endOff);
    newStart = newEnd = startOff + left.length;
  } else if (selText.startsWith(left) && selText.endsWith(right)
             && selText.length >= left.length + right.length) {
    // unwrap A: selection 자체가 마커 포함
    const inner = selText.slice(left.length, selText.length - right.length);
    newText = lineText.slice(0, startOff) + inner + lineText.slice(endOff);
    newStart = startOff;
    newEnd = startOff + inner.length;
  } else if (startOff >= left.length
             && lineText.slice(startOff - left.length, startOff) === left
             && lineText.slice(endOff, endOff + right.length) === right) {
    // unwrap B: selection은 inner이고 주변에 마커 (wrap 직후 ⌘B 다시 누르는 케이스)
    newText = lineText.slice(0, startOff - left.length)
            + selText
            + lineText.slice(endOff + right.length);
    newStart = startOff - left.length;
    newEnd = newStart + selText.length;
  } else {
    // wrap
    newText = lineText.slice(0, startOff) + left + selText + right + lineText.slice(endOff);
    newStart = startOff + left.length;
    newEnd = newStart + selText.length;
  }

  replaceLineText(lineDiv, newText, newStart, newEnd);
  // execCommand의 input 이벤트가 notifySwift를 trigger하지만 명시적으로도 부른다.
  notifySwift();
}

function insertLinkShortcut() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return;

  const lineDiv = getCurrentLineDiv();
  if (!lineDiv) return;
  if (lineDiv.classList.contains('table-block')) return;
  if (!lineDiv.contains(range.endContainer)) return;

  const { startOff, endOff } = getLineCharRange(lineDiv, range);
  const lineText = lineDiv.textContent;
  const selText = lineText.slice(startOff, endOff);

  const labelText = selText || 'text';
  const placeholder = 'url';
  const replacement = `[${labelText}](${placeholder})`;
  const newText = lineText.slice(0, startOff) + replacement + lineText.slice(endOff);

  // selection 있었으면 url 부분, 없었으면 text 부분 선택
  let newStart, newEnd;
  if (selText) {
    newStart = startOff + `[${labelText}](`.length;
    newEnd = newStart + placeholder.length;
  } else {
    newStart = startOff + 1;  // '[' 다음
    newEnd = newStart + labelText.length;
  }

  replaceLineText(lineDiv, newText, newStart, newEnd);
  notifySwift();
}

editor.addEventListener('keydown', (e) => {
  // 순수 ⌘ + 단일키만 (Shift/Alt/Ctrl 조합 제외)
  if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === 'b') {
    e.preventDefault();
    wrapOrToggleSelection('**', '**');
  } else if (k === 'i') {
    e.preventDefault();
    wrapOrToggleSelection('*', '*');
  } else if (k === 'k') {
    e.preventDefault();
    insertLinkShortcut();
  }
});

editor.addEventListener('blur', () => {
  if (composing || !lastLineDiv) return;
  if (editor.contains(lastLineDiv)) {
    styleLine(lastLineDiv);
  }
  lastLineDiv = null;
});

// ----- Find / Replace (⌘F) -----

const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findReplace = document.getElementById('find-replace');
const findCount = document.getElementById('find-count');
const findCaseBtn = document.getElementById('find-case');
const findPrevBtn = document.getElementById('find-prev');
const findNextBtn = document.getElementById('find-next');
const findReplaceOneBtn = document.getElementById('find-replace-one');
const findReplaceAllBtn = document.getElementById('find-replace-all');
const findCloseBtn = document.getElementById('find-close');

const findState = {
  active: false,
  caseSensitive: false,
  matches: [],   // [{ lineDiv, startOff, length }]
  currentIdx: -1,
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearFindHighlights() {
  // mark.find-hit를 textnode로 풀고, 영향받은 라인은 styled로 재적용
  const lineSet = new Set();
  editor.querySelectorAll('mark.find-hit').forEach(m => {
    if (m.parentNode) {
      const line = m.closest('.line');
      if (line) lineSet.add(line);
      const tn = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(tn, m);
    }
  });
  // 텍스트노드 분할이 일어났을 수 있으니 normalize
  for (const line of lineSet) {
    line.normalize();
    if (line !== lastLineDiv && !line.classList.contains('table-block')) {
      styleLine(line);
    }
  }
}

function refreshFind() {
  clearFindHighlights();
  findState.matches = [];
  findState.currentIdx = -1;

  const query = findInput.value;
  if (!query) {
    findCount.textContent = '0/0';
    return;
  }

  const cs = findState.caseSensitive;
  const needle = cs ? query : query.toLowerCase();

  // 라인별 매치 수집
  for (const lineDiv of editor.children) {
    if (!lineDiv.classList.contains('line')) continue;
    if (lineDiv.classList.contains('table-block')) continue;
    const text = lineDiv.textContent;
    const haystack = cs ? text : text.toLowerCase();
    let from = 0;
    while (true) {
      const idx = haystack.indexOf(needle, from);
      if (idx < 0) break;
      findState.matches.push({ lineDiv, startOff: idx, length: query.length });
      from = idx + Math.max(needle.length, 1);
    }
  }

  // 매치 라인에 mark 삽입 (라인 단위로 배치)
  const byLine = new Map();
  for (const m of findState.matches) {
    if (!byLine.has(m.lineDiv)) byLine.set(m.lineDiv, []);
    byLine.get(m.lineDiv).push(m);
  }
  for (const [lineDiv, ms] of byLine) {
    renderLineWithMarks(lineDiv, ms);
  }

  if (findState.matches.length === 0) {
    findCount.textContent = '0/0';
    return;
  }
  moveToMatch(0);
}

function renderLineWithMarks(lineDiv, matches) {
  const text = lineDiv.textContent;
  matches.sort((a, b) => a.startOff - b.startOff);
  let html = '';
  let cursor = 0;
  for (const m of matches) {
    html += escapeHTML(text.slice(cursor, m.startOff));
    html += `<mark class="find-hit">${escapeHTML(text.slice(m.startOff, m.startOff + m.length))}</mark>`;
    cursor = m.startOff + m.length;
  }
  html += escapeHTML(text.slice(cursor));
  lineDiv.className = 'line';
  lineDiv.innerHTML = html || '<br>';
}

function moveToMatch(idx) {
  editor.querySelectorAll('mark.find-current').forEach(m => m.classList.remove('find-current'));
  if (idx < 0 || idx >= findState.matches.length) return;
  findState.currentIdx = idx;

  const m = findState.matches[idx];
  if (!editor.contains(m.lineDiv)) {
    refreshFind();
    return;
  }
  // 같은 라인 내 매치 인덱스 — sorted by startOff
  const sameLine = findState.matches.filter(x => x.lineDiv === m.lineDiv);
  const localIdx = sameLine.indexOf(m);
  const marks = m.lineDiv.querySelectorAll('mark.find-hit');
  if (marks[localIdx]) {
    marks[localIdx].classList.add('find-current');
    marks[localIdx].scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  findCount.textContent = `${idx + 1}/${findState.matches.length}`;
}

function findNext() {
  if (findState.matches.length === 0) return;
  moveToMatch((findState.currentIdx + 1) % findState.matches.length);
}

function findPrev() {
  if (findState.matches.length === 0) return;
  const n = findState.matches.length;
  moveToMatch((findState.currentIdx - 1 + n) % n);
}

function replaceCurrent() {
  if (findState.currentIdx < 0) return;
  const m = findState.matches[findState.currentIdx];
  if (!editor.contains(m.lineDiv)) return;

  // 라인을 mark 없는 raw text로 보고 (textContent), 매치 자리만 교체
  const text = m.lineDiv.textContent;
  const replacement = findReplace.value;
  const newText = text.slice(0, m.startOff) + replacement + text.slice(m.startOff + m.length);

  // execCommand로 라인 통째로 교체 → undo 호환
  const caretOff = m.startOff + replacement.length;
  replaceLineText(m.lineDiv, newText, caretOff, caretOff);
  notifySwift();

  // 매치 목록 재계산. 다음 매치로 자동 이동을 위해 currentIdx 보정 시도
  const prevIdx = findState.currentIdx;
  refreshFind();
  // refreshFind는 첫 매치로 이동시킴. 가능하면 prevIdx에 가까운 자리로
  if (findState.matches.length > 0) {
    const target = Math.min(prevIdx, findState.matches.length - 1);
    moveToMatch(target);
  }
}

function replaceAll() {
  const query = findInput.value;
  if (!query) return;
  const replacement = findReplace.value;
  const cs = findState.caseSensitive;
  const re = new RegExp(escapeRegex(query), cs ? 'g' : 'gi');

  // mark가 박혀있을 수 있으니 textContent 기준으로 비교 후 직접 textContent 교체.
  // 라인별로 모아서 한 번에 처리. (라인이 많은 경우 execCommand 반복은 무거움)
  let changedCount = 0;
  for (const lineDiv of editor.children) {
    if (!lineDiv.classList.contains('line')) continue;
    if (lineDiv.classList.contains('table-block')) continue;
    const text = lineDiv.textContent;
    const newText = text.replace(re, replacement);
    if (newText !== text) {
      lineDiv.className = 'line';
      lineDiv.textContent = newText;
      changedCount++;
    }
  }
  if (changedCount > 0) {
    notifySwift();
  }
  refreshFind();
}

function openOrFocusFind() {
  if (!findState.active) {
    findBar.classList.remove('hidden');
    findState.active = true;
  }
  findInput.focus();
  findInput.select();
  // 에디터에 selection이 있으면 그 텍스트를 검색어로 prefill
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const selText = sel.toString();
    if (selText && !selText.includes('\n')) {
      findInput.value = selText;
      findInput.select();
    }
  }
  refreshFind();
}

function closeFind() {
  if (!findState.active) return;
  findBar.classList.add('hidden');
  findState.active = false;
  clearFindHighlights();
  editor.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    openOrFocusFind();
  } else if (e.key === 'Escape' && findState.active) {
    e.preventDefault();
    closeFind();
  }
});

findInput.addEventListener('input', () => refreshFind());
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) findPrev(); else findNext();
  }
});
findReplace.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    replaceCurrent();
  }
});
findCaseBtn.addEventListener('click', () => {
  findState.caseSensitive = !findState.caseSensitive;
  findCaseBtn.classList.toggle('active', findState.caseSensitive);
  refreshFind();
});
findPrevBtn.addEventListener('click', findPrev);
findNextBtn.addEventListener('click', findNext);
findReplaceOneBtn.addEventListener('click', replaceCurrent);
findReplaceAllBtn.addEventListener('click', replaceAll);
findCloseBtn.addEventListener('click', closeFind);

// 외부에서 setText로 문서가 갈리면 매치 캐시 무효화 (refreshFind는 활성 시에만)
const _origSetText = window.appBridge.setText;
window.appBridge.setText = function(text) {
  _origSetText(text);
  if (findState.active) refreshFind();
};

// 초기
editor.innerHTML = '<div class="line"><br></div>';
