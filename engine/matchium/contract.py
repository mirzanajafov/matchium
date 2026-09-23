import argparse
import json
from pathlib import Path

import numpy as np

from .model import Beliefs
from .questions import DIMENSIONS, load_bank
from .selection import adaptive

CONTRACT_DIR = Path(__file__).resolve().parents[2] / "contract"


def questions_payload() -> dict:
    return {
        "dimensions": list(DIMENSIONS),
        "questions": [
            {"id": q.id, "dimension": q.dimension, "text": q.text, "noise": q.noise, "reverse": q.reverse}
            for q in load_bank()
        ],
    }


def _state(beliefs: Beliefs) -> dict:
    return {
        "muSelf": beliefs.mu_self[0].tolist(),
        "varSelf": beliefs.var_self[0].tolist(),
        "muPref": beliefs.mu_pref[0].tolist(),
        "varPref": beliefs.var_pref[0].tolist(),
        "logWSum": beliefs.log_w_sum[0].tolist(),
        "logWCount": beliefs.log_w_count[0].tolist(),
    }


def vectors_payload(seed: int = 11, n_scenarios: int = 5, answers_per_scenario: int = 20, picks: int = 6) -> dict:
    rng = np.random.default_rng(seed)
    bank = load_bank()
    ids = [q.id for q in bank]
    scenarios = []
    for _ in range(n_scenarios):
        beliefs = Beliefs(1, len(DIMENSIONS), len(bank))
        population_weights = 2.0 ** rng.normal(0, 0.5, len(DIMENSIONS))
        steps = []
        order = rng.permutation(len(bank))[:answers_per_scenario]
        for step, q_index in enumerate(order):
            answers = rng.integers(1, 6, size=3)
            beliefs.observe(np.array([0]), int(q_index), bank[q_index], answers[:1], answers[1:2], answers[2:3])
            entry = {
                "questionId": ids[q_index],
                "self": int(answers[0]),
                "partner": int(answers[1]),
                "importance": int(answers[2]),
                "after": _state(beliefs),
            }
            if step % 5 == 4:
                chosen = adaptive(beliefs, bank, np.array([0]), picks, population_weights)[0]
                entry["nextPicks"] = [ids[i] for i in chosen if i >= 0]
            steps.append(entry)
        initial_picks = adaptive(Beliefs(1, len(DIMENSIONS), len(bank)), bank, np.array([0]), picks, population_weights)[0]
        scenarios.append(
            {
                "populationWeights": population_weights.tolist(),
                "initialPicks": [ids[i] for i in initial_picks],
                "steps": steps,
            }
        )
    return {"picksPerDay": picks, "scenarios": scenarios}


def write(directory: Path = CONTRACT_DIR) -> None:
    directory.mkdir(exist_ok=True)
    (directory / "questions.json").write_text(json.dumps(questions_payload(), indent=2) + "\n")
    (directory / "engine-vectors.json").write_text(json.dumps(vectors_payload(), indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Write the question bank and engine test vectors shared with the API.")
    parser.add_argument("--out", type=Path, default=CONTRACT_DIR)
    write(parser.parse_args().out)


if __name__ == "__main__":
    main()
