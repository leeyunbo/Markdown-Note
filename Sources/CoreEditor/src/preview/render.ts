/** Refract PREVIEW renderer.
 *
 *  doc 문자열을 받아 marked.js로 HTML 생성 → 코드블록은 highlight.js로 토큰화 →
 *  preview-host innerHTML에 반영.
 *
 *  marked + highlight는 editor.html에서 `<script src="vendor/...">`로 로드됨 →
 *  window.marked, window.hljs로 접근. */

interface MarkedFn {
  parse(text: string): string;
  setOptions?(opts: Record<string, unknown>): void;
}
interface HighlightJs {
  highlight(code: string, opts: { language: string; ignoreIllegals?: boolean }): { value: string };
  highlightAuto(code: string): { value: string };
  getLanguage(name: string): unknown;
}

declare global {
  interface Window {
    marked?: MarkedFn;
    hljs?: HighlightJs;
  }
}

let configured = false;

function ensureMarkedConfigured(): void {
  if (configured) return;
  const marked = window.marked;
  if (!marked || !marked.setOptions) return;
  marked.setOptions({
    gfm: true,
    breaks: false,
    highlight(code: string, lang: string) {
      const hljs = window.hljs;
      if (!hljs) return code;
      try {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        }
        return hljs.highlightAuto(code).value;
      } catch (_) {
        return code;
      }
    },
  } as Record<string, unknown>);
  configured = true;
}

/** Wrap each <pre><code> with a header chrome (lang chip + copy label) + lined gutter. */
function decorateCodeBlocks(html: string): string {
  if (typeof document === 'undefined') return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;
    // detect language
    const cls = Array.from(code.classList).find((c) => c.startsWith('language-'));
    const lang = cls ? cls.slice('language-'.length) : '';

    // Build header
    const header = document.createElement('div');
    header.className = 'code-header';
    const chip = document.createElement('span');
    chip.className = 'lang-chip';
    chip.textContent = lang || 'text';
    const copy = document.createElement('span');
    copy.className = 'copy-label';
    copy.textContent = 'copy';
    copy.dataset.action = 'copy-code';
    header.appendChild(chip);
    header.appendChild(copy);
    pre.insertBefore(header, code);

    // Wrap each line in line-number + line-content
    const raw = code.innerHTML;
    const lines = raw.split('\n');
    // 마지막 라인이 빈 줄이면 제외 (코드블록 닫는 ``` 직전 newline 효과)
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const out = lines
      .map(
        (ln, i) =>
          `<span class="line-number">${i + 1}</span><span class="line-content">${ln || ' '}</span>`,
      )
      .join('\n');
    code.innerHTML = out;
  });
  return tmp.innerHTML;
}

/** Render markdown to HTML and inject into the preview host. */
export function renderPreview(host: HTMLElement, markdown: string): void {
  ensureMarkedConfigured();
  const marked = window.marked;
  if (!marked) {
    host.textContent = markdown;
    return;
  }
  let html = '';
  try {
    html = marked.parse(markdown);
  } catch (e) {
    host.textContent = markdown;
    return;
  }
  host.innerHTML = decorateCodeBlocks(html);
  // Task list — marked GFM이 만든 <input type=checkbox>를 부모 <li>로 토글 표시 보강.
  host.querySelectorAll('li').forEach((li) => {
    const checkbox = li.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    li.classList.add('task-list-item');
    if ((checkbox as HTMLInputElement).checked) li.classList.add('checked');
  });
  // Copy chip 클릭 핸들러
  host.querySelectorAll('[data-action="copy-code"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const pre = target.closest('pre');
      const code = pre?.querySelector('code');
      if (!code) return;
      const lines = code.querySelectorAll('.line-content');
      const text = Array.from(lines).map((l) => l.textContent ?? '').join('\n');
      navigator.clipboard?.writeText(text);
      const original = target.textContent;
      target.textContent = 'copied!';
      target.style.color = 'var(--syn-type)';
      setTimeout(() => {
        target.textContent = original ?? 'copy';
        target.style.color = '';
      }, 1400);
    });
  });
}

/** 60ms 디바운스 wrapper — 타이핑 중 너무 자주 렌더링되지 않게. */
export function makeDebouncedRender(host: HTMLElement, delayMs = 60): (md: string) => void {
  let timer: number | null = null;
  let pending: string | null = null;
  return (md: string) => {
    pending = md;
    if (timer != null) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (pending != null) {
        const text = pending;
        pending = null;
        renderPreview(host, text);
      }
    }, delayMs);
  };
}
