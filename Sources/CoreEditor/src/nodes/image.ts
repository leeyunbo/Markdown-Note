import { EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { parseAltAndSize, imageSrcForRender } from './image-utils';
import { docFolderEffect, docFolderField } from '../plugins/doc-folder';

export class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly src: string,
    readonly width: number | null,
    readonly height: number | null,
    readonly docFolderURL: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      other.alt === this.alt &&
      other.src === this.src &&
      other.width === this.width &&
      other.height === this.height &&
      other.docFolderURL === this.docFolderURL
    );
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'md-image-wrap';
    wrap.contentEditable = 'false';
    const img = document.createElement('img');
    img.className = 'md-image';
    img.src = imageSrcForRender(this.src, this.docFolderURL);
    img.alt = this.alt;
    img.loading = 'lazy';
    img.draggable = false;
    if (this.width) img.width = this.width;
    if (this.height) img.height = this.height;
    img.onerror = () => {
      wrap.classList.add('md-image-error');
      wrap.dataset.failedSrc = img.src;
    };
    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildImageDecorations(state: EditorState) {
  const builder: any[] = [];
  const re = /^\s*!\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)\s*$/;
  const docFolderURL = state.field(docFolderField, false) ?? '';
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const m = line.text.match(re);
    if (!m) continue;
    const { alt, width, height } = parseAltAndSize(m[1] ?? '');
    const src = (m[2] ?? '').split(/\s+/)[0] ?? '';
    const widget = Decoration.widget({
      widget: new ImageWidget(alt, src, width, height, docFolderURL),
      side: 1,
      block: true,
    });
    builder.push(widget.range(line.to));
  }
  return Decoration.set(builder, true);
}

export const imageField = StateField.define({
  create(state) {
    return buildImageDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged) return buildImageDecorations(tr.state);
    for (const e of tr.effects) {
      if (e.is(docFolderEffect)) return buildImageDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});
