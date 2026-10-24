import { DIMENSIONS } from './belief.js';

export const NOTICEABLE_SHIFT = 0.3;

export interface PreferenceShift {
  dimension: string;
  direction: 'more' | 'less';
}

export function preferenceShifts(muGap: number[], limit = 2): PreferenceShift[] {
  return muGap
    .flatMap((gap, k) => {
      const dimension = DIMENSIONS[k];
      return dimension && Math.abs(gap) >= NOTICEABLE_SHIFT ? [{ gap, dimension }] : [];
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, limit)
    .map(({ gap, dimension }) => ({ dimension, direction: gap > 0 ? 'more' : 'less' }));
}
