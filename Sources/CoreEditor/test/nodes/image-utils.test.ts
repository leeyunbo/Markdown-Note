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

  it('returns relative path with no docFolder as-is (kills !docFolderURL→false mutant)', () => {
    // docFolderURL is empty; encoded relative path should be returned as-is
    expect(imageSrcForRender('img.png', '')).toBe('img.png');
    expect(imageSrcForRender('sub/img.png', '')).toBe('sub/img.png');
  });

  it('returns https url as-is even without http-specific test (kills if(false) mutant)', () => {
    // Already covered but mutant survived — add assertion that checks the actual return value
    const src = 'https://cdn.example.com/a.png?x=1&y=2';
    expect(imageSrcForRender(src, 'file:///docs/')).toBe(src);
  });

  it('does not pass through a path containing a protocol in the middle (kills ^ removal mutant)', () => {
    // Without ^ anchor, "path/http://x" would match the protocol regex and return as-is
    // With ^ anchor, it correctly treats this as a relative path to be encoded
    const result = imageSrcForRender('path/http://x.png', 'file:///docs/');
    expect(result).toBe('file:///docs/path/http://x.png');
  });

  it('does not treat %X as encoded (kills /%[0-9A-Fa-f]{2}/ → single-char mutant)', () => {
    // "%z" has only 1 hex-ish char, not a valid percent-encoding — should be encoded
    // "%3" is only 1 hex char after %, not 2, so NOT already-encoded → should encode
    expect(imageSrcForRender('path%3img.png', 'file:///docs/')).toBe(
      'file:///docs/' + encodeURI('path%3img.png'),
    );
  });

  it('treats valid 2-hex-char percent-encoding as already encoded (keeps it as-is)', () => {
    // "%3D" is valid 2-hex encoding — should not double-encode
    expect(imageSrcForRender('path%3Dimg.png', 'file:///docs/')).toBe(
      'file:///docs/path%3Dimg.png',
    );
  });
});

describe('parseAltAndSize — regex anchor coverage', () => {
  it('does not match size when trailing non-digit chars exist (kills $ removal mutant)', () => {
    // "abc|320xyz" — the regex has `$`, so it does NOT match (trailing xyz prevents match)
    // Without `$`, regex would match and return {alt:"abc", width:320}
    expect(parseAltAndSize('abc|320xyz')).toEqual({ alt: 'abc|320xyz', width: null, height: null });
  });

  it('does not match WxH when trailing non-digit chars exist after height (kills $ removal)', () => {
    // "abc|320x240extra" — must not parse as dimensions
    expect(parseAltAndSize('abc|320x240extra')).toEqual({ alt: 'abc|320x240extra', width: null, height: null });
  });
});
