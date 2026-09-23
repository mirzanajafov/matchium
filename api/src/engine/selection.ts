import { BeliefState, EngineQuestion, observationVar, posteriorVar, weights } from './belief.js';

function varianceDrop(variance: number, obsVar: number): number {
  return variance - posteriorVar(variance, obsVar);
}

export function pickQuestions(
  state: BeliefState,
  bank: EngineQuestion[],
  answered: ReadonlySet<string>,
  count: number,
  populationWeights: number[],
): string[] {
  const w = weights(state);
  const obsVars = bank.map(observationVar);
  const varPref = [...state.varPref];
  const varSelf = [...state.varSelf];
  const available = bank.map((q) => !answered.has(q.id));
  const picks: string[] = [];

  for (let step = 0; step < count; step++) {
    let best = -Infinity;
    let chosen = -1;
    bank.forEach((q, i) => {
      if (!available[i]) return;
      const k = q.dimension;
      const value =
        w[k] * varianceDrop(varPref[k], obsVars[i]) + populationWeights[k] * varianceDrop(varSelf[k], obsVars[i]);
      if (value > best) {
        best = value;
        chosen = i;
      }
    });
    if (chosen < 0) break;

    const k = bank[chosen].dimension;
    picks.push(bank[chosen].id);
    available[chosen] = false;
    varPref[k] = posteriorVar(varPref[k], obsVars[chosen]);
    varSelf[k] = posteriorVar(varSelf[k], obsVars[chosen]);
  }
  return picks;
}
