import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

import numpy as np

from matchium import DIMENSIONS, Beliefs, Question, load_bank
from matchium.allocation import greedy_b_matching, naive_top_k
from matchium.revealed import Decisions, learn, pool_spread
from matchium.scoring import confidence, directed_scores, mutual_scores
from matchium.selection import adaptive, random_order
from sim import chart, metrics
from sim.population import Population, answer, attraction, generate, likes, predictable_attraction
from sim.results import AllocationRow, DayRow, DecisionRow, DecisionRuns, Evaluation, Results

RESULTS_DIR = Path(__file__).resolve().parents[1] / "results"

Policy = Literal["random", "adaptive"]


@dataclass(frozen=True)
class Config:
    users: int
    days: int
    per_day: int
    k_daily: int
    seed: int
    long_days: int
    stated_gap: float


def evaluate(
    pred_mutual: np.ndarray, truth_mutual: np.ndarray, pop: Population, like: np.ndarray, k_daily: int
) -> Evaluation:
    fresh = greedy_b_matching(pred_mutual, pop.eligible, np.zeros_like(pop.eligible), k_daily)
    return {
        "spearman": metrics.spearman(pred_mutual, truth_mutual, pop.eligible),
        "precision_at_10": metrics.precision_at_k(pred_mutual, truth_mutual, pop.eligible),
        "mutual_like_rate": metrics.mutual_like_rate(fresh, like),
    }


def run_policy(
    policy: Policy,
    pop: Population,
    bank: list[Question],
    like: np.ndarray,
    truth_mutual: np.ndarray,
    config: Config,
    days: int,
    use_decisions: bool = False,
) -> tuple[list[DayRow], np.ndarray]:
    beliefs = Beliefs(pop.n_users, len(DIMENSIONS), len(bank))
    rng = np.random.default_rng(config.seed + 1)
    users = np.arange(pop.n_users)
    shown = np.zeros_like(pop.eligible)
    history: list[DayRow] = []
    total_mutual = 0
    for day in range(1, days + 1):
        if policy == "adaptive":
            picks = adaptive(beliefs, bank, users, config.per_day)
        else:
            picks = random_order(beliefs, users, config.per_day, rng)
        for q_index in np.unique(picks[picks >= 0]):
            who = np.flatnonzero((picks == q_index).any(1))
            self_a, pref_a, imp = answer(pop, who, bank[q_index], rng)
            beliefs.observe(who, q_index, bank[q_index], self_a, pref_a, imp)

        directed = directed_scores(beliefs)
        pred = mutual_scores(directed.mean, pop.eligible)
        evaluation = evaluate(pred, truth_mutual, pop, like, config.k_daily)
        pairs = greedy_b_matching(pred, pop.eligible, shown, config.k_daily)
        shown[pairs[:, 0], pairs[:, 1]] = shown[pairs[:, 1], pairs[:, 0]] = True
        total_mutual += int((like[pairs[:, 0], pairs[:, 1]] & like[pairs[:, 1], pairs[:, 0]]).sum())
        if use_decisions:
            chooser, target = np.r_[pairs[:, 0], pairs[:, 1]], np.r_[pairs[:, 1], pairs[:, 0]]
            learn(beliefs, Decisions(chooser, target, like[chooser, target]), *pool_spread(directed.mean, pop.eligible))
        conf = confidence(directed, beliefs.weights, pop.eligible)
        history.append(
            {
                **evaluation,
                "cumulative_mutual_matches": total_mutual,
                "mean_confidence": float(conf[pop.eligible].mean()),
                "day": day,
                "questions_answered": int(beliefs.answered.sum(1).mean()),
            }
        )
    return history, pred


def allocation_comparison(pred: np.ndarray, pop: Population, like: np.ndarray, k: int) -> dict[str, AllocationRow]:
    empty = np.zeros_like(pop.eligible)
    naive = naive_top_k(pred, pop.eligible, empty, k)
    greedy = greedy_b_matching(pred, pop.eligible, empty, k)
    out: dict[str, AllocationRow] = {}
    for name, pairs, symmetric in (("naive_top_k", naive, False), ("greedy_b_matching", greedy, True)):
        exp = metrics.exposure(pairs, pop.n_users, symmetric)
        out[name] = {
            "mutual_like_rate": metrics.mutual_like_rate(pairs, like),
            "exposure_gini": metrics.gini(exp),
            "max_exposure": int(exp.max()),
            "users_never_shown": float(np.mean(exp == 0)),
        }
    return out


def decision_rows(history: list[DayRow]) -> list[DecisionRow]:
    return [
        {"day": row["day"], "spearman": row["spearman"], "cumulative_mutual_matches": row["cumulative_mutual_matches"]}
        for row in history
    ]


