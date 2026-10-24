export const DIMENSIONS = [
  'social_energy',
  'adventure',
  'ambition',
  'family',
  'tidiness',
  'planning',
  'tradition',
  'activity',
] as const;
export const DIMENSION_COUNT = DIMENSIONS.length;
export const LIKERT_CENTERS = [-1.9, -0.95, 0.0, 0.95, 1.9];
export const QUANTIZATION_VAR = 0.1;
export const PRIOR_VAR = 1.0;
export const IMPORTANCE_SLOPE = 1.5;
export const IMPORTANCE_PRIOR_COUNT = 1.0;

export interface EngineQuestion {
  id: string;
  dimension: number;
  noise: number;
  reverse: boolean;
}

export interface BeliefState {
  muSelf: number[];
  varSelf: number[];
  muPref: number[];
  varPref: number[];
  logWSum: number[];
  logWCount: number[];
}

export interface AnswerValues {
  self: number;
  partner: number;
  importance: number;
}

export function entry(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new RangeError(`No entry ${index} in a list of ${values.length}`);
  return value;
}

export function toBeliefState(row: BeliefState): BeliefState {
  return {
    muSelf: row.muSelf,
    varSelf: row.varSelf,
    muPref: row.muPref,
    varPref: row.varPref,
    logWSum: row.logWSum,
    logWCount: row.logWCount,
  };
}

export function priorBelief(): BeliefState {
  const filled = (value: number) => Array<number>(DIMENSION_COUNT).fill(value);
  return {
    muSelf: filled(0),
    varSelf: filled(PRIOR_VAR),
    muPref: filled(0),
    varPref: filled(PRIOR_VAR),
    logWSum: filled(0),
    logWCount: filled(IMPORTANCE_PRIOR_COUNT),
  };
}

export function observationVar(question: EngineQuestion): number {
  return question.noise * question.noise + QUANTIZATION_VAR;
}

export function posteriorVar(variance: number, obsVar: number): number {
  return (variance * obsVar) / (variance + obsVar);
}

export function weights(state: BeliefState): number[] {
  return state.logWSum.map((sum, k) => Math.pow(2, sum / entry(state.logWCount, k)));
}

function kalman(mu: number, variance: number, z: number, obsVar: number): [number, number] {
  const gain = variance / (variance + obsVar);
  return [mu + gain * (z - mu), posteriorVar(variance, obsVar)];
}

export function observe(state: BeliefState, question: EngineQuestion, answer: AnswerValues): BeliefState {
  const k = question.dimension;
  const sign = question.reverse ? -1.0 : 1.0;
  const obsVar = observationVar(question);
  const next: BeliefState = {
    muSelf: [...state.muSelf],
    varSelf: [...state.varSelf],
    muPref: [...state.muPref],
    varPref: [...state.varPref],
    logWSum: [...state.logWSum],
    logWCount: [...state.logWCount],
  };

  [next.muSelf[k], next.varSelf[k]] = kalman(
    entry(state.muSelf, k),
    entry(state.varSelf, k),
    sign * entry(LIKERT_CENTERS, answer.self - 1),
    obsVar,
  );
  [next.muPref[k], next.varPref[k]] = kalman(
    entry(state.muPref, k),
    entry(state.varPref, k),
    sign * entry(LIKERT_CENTERS, answer.partner - 1),
    obsVar,
  );
  next.logWSum[k] = entry(state.logWSum, k) + (answer.importance - 3) / IMPORTANCE_SLOPE;
  next.logWCount[k] = entry(state.logWCount, k) + 1;
  return next;
}

export function certainty(state: BeliefState): number {
  const priorStd = Math.sqrt(PRIOR_VAR);
  const remaining = state.varSelf.reduce((acc, v, k) => acc + Math.sqrt(v) + Math.sqrt(entry(state.varPref, k)), 0);
  return 1 - remaining / (2 * DIMENSION_COUNT * priorStd);
}
