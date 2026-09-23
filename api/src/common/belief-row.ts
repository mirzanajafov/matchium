import { BeliefState } from '../engine/belief.js';

export function beliefState(row: BeliefState): BeliefState {
  return {
    muSelf: row.muSelf,
    varSelf: row.varSelf,
    muPref: row.muPref,
    varPref: row.varPref,
    logWSum: row.logWSum,
    logWCount: row.logWCount,
  };
}
