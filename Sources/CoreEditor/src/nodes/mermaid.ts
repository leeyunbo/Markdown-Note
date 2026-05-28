import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

declare global {
  interface Window {
    mermaid?: {
      render(id: string, src: string): Promise<{ svg: string }>;
    };
  }
}

export const toggleMermaidEffect = StateEffect.define<{ pos: number; on: boolean }>();

export const mermaidActiveField = StateField.define<Set<string>>({
  create() {
    return new Set();
  },
  update(value, tr) {
    let next = value;
    for (const e of tr.effects) {
      if (e.is(toggleMermaidEffect)) {
        next = new Set(next);
        const key = String(e.value.pos);
        if (e.value.on) next.add(key);
        else next.delete(key);
      }
    }
    if (tr.docChanged) {
      // Doc changes can shift positions; reset conservatively.
      return new Set();
    }
    return next;
  },
});

class MermaidToggleWidget extends WidgetType {
  constructor(readonly active: boolean, readonly pos: number) {
    super();
  }
  eq(o: MermaidToggleWidget): boolean {
    return o.active === this.active && o.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'md-mermaid-toggle';
    btn.type = 'button';
    btn.contentEditable = 'false';
    btn.textContent = this.active ? '◧ 코드 보기' : '▦ 다이어그램 보기';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        effects: toggleMermaidEffect.of({ pos: this.pos, on: !this.active }),
      });
    };
    return btn;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

class MermaidRenderWidget extends WidgetType {
  constructor(readonly src: string, readonly key: string) {
    super();
  }
  eq(o: MermaidRenderWidget): boolean {
    return o.src === this.src && o.key === this.key;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'md-mermaid-render';
    wrap.contentEditable = 'false';
    if (!window.mermaid) {
      wrap.className = 'md-mermaid-error';
      wrap.textContent = 'mermaid library not loaded';
      return wrap;
    }
    const id = 'mmd_' + Math.random().toString(36).slice(2);
    window.mermaid
      .render(id, this.src)
      .then(({ svg }) => {
        wrap.innerHTML = svg;
      })
      .catch((err: unknown) => {
        wrap.className = 'md-mermaid-error';
        const msg = err instanceof Error ? err.message : String(err);
        wrap.textContent = 'mermaid error: ' + msg;
      });
    return wrap;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

function buildMermaidDecorations(state: EditorState) {
  const builder: any[] = [];
  const tree = syntaxTree(state);
  const doc = state.doc;
  const active = state.field(mermaidActiveField, false) ?? new Set<string>();
  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return;
      const startLine = doc.lineAt(node.from);
      const endLine = doc.lineAt(node.to);
      const m = startLine.text.match(/^\s*(?:```|~~~)\s*(\w+)/);
      if (!m || (m[1] ?? '').toLowerCase() !== 'mermaid') return;
      const key = String(startLine.from);
      const isActive = active.has(key);
      builder.push(
        Decoration.widget({
          widget: new MermaidToggleWidget(isActive, startLine.from),
          side: -1,
          block: true,
        }).range(startLine.from),
      );
      if (isActive) {
        for (let n = startLine.number; n <= endLine.number; n++) {
          const line = doc.line(n);
          builder.push(
            Decoration.line({ class: 'cm-mermaid-hidden' }).range(line.from),
          );
        }
        const body = doc.sliceString(startLine.to, endLine.from).trim();
        builder.push(
          Decoration.widget({
            widget: new MermaidRenderWidget(body, key),
            side: 1,
            block: true,
          }).range(endLine.to),
        );
      }
    },
  });
  return Decoration.set(builder, true);
}

export const mermaidDecoField = StateField.define({
  create(state) {
    return buildMermaidDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged) return buildMermaidDecorations(tr.state);
    for (const e of tr.effects) {
      if (e.is(toggleMermaidEffect)) return buildMermaidDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});
