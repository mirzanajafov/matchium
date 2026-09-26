import argparse
import json
from pathlib import Path

import numpy as np

from matchium import Beliefs, DIMENSIONS, load_bank
from matchium.allocation import greedy_b_matching, naive_top_k
from matchium.revealed import Decisions, learn, pool_spread
from matchium.scoring import confidence, directed_scores, mutual_scores
from matchium.selection import adaptive, random_order
from sim import chart, metrics
from sim.population import answer, attraction, generate, likes, predictable_attraction

RESULTS_DIR = Path(__file__).resolve().parents[1] / "results"


def evaluate(pred_mutual, truth_mutual, pop, like, k_daily):
    fresh = greedy_b_matching(pred_mutual, pop.eligible, np.zeros_like(pop.eligible), k_daily)
    return {
        "spearman": metrics.spearman(pred_mutual, truth_mutual, pop.eligible),
        "precision_at_10": metrics.precision_at_k(pred_mutual, truth_mutual, pop.eligible),
        "mutual_like_rate": metrics.mutual_like_rate(fresh, like),
    }


def run_policy(name, pop, bank, like, truth_mutual, args, days=None, use_decisions=False):
    beliefs = Beliefs(pop.n_users, len(DIMENSIONS), len(bank))
    rng = np.random.default_rng(args.seed + 1)
    users = np.arange(pop.n_users)
    shown = np.zeros_like(pop.eligible)
    history = []
    total_mutual = 0
    for day in range(1, (days or args.days) + 1):
        if name == "adaptive":
            picks = adaptive(beliefs, bank, users, args.per_day)
        else:
            picks = random_order(beliefs, bank, users, args.per_day, rng)
        for q_index in np.unique(picks[picks >= 0]):
            who = np.flatnonzero((picks == q_index).any(1))
            self_a, pref_a, imp = answer(pop, who, bank[q_index], rng)
            beliefs.observe(who, q_index, bank[q_index], self_a, pref_a, imp)

        directed = directed_scores(beliefs)
        pred = mutual_scores(directed.mean, pop.eligible)
        row = evaluate(pred, truth_mutual, pop, like, args.k_daily)
        pairs = greedy_b_matching(pred, pop.eligible, shown, args.k_daily)
        shown[pairs[:, 0], pairs[:, 1]] = shown[pairs[:, 1], pairs[:, 0]] = True
        total_mutual += int((like[pairs[:, 0], pairs[:, 1]] & like[pairs[:, 1], pairs[:, 0]]).sum())
        if use_decisions:
            chooser, target = np.r_[pairs[:, 0], pairs[:, 1]], np.r_[pairs[:, 1], pairs[:, 0]]
            learn(beliefs, Decisions(chooser, target, like[chooser, target]), *pool_spread(directed.mean, pop.eligible))
        row["cumulative_mutual_matches"] = total_mutual
        conf = confidence(directed, beliefs.weights, pop.eligible)
        row["mean_confidence"] = float(conf[pop.eligible].mean())
        row["day"] = day
        row["questions_answered"] = int(beliefs.answered.sum(1).mean())
        history.append(row)
    return history, beliefs, pred


def allocation_comparison(pred, pop, like, k):
    empty = np.zeros_like(pop.eligible)
    naive = naive_top_k(pred, pop.eligible, empty, k)
    greedy = greedy_b_matching(pred, pop.eligible, empty, k)
    out = {}
    for name, pairs, symmetric in (("naive_top_k", naive, False), ("greedy_b_matching", greedy, True)):
        exp = metrics.exposure(pairs, pop.n_users, symmetric)
        out[name] = {
            "mutual_like_rate": metrics.mutual_like_rate(pairs, like),
            "exposure_gini": metrics.gini(exp),
            "max_exposure": int(exp.max()),
            "users_never_shown": float(np.mean(exp == 0)),
        }
    return out


def decision_learning(args, bank):
    out = {}
    for world, gap in (("honest", 0.0), ("misreporting", args.stated_gap)):
        rng = np.random.default_rng(args.seed)
        pop = generate(args.users, len(DIMENSIONS), rng, stated_gap=gap)
        like = likes(pop, rng)
        truth_mutual = mutual_scores(attraction(pop), pop.eligible)
        out[world] = {}
        for label, use in (("survey", False), ("survey_and_decisions", True)):
            history, _, _ = run_policy("adaptive", pop, bank, like, truth_mutual, args, args.long_days, use)
            out[world][label] = [
                {key: row[key] for key in ("day", "spearman", "cumulative_mutual_matches")} for row in history
            ]
    return out


def to_markdown(results) -> str:
    lines = [
        f"# Simulation results\n",
        f"{results['config']['users']} synthetic users, {results['config']['per_day']} questions/day, "
        f"{results['config']['k_daily']} matches/day, seed {results['config']['seed']}.\n",
        "## Question policy: adaptive vs random\n",
        "Mutual like rate is measured on a fresh allocation (no history), so it reflects model quality. "
        "Cumulative matches follow the real daily loop, where pairs are never shown twice.\n",
        "| day | questions | policy | spearman | precision@10 | mutual like rate | confidence | cumulative mutual matches |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for day_rows in zip(results["random"], results["adaptive"]):
        for policy, row in zip(("random", "adaptive"), day_rows):
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
        for a, b_row in zip(runs["survey"], runs["survey_and_decisions"]):
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
    for name, row in results["allocation"].items():
        lines.append(
            f"| {name} | {row['mutual_like_rate']:.3f} | {row['exposure_gini']:.3f} | "
            f"{row['max_exposure']} | {row['users_never_shown']:.1%} |"
        )
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Run the Matchium matching simulation.")
    parser.add_argument("--users", type=int, default=1500)
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--per-day", type=int, default=6)
    parser.add_argument("--k-daily", type=int, default=3)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--long-days", type=int, default=28)
    parser.add_argument("--stated-gap", type=float, default=0.5)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    bank = load_bank()
    pop = generate(args.users, len(DIMENSIONS), rng)
    like = likes(pop, rng)
    truth_mutual = mutual_scores(attraction(pop), pop.eligible)

    results = {"config": vars(args)}
    for policy in ("random", "adaptive"):
        history, beliefs, pred = run_policy(policy, pop, bank, like, truth_mutual, args)
        results[policy] = history
    results["allocation"] = allocation_comparison(pred, pop, like, args.k_daily)

    oracle = mutual_scores(predictable_attraction(pop), pop.eligible)
    oracle_row = evaluate(oracle, truth_mutual, pop, like, args.k_daily)
    noise = mutual_scores(rng.standard_normal(pop.eligible.shape), pop.eligible)
    random_row = evaluate(noise, truth_mutual, pop, like, args.k_daily)
    results["baselines"] = {"oracle": oracle_row, "random": random_row}
    results["decisions"] = decision_learning(args, bank)

    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "latest.json").write_text(json.dumps(results, indent=2))
    report = to_markdown(results)
    (RESULTS_DIR / "latest.md").write_text(report)
    chart.render(results, RESULTS_DIR)
    print(report)


if __name__ == "__main__":
    main()
