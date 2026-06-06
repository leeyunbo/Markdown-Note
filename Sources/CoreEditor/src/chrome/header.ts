/** Refract header chrome — view-mode 세그먼트 + 테마 popover + 파일명 + counter pill.
 *
 *  Swift bridge:
 *    - 테마 변경 시 documentElement.dataset.theme 박고 localStorage 저장
 *    - view-mode 변경 시 #refract-shell.dataset.viewMode 박고 localStorage 저장
 *    - 파일명 변경 시 .r-filename textContent 갱신 (별도 setter)
 *    - dirty 변경 시 body.dataset.dirty 변경
 */

type ViewMode = 'source' | 'split' | 'preview';
type ThemeKey = 'night' | 'day' | 'sepia' | 'forest' | 'paper';

const THEME_LABELS: Record<ThemeKey, string> = {
  night: 'Night',
  day: 'Day',
  sepia: 'Sepia',
  forest: 'Forest',
  paper: '손글씨',
};
const THEME_KEYS: ThemeKey[] = ['night', 'day', 'sepia', 'forest', 'paper'];

function isThemeKey(s: string): s is ThemeKey {
  return THEME_KEYS.includes(s as ThemeKey);
}

interface HeaderHooks {
  onViewModeChange?(mode: ViewMode): void;
  onThemeChange?(key: ThemeKey): void;
}

export function installHeader(hooks: HeaderHooks = {}): {
  setFilename(name: string): void;
  setDirty(d: boolean): void;
  setTheme(key: ThemeKey): void;
  setViewMode(mode: ViewMode): void;
} {
  const shell = document.getElementById('refract-shell');
  const toggle = document.getElementById('r-view-toggle');
  const themeButton = document.getElementById('r-theme-button');
  const themeButtonLabel = themeButton?.querySelector('.label');
  const themeButtonSwatch = themeButton?.querySelector('.swatch') as HTMLElement | null;
  const popover = document.getElementById('theme-popover');
  const filenameEl = document.querySelector('.r-filename');

  // View-mode 토글
  toggle?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as ViewMode | undefined;
      if (!mode) return;
      applyViewMode(mode);
      try { localStorage.setItem('refract.viewMode', mode); } catch (_) { /* ignore */ }
      hooks.onViewModeChange?.(mode);
    });
  });

  function applyViewMode(mode: ViewMode) {
    if (shell) shell.dataset.viewMode = mode;
    toggle?.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  // 테마 popover
  themeButton?.addEventListener('click', (e) => {
    e.stopPropagation();
    popover?.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!popover?.classList.contains('open')) return;
    const target = e.target as Node;
    if (popover.contains(target) || themeButton?.contains(target)) return;
    popover.classList.remove('open');
  });
  popover?.querySelectorAll('.row').forEach((row) => {
    row.addEventListener('click', () => {
      const key = (row as HTMLElement).dataset.key;
      if (!key || !isThemeKey(key)) return;
      applyTheme(key);
      try { localStorage.setItem('refract.theme', key); } catch (_) { /* ignore */ }
      hooks.onThemeChange?.(key);
      popover.classList.remove('open');
    });
  });

  function applyTheme(key: ThemeKey) {
    document.documentElement.dataset.theme = key;
    if (themeButtonLabel) themeButtonLabel.textContent = THEME_LABELS[key];
    if (themeButtonSwatch) {
      // CSS var 사용 — 현재 테마의 --accent로 갱신됨 (CSS cascade 자동)
      themeButtonSwatch.style.background = 'var(--accent)';
    }
    popover?.querySelectorAll('.row').forEach((r) => {
      r.classList.toggle('active', (r as HTMLElement).dataset.key === key);
    });
  }

  // 초기 상태 복원
  try {
    const savedMode = localStorage.getItem('refract.viewMode');
    if (savedMode === 'source' || savedMode === 'split' || savedMode === 'preview') {
      applyViewMode(savedMode);
    } else {
      applyViewMode('split');
    }
    const savedTheme = localStorage.getItem('refract.theme');
    if (savedTheme && isThemeKey(savedTheme)) applyTheme(savedTheme);
    else applyTheme('night');
  } catch (_) {
    applyViewMode('split');
    applyTheme('night');
  }

  return {
    setFilename(name: string) {
      if (filenameEl) filenameEl.textContent = name || 'Untitled';
    },
    setDirty(d: boolean) {
      document.body.dataset.dirty = d ? '1' : '';
    },
    setTheme: applyTheme,
    setViewMode: applyViewMode,
  };
}

/** Word counter pill 업데이트. doc 텍스트를 받아 단어 수 세고, 입력 중 표시. */
export function installCounter(): { update(text: string): void } {
  const countEl = document.querySelector('#counter-pill .count');
  let typingTimer: number | null = null;
  function setTyping(on: boolean) {
    document.body.dataset.typing = on ? '1' : '';
  }
  return {
    update(text: string) {
      const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
      if (countEl) countEl.textContent = String(words);
      setTyping(true);
      if (typingTimer != null) window.clearTimeout(typingTimer);
      typingTimer = window.setTimeout(() => {
        setTyping(false);
        typingTimer = null;
      }, 900);
    },
  };
}
