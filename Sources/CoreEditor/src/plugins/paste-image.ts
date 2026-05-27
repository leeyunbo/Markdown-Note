import { EditorView } from '@codemirror/view';
import { postImageDropped } from '../bridge/outgoing';

/** Attach a paste listener that forwards clipboard images to Swift. */
export function installPasteImageHandler(view: EditorView): void {
  view.dom.addEventListener(
    'paste',
    (e: Event) => {
      const ev = e as ClipboardEvent;
      if (!ev.clipboardData) return;
      for (const item of Array.from(ev.clipboardData.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            ev.preventDefault();
            ev.stopPropagation();
            void postImageDroppedFromFile(file);
            return;
          }
        }
      }
    },
    true,
  );
}

function postImageDroppedFromFile(file: File): Promise<void> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        postImageDropped(result, file.name || 'image.png');
      }
      resolve();
    };
    reader.readAsDataURL(file);
  });
}
