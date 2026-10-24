import { BeliefState, EngineQuestion, entry, observationVar, posteriorVar, weights } from './belief.js';

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
    let chosen: { index: number; question: EngineQuestion } | undefined;
    for (const [index, question] of bank.entries()) {
      if (!available[index]) continue;
      const k = question.dimension;
      const obsVar = entry(obsVars, index);
      const value =
        entry(w, k) * varianceDrop(entry(varPref, k), obsVar) +
        entry(populationWeights, k) * varianceDrop(entry(varSelf, k), obsVar);
      if (value > best) {
        best = value;
        chosen = { index, question };
      }
    }
    if (!chosen) break;

    const k = chosen.question.dimension;
    const obsVar = entry(obsVars, chosen.index);
    picks.push(chosen.question.id);
    available[chosen.index] = false;
    varPref[k] = posteriorVar(entry(varPref, k), obsVar);
    varSelf[k] = posteriorVar(entry(varSelf, k), obsVar);
  }
  return picks;
}
