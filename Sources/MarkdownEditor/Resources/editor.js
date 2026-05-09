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
  html = html.replace(/^(\s*)([-*+]|\d+\.)(\s)/, (_, sp, mk, rest) =>
    `${sp}<span class="list-marker">${mk}</span>${rest}`);
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

// 라인 하나만 styled로 (in-place). 단, 떠난 라인이 표 그룹의 일부면 그룹 전체를 table로 합침.
function styleLine(lineDiv, opts) {
  // table-block은 이미 렌더된 표이므로 절대 건드리지 않음
  if (lineDiv.classList && lineDiv.classList.contains('table-block')) return;
  opts = opts || {};
  const text = (opts.text !== undefined) ? opts.text : lineDiv.textContent;
  const inFence = !!opts.inFence;

  if (isFenceMarker(text)) {
    lineDiv.className = 'line';
    lineDiv.innerHTML = `<span class="marker">${escapeHTML(text)}</span>`;
    return;
  }
  if (inFence) {
    lineDiv.className = 'line codeblock';
    lineDiv.innerHTML = escapeHTML(text) || '<br>';
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
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (isFenceMarker(line)) {
      inFence = !inFence;
      html += `<div class="line"><span class="marker">${escapeHTML(line)}</span></div>`;
      i++;
      continue;
    }
    if (inFence) {
      html += `<div class="line codeblock">${escapeHTML(line) || '<br>'}</div>`;
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
    html += `<div class="line">${highlightInline(line) || '<br>'}</div>`;
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

function getPlainText() {
  // table-block은 dataset.raw에 raw markdown을 보존 (innerText는 cell 텍스트만)
  const out = [];
  for (const child of editor.children) {
    if (child.classList && child.classList.contains('table-block')) {
      out.push(decodeRaw(child.dataset.raw || ''));
    } else {
      out.push(child.textContent || '');
    }
  }
  return out.join('\n');
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
  notifySwift();
});

editor.addEventListener('input', () => {
  if (isApplyingExternal) return;
  notifySwift();
});

// 떠난 라인만 styled로. 진입 라인은 그대로 둬서 layout shift 방지.
function handleLineFocusChange() {
  if (composing || isApplyingExternal) return;
  const cur = getCurrentLineDiv();
  if (!cur) return;
  if (cur === lastLineDiv) return;

  if (lastLineDiv && editor.contains(lastLineDiv) && lastLineDiv !== cur) {
    styleLine(lastLineDiv);
  }
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

  lineDiv.className = 'line';
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

// Tab 키: 다음 셀로 이동
editor.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const cell = e.target.closest && e.target.closest('th, td');
  if (!cell) return;
  e.preventDefault();
  const cells = cell.closest('table').querySelectorAll('th, td');
  const arr = Array.from(cells);
  const idx = arr.indexOf(cell);
  const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
  if (nextIdx >= 0 && nextIdx < arr.length) {
    arr[nextIdx].focus();
    // 셀 전체 선택
    const r = document.createRange();
    r.selectNodeContents(arr[nextIdx]);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
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

// selectionchange는 너무 자주 발동 — 명시적 이동(방향키/클릭/포커스)에만 처리
const NAV_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'Tab'
]);
editor.addEventListener('keyup', (e) => {
  if (NAV_KEYS.has(e.key)) handleLineFocusChange();
});
editor.addEventListener('mouseup', () => {
  handleLineFocusChange();
});
editor.addEventListener('focus', () => {
  handleLineFocusChange();
});

// Enter 키: contenteditable의 자동 동작 대신 우리가 직접 라인 추가
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

    // 떠나는 현재 라인 → styled
    cur.className = 'line';
    cur.textContent = before;
    styleLine(cur);

    // 새 라인 — 항상 textnode를 두어 cursor가 안전하게 들어가도록
    const newLine = document.createElement('div');
    newLine.className = 'line';
    const tn = document.createTextNode(after);
    newLine.appendChild(tn);
    cur.parentNode.insertBefore(newLine, cur.nextSibling);

    const r = document.createRange();
    r.setStart(tn, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    newLine.scrollIntoView({ block: 'nearest' });

    lastLineDiv = newLine;
    notifySwift();
  }
});

editor.addEventListener('blur', () => {
  if (composing || !lastLineDiv) return;
  if (editor.contains(lastLineDiv)) {
    styleLine(lastLineDiv);
  }
  lastLineDiv = null;
});

// 초기
editor.innerHTML = '<div class="line"><br></div>';
