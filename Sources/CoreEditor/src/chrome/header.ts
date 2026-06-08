/** 달필 (Dalpil) header chrome — Tweaks popover + view-mode 세그먼트 + 파일명/dirty,
 *  그리고 하단 status bar(단어수·저장상태·잉크 게이지) + 빈 문서 환영 화면.
 *
 *  단일 소스는 Swift(AppState). 사용자가 popover/toggle을 누르면 즉시 로컬 적용 +
 *  Swift로 메시지(setTweak / viewModeChanged)를 보내 영속화한다. Swift가 메뉴 등
 *  다른 경로로 값을 바꾸면 bridge(setHandFont/setPaperTexture/setTokenVisibility/
 *  setViewMode)를 호출해 DOM과 popover 활성 상태를 갱신한다. */

type ViewMode = 'note' | 'split' | 'book';
type HandKey = 'gaegu' | 'nanumpen' | 'gowun';

const HAND_CSS: Record<HandKey, string> = {
  gaegu: '"Gaegu", cursive',
  nanumpen: '"Nanum Pen Script", cursive',
  gowun: '"Gowun Batang", serif',
};

// 폰트마다 같은 px라도 글리프 크기가 달라 시각 크기를 맞춘다(줄높이 38은 유지).
// 펜(Nanum Pen)은 가늘고 작아 26이 적당, 개구·정자는 글리프가 커서 줄인다.
const HAND_SIZE: Record<HandKey, string> = {
  gaegu: '21px',
  nanumpen: '26px',
  gowun: '20px',
};

function postToHost(name: string, body: unknown): void {
  try {
    const w = window as unknown as {
      webkit?: { messageHandlers?: Record<string, { postMessage(b: unknown): void }> };
    };
    w.webkit?.messageHandlers?.[name]?.postMessage(body);
  } catch (_) { /* host 없음(브라우저 프리뷰) */ }
}

export interface HeaderHandle {
  setFilename(name: string): void;
  setDirty(d: boolean): void;
  setViewMode(mode: string): void;
  setHandFont(key: string): void;
  setPaperTexture(key: string): void;
  setTokenVisibility(key: string): void;
}

export function installHeader(): HeaderHandle {
  const shell = document.getElementById('refract-shell');
  const toggle = document.getElementById('r-view-toggle');
  const tweaksButton = document.getElementById('r-tweaks-button');
  const popover = document.getElementById('tweaks-popover');
  const filenameEl = document.querySelector('.r-filename');
  const sourceColumn = document.getElementById('source-column');
  const saveEl = document.querySelector('#status-bar .sb-save');

  // ── view mode (노트 / 나란히 / 책) ──────────────────────────
  function applyViewMode(mode: string) {
    if (shell) shell.dataset.viewMode = mode;
    toggle?.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }
  toggle?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as ViewMode | undefined;
      if (!mode) return;
      applyViewMode(mode);
      postToHost('viewModeChanged', mode);
    });
  });

  // ── Tweaks popover ──────────────────────────────────────────
  tweaksButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    popover?.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!popover?.classList.contains('open')) return;
    const t = e.target as Node;
    if (popover.contains(t) || tweaksButton?.contains(t)) return;
    popover.classList.remove('open');
  });

  function markSeg(key: string, value: string) {
    popover?.querySelectorAll(`.seg[data-key="${key}"] button`).forEach((b) => {
      b.classList.toggle('on', (b as HTMLElement).dataset.v === value);
    });
  }
  function applyHand(key: string) {
    const css = HAND_CSS[key as HandKey] ?? HAND_CSS.gaegu;
    const size = HAND_SIZE[key as HandKey] ?? '26px';
    document.documentElement.style.setProperty('--hand', css);
    document.documentElement.style.setProperty('--hand-size', size);
    markSeg('hand', key);
  }
  function applyPaper(key: string) {
    if (sourceColumn) sourceColumn.dataset.paper = key;
    markSeg('paper', key);
  }
  function applyTok(key: string) {
    document.body.dataset.tok = key;
    markSeg('tok', key);
  }

  popover?.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const key = (seg as HTMLElement).dataset.key;
      const val = btn.dataset.v;
      if (!key || !val) return;
      if (key === 'hand') applyHand(val);
      else if (key === 'paper') applyPaper(val);
      else if (key === 'tok') applyTok(val);
      postToHost('setTweak', { key, value: val });
    });
  });

  return {
    setFilename(name: string) {
      if (filenameEl) filenameEl.textContent = name || 'Untitled';
    },
    setDirty(d: boolean) {
      document.body.dataset.dirty = d ? '1' : '';
      if (saveEl) saveEl.textContent = d ? '저장 안 됨' : '방금 저장됨';
    },
    setViewMode: applyViewMode,
    setHandFont: applyHand,
    setPaperTexture: applyPaper,
    setTokenVisibility: applyTok,
  };
}

/** 하단 status bar — 단어수 · 잉크 게이지(5점) + 빈 문서 환영 토글. */
export function installCounter(): { update(text: string): void } {
  const wordsEl = document.querySelector('#status-bar .sb-words');
  const inkDots = document.querySelectorAll('#status-bar .ink-dots i');
  const body = document.getElementById('refract-body');

  return {
    update(text: string) {
      const trimmed = text.trim();
      const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
      if (wordsEl) wordsEl.textContent = `${words} 단어`;
      const level = Math.min(5, Math.round(words / 9));
      inkDots.forEach((d, i) => d.classList.toggle('on', i < level));
      // 빈 문서 환영 화면
      body?.classList.toggle('empty', trimmed.length === 0);
    },
  };
}
