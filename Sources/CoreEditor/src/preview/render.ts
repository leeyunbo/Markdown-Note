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
// window.mermaid 타입은 nodes/mermaid.ts에서 이미 declare. 여기선 재사용만.

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
  // 신버전 marked는 `highlight` 옵션을 무시한다 → 토큰화는 decorateCodeBlocks에서 직접.
  marked.setOptions({ gfm: true, breaks: false } as Record<string, unknown>);
  configured = true;
}

/** Wrap each <pre><code> with a header chrome (lang chip + copy label) + lined gutter.
 *  ```mermaid 블록은 별도 처리 — mermaid.render로 SVG. */
function decorateCodeBlocks(html: string): string {
  if (typeof document === 'undefined') return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;
    const cls = Array.from(code.classList).find((c) => c.startsWith('language-'));
    const lang = cls ? cls.slice('language-'.length) : '';

    // Mermaid block → SVG render. 헤더 chip은 'mermaid' 유지.
    if (lang === 'mermaid') {
      const defText = code.textContent ?? '';
      pre.classList.add('mermaid-pre');
      pre.innerHTML = '';
      const header = document.createElement('div');
      header.className = 'code-header';
      const chip = document.createElement('span');
      chip.className = 'lang-chip';
      chip.textContent = 'mermaid';
      header.appendChild(chip);
      pre.appendChild(header);
      const svgHost = document.createElement('div');
      svgHost.className = 'mermaid-host';
      pre.appendChild(svgHost);
      const id = 'mmd-' + Math.random().toString(36).slice(2);
      window.mermaid
        ?.render(id, defText)
        .then((res) => { svgHost.innerHTML = res.svg; })
        .catch((e: unknown) => { svgHost.textContent = `mermaid error: ${String(e)}`; });
      return;
    }

    // 일반 코드블록(달필 책 카드): 세리프 언어 라벨만. 줄번호/copy 없음.
    const header = document.createElement('div');
    header.className = 'code-header';
    const chip = document.createElement('span');
    chip.className = 'lang-chip';
    chip.textContent = lang || 'text';
    header.appendChild(chip);
    pre.insertBefore(header, code);

    // highlight.js를 직접 적용 — 번들된 marked는 `highlight` 옵션을 무시(신버전)하므로
    // 여기서 토큰화해야 hljs-* span(→ CSS 토큰색)이 생긴다.
    const hljs = window.hljs;
    const raw = code.textContent ?? '';
    if (hljs && raw.trim().length > 0) {
      try {
        const res =
          lang && hljs.getLanguage(lang)
            ? hljs.highlight(raw, { language: lang, ignoreIllegals: true })
            : hljs.highlightAuto(raw);
        code.innerHTML = res.value;
        code.classList.add('hljs');
      } catch (_) {
        /* 실패 시 marked가 escape해둔 원문 유지 */
      }
    }
  });
  return tmp.innerHTML;
}

/** 깨진 이미지 fallback — `<img>` onerror에서 placeholder div로 교체. */
function attachImageFallback(host: HTMLElement): void {
  host.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      const alt = img.alt || 'image';
      const src = img.src.split('/').pop() ?? '';
      const wrap = document.createElement('div');
      wrap.className = 'img-placeholder';
      wrap.innerHTML = `<div class="ph-body">image · ${alt}</div><div class="ph-caption">↳ ${src}</div>`;
      img.replaceWith(wrap);
    }, { once: true });
  });
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
  attachImageFallback(host);
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
