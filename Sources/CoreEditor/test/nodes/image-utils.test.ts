import { parseAltAndSize, imageSrcForRender } from '../../src/nodes/image-utils';

describe('parseAltAndSize', () => {
  it('returns alt with no size when no pipe', () => {
    expect(parseAltAndSize('hello')).toEqual({ alt: 'hello', width: null, height: null });
  });

  it('parses width only when pipe + integer', () => {
    expect(parseAltAndSize('caption|320')).toEqual({ alt: 'caption', width: 320, height: null });
  });

  it('parses width x height', () => {
    expect(parseAltAndSize('caption|320x240')).toEqual({ alt: 'caption', width: 320, height: 240 });
  });

  it('does not parse trailing pipe-non-digit as size', () => {
    expect(parseAltAndSize('a|b')).toEqual({ alt: 'a|b', width: null, height: null });
  });

  it('keeps empty alt', () => {
    expect(parseAltAndSize('|100')).toEqual({ alt: '', width: 100, height: null });
  });

  it('captures all pipes except the trailing size in alt (greedy match)', () => {
    expect(parseAltAndSize('pipe|in|middle|320')).toEqual({
      alt: 'pipe|in|middle',
      width: 320,
      height: null,
    });
  });
});

describe('imageSrcForRender', () => {
  it('returns http url as-is', () => {
    expect(imageSrcForRender('http://example.com/a.png', '')).toBe('http://example.com/a.png');
  });

  it('returns https url as-is', () => {
    expect(imageSrcForRender('https://example.com/a.png', '')).toBe('https://example.com/a.png');
  });

  it('returns file url as-is', () => {
    expect(imageSrcForRender('file:///tmp/a.png', '')).toBe('file:///tmp/a.png');
  });

  it('returns data url as-is', () => {
    expect(imageSrcForRender('data:image/png;base64,AAA', '')).toBe('data:image/png;base64,AAA');
  });

  it('prepends file:// to absolute path when no docFolder', () => {
    expect(imageSrcForRender('/tmp/a.png', '')).toBe('file:///tmp/a.png');
  });

  it('preserves already-encoded paths', () => {
    expect(imageSrcForRender('attachments/a%20b.png', 'file:///docs/')).toBe('file:///docs/attachments/a%20b.png');
  });

  it('URI-encodes paths with spaces', () => {
    expect(imageSrcForRender('attachments/a b.png', 'file:///docs/')).toBe('file:///docs/attachments/a%20b.png');
  });

  it('returns relative path unchanged when docFolder empty', () => {
    expect(imageSrcForRender('a.png', '')).toBe('a.png');
  });

  it('concatenates docFolder with encoded path', () => {
    expect(imageSrcForRender('sub/a.png', 'file:///docs/')).toBe('file:///docs/sub/a.png');
  });
});
