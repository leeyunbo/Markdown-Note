import { listPrefixFor } from '../../src/commands/ime-list-continue';

describe('listPrefixFor', () => {
  it('returns bullet prefix', () => {
    expect(listPrefixFor('- foo')).toBe('- ');
  });

  it('returns bullet prefix with indent', () => {
    expect(listPrefixFor('   * foo')).toBe('   * ');
  });

  it('returns numbered prefix incrementing the number', () => {
    expect(listPrefixFor('1. one')).toBe('2. ');
    expect(listPrefixFor('  7. seven')).toBe('  8. ');
  });

  it('returns checkbox prefix as unchecked', () => {
    expect(listPrefixFor('- [ ] todo')).toBe('- [ ] ');
    expect(listPrefixFor('- [x] done')).toBe('- [ ] ');
    expect(listPrefixFor('  + [X] cap')).toBe('  + [ ] ');
  });

  it('returns null for plain text', () => {
    expect(listPrefixFor('hello')).toBeNull();
  });

  it('returns null for heading', () => {
    expect(listPrefixFor('# heading')).toBeNull();
  });

  it('returns null when not at list-marker start', () => {
    expect(listPrefixFor('text - notlist')).toBeNull();
  });
});
