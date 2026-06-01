import { squiggleClassForHeading } from '../../src/nodes/heading-squiggle';

describe('squiggleClassForHeading', () => {
  it('returns h1 class for ATXHeading1', () => {
    expect(squiggleClassForHeading('ATXHeading1')).toBe('cm-md-squiggle-h1');
  });
  it('returns h2 class for ATXHeading2', () => {
    expect(squiggleClassForHeading('ATXHeading2')).toBe('cm-md-squiggle-h2');
  });
  it('returns null for ATXHeading3', () => {
    expect(squiggleClassForHeading('ATXHeading3')).toBeNull();
  });
  it('returns null for non-heading nodes', () => {
    expect(squiggleClassForHeading('Paragraph')).toBeNull();
  });
});
