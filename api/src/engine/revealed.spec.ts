import { NOTICEABLE_SHIFT, preferenceShifts } from './revealed.js';

describe('preferenceShifts', () => {
  it('returns nothing before any decision has been learned', () => {
    expect(preferenceShifts([])).toEqual([]);
  });

  it('ignores small shifts', () => {
    expect(preferenceShifts(Array(8).fill(NOTICEABLE_SHIFT / 2))).toEqual([]);
  });

  it('lists the largest shifts first with their direction', () => {
    const gaps = [0, 0.4, 0, -0.9, 0, 0.35, 0, 0];
    expect(preferenceShifts(gaps)).toEqual([
      { dimension: 'family', direction: 'less' },
      { dimension: 'adventure', direction: 'more' },
    ]);
  });
});
