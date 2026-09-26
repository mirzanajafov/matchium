import { DIMENSIONS } from './belief.js';

export const NOTICEABLE_SHIFT = 0.3;

export interface PreferenceShift {
  dimension: string;
  direction: 'more' | 'less';
}

export function preferenceShifts(muGap: number[], limit = 2): PreferenceShift[] {
  return muGap
    .map((gap, k) => ({ gap, dimension: DIMENSIONS[k] }))
    .filter(({ gap, dimension }) => dimension !== undefined && Math.abs(gap) >= NOTICEABLE_SHIFT)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, limit)
    .map(({ gap, dimension }) => ({ dimension, direction: gap > 0 ? 'more' : 'less' }));
}