def decision_learning(config: Config, bank: list[Question]) -> dict[str, DecisionRuns]:
    out: dict[str, DecisionRuns] = {}
    for world, gap in (("honest", 0.0), ("misreporting", config.stated_gap)):
        rng = np.random.default_rng(config.seed)
        pop = generate(config.users, len(DIMENSIONS), rng, stated_gap=gap)
        like = likes(pop, rng)
        truth_mutual = mutual_scores(attraction(pop), pop.eligible)
        survey, _ = run_policy("adaptive", pop, bank, like, truth_mutual, config, config.long_days)
        with_decisions, _ = run_policy(
            "adaptive", pop, bank, like, truth_mutual, config, config.long_days, use_decisions=True
        )
        out[world] = {"survey": decision_rows(survey), "survey_and_decisions": decision_rows(with_decisions)}
    return out


def to_markdown(results: Results) -> str:
    lines = [
        "# Simulation results\n",
        f"{results['config']['users']} synthetic users, {results['config']['per_day']} questions/day, "
        f"{results['config']['k_daily']} matches/day, seed {results['config']['seed']}.\n",
        "## Question policy: adaptive vs random\n",
        "Mutual like rate is measured on a fresh allocation (no history), so it reflects model quality. "
        "Cumulative matches follow the real daily loop, where pairs are never shown twice.\n",
        "| day | questions | policy | spearman | precision@10 | mutual like rate | confidence | cumulative mutual matches |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for day_rows in zip(results["random"], results["adaptive"], strict=True):
        for policy, row in zip(("random", "adaptive"), day_rows, strict=True):
            lines.append(
                f"| {row['day']} | {row['questions_answered']} | {policy} | {row['spearman']:.3f} | "
                f"{row['precision_at_10']:.3f} | {row['mutual_like_rate']:.3f} | {row['mean_confidence']:.3f} | "
                f"{row['cumulative_mutual_matches']} |"
            )
    b = results["baselines"]
    lines += [
        "\n## Reference points\n",
        "| model | spearman | precision@10 | mutual like rate |",
        "|---|---|---|---|",
        f"| random matching | {b['random']['spearman']:.3f} | {b['random']['precision_at_10']:.3f} | {b['random']['mutual_like_rate']:.3f} |",
        f"| oracle (knows true traits, not chemistry) | {b['oracle']['spearman']:.3f} | "
        f"{b['oracle']['precision_at_10']:.3f} | {b['oracle']['mutual_like_rate']:.3f} |",
        "\n## Learning from like/pass decisions\n",
        f"Adaptive questions for {results['config']['long_days']} days. In the misreporting world each stated "
        f"preference is off by noise with std {results['config']['stated_gap']} from the one that drives likes.\n",
        "| world | day | spearman (survey) | spearman (+decisions) | mutual matches (survey) | mutual matches (+decisions) |",
        "|---|---|---|---|---|---|",
    ]
    for world, runs in results["decisions"].items():
        for a, b_row in zip(runs["survey"], runs["survey_and_decisions"], strict=True):
            if a["day"] in (1, 7, 14) or a["day"] == len(runs["survey"]):
                lines.append(
                    f"| {world} | {a['day']} | {a['spearman']:.3f} | {b_row['spearman']:.3f} | "
                    f"{a['cumulative_mutual_matches']} | {b_row['cumulative_mutual_matches']} |"
                )
    lines += [
        "\n## Allocation: naive top-k vs greedy b-matching (final adaptive model)\n",
        "| allocator | mutual like rate | exposure gini | max exposure | users never shown |",
        "|---|---|---|---|---|",
    ]
    for name, allocation in results["allocation"].items():
        lines.append(
            f"| {name} | {allocation['mutual_like_rate']:.3f} | {allocation['exposure_gini']:.3f} | "
            f"{allocation['max_exposure']} | {allocation['users_never_shown']:.1%} |"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Matchium matching simulation.")
    parser.add_argument("--users", type=int, default=1500)
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--per-day", type=int, default=6)
    parser.add_argument("--k-daily", type=int, default=3)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--long-days", type=int, default=28)
    parser.add_argument("--stated-gap", type=float, default=0.5)
    config = Config(**vars(parser.parse_args()))

    rng = np.random.default_rng(config.seed)
    bank = load_bank()
    pop = generate(config.users, len(DIMENSIONS), rng)
    like = likes(pop, rng)
    truth_mutual = mutual_scores(attraction(pop), pop.eligible)

    random_history, _ = run_policy("random", pop, bank, like, truth_mutual, config, config.days)
    adaptive_history, adaptive_pred = run_policy("adaptive", pop, bank, like, truth_mutual, config, config.days)
    oracle = mutual_scores(predictable_attraction(pop), pop.eligible)
    noise = mutual_scores(rng.standard_normal(pop.eligible.shape), pop.eligible)
    results: Results = {
        "config": asdict(config),
        "random": random_history,
        "adaptive": adaptive_history,
        "allocation": allocation_comparison(adaptive_pred, pop, like, config.k_daily),
        "baselines": {
            "oracle": evaluate(oracle, truth_mutual, pop, like, config.k_daily),
            "random": evaluate(noise, truth_mutual, pop, like, config.k_daily),
        },
        "decisions": decision_learning(config, bank),
    }

    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "latest.json").write_text(json.dumps(results, indent=2))
    report = to_markdown(results)
    (RESULTS_DIR / "latest.md").write_text(report)
    chart.render(results, RESULTS_DIR)
    print(report)


if __name__ == "__main__":
    main()
