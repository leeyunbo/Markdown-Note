export interface ParsedAlt {
  alt: string;
  width: number | null;
  height: number | null;
}

/** Parses `caption|320` or `caption|320x240` syntax embedded in markdown image alt text. */
export function parseAltAndSize(rawAlt: string): ParsedAlt {
  const m = rawAlt.match(/^(.*)\|(\d+)(?:x(\d+))?$/);
  if (m) {
    return {
      alt: m[1] ?? '',
      width: parseInt(m[2] ?? '0', 10),
      height: m[3] ? parseInt(m[3], 10) : null,
    };
  }
  return { alt: rawAlt, width: null, height: null };
}

/** Resolves an image src for rendering. Absolute URLs pass through; relative paths
 *  are resolved against the document folder URL. */
export function imageSrcForRender(src: string, docFolderURL: string): string {
  if (/^(https?:|file:|data:)/i.test(src)) return src;
  const looksEncoded = /%[0-9A-Fa-f]{2}/.test(src);
  const encoded = looksEncoded ? src : encodeURI(src);
  if (encoded.startsWith('/')) return 'file://' + encoded;
  if (!docFolderURL) return encoded;
  return docFolderURL + encoded;
}
