import { BeliefState, DIMENSION_COUNT, certainty, observe, priorBelief } from './belief.js';
import { QuestionContract, readContract } from './contract.js';
import { pickQuestions } from './selection.js';

interface Step {
  questionId: string;
  self: number;
  partner: number;
  importance: number;
  after: BeliefState;
  nextPicks?: string[];
}

interface Scenario {
  populationWeights: number[];
  initialPicks: string[];
  steps: Step[];
}

const { questions, dimensions } = readContract<QuestionContract>('questions.json');
const { picksPerDay, scenarios } = readContract<{ picksPerDay: number; scenarios: Scenario[] }>('engine-vectors.json');
const byId = new Map(questions.map((q) => [q.id, q]));

function expectStateClose(actual: BeliefState, expected: BeliefState) {
  for (const key of Object.keys(expected) as (keyof BeliefState)[]) {
    expected[key].forEach((value, k) => expect(actual[key][k]).toBeCloseTo(value, 12));
  }
}

describe('engine parity with the python reference', () => {
  it('uses the same dimensions', () => {
    expect(dimensions).toHaveLength(DIMENSION_COUNT);
  });

  scenarios.forEach((scenario, index) => {
    it(`replays scenario ${index}`, () => {
      expect(pickQuestions(priorBelief(), questions, new Set(), picksPerDay, scenario.populationWeights)).toEqual(
        scenario.initialPicks,
      );

      let state = priorBelief();
      const answered = new Set<string>();
      for (const step of scenario.steps) {
        state = observe(state, byId.get(step.questionId)!, step);
        answered.add(step.questionId);
        expectStateClose(state, step.after);
        if (step.nextPicks) {
          expect(pickQuestions(state, questions, answered, picksPerDay, scenario.populationWeights)).toEqual(
            step.nextPicks,
          );
        }
      }
    });
  });
});

describe('certainty', () => {
  it('starts at zero and grows with answers', () => {
    const start = priorBelief();
    expect(certainty(start)).toBe(0);
    const next = observe(start, questions[0], { self: 4, partner: 4, importance: 5 });
    expect(certainty(next)).toBeGreaterThan(0);
  });
});

describe('pickQuestions', () => {
  it('never returns answered questions and stops when the bank runs out', () => {
    const answered = new Set(questions.slice(0, -2).map((q) => q.id));
    const picks = pickQuestions(priorBelief(), questions, answered, 5, Array(DIMENSION_COUNT).fill(1));
    expect(picks.sort()).toEqual(questions.slice(-2).map((q) => q.id).sort());
  });
});
