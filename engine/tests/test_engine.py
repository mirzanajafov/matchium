from collections import Counter

import numpy as np
import pytest

from matchium import Beliefs, DIMENSIONS, load_bank
from matchium.allocation import greedy_b_matching, naive_top_k
from matchium.model import PRIOR_VAR
from matchium.scoring import confidence, directed_scores, explain, mutual_scores, pair_scores
from matchium.selection import adaptive, random_order
from sim.population import answer, attraction, generate


def random_beliefs(rng, n=12, d=len(DIMENSIONS)):
    b = Beliefs(n, d, len(load_bank()))
    b.mu_self = rng.standard_normal((n, d))
    b.mu_pref = rng.standard_normal((n, d))
    b.var_self = rng.uniform(0.05, 1.0, (n, d))
    b.var_pref = rng.uniform(0.05, 1.0, (n, d))
    b.log_w_sum = rng.standard_normal((n, d))
    b.mu_gap = 0.3 * rng.standard_normal((n, d))
    b.var_gap = rng.uniform(0.05, 0.3, (n, d))
    return b


def test_bank_shape():
    bank = load_bank()
    assert len(bank) == 48
    assert len({q.id for q in bank}) == 48
    assert Counter(q.dimension for q in bank) == {k: 6 for k in range(len(DIMENSIONS))}


def test_observe_moves_mean_and_shrinks_variance():
    bank = load_bank()
    q = next(q for q in bank if not q.reverse)
    b = Beliefs(2, len(DIMENSIONS), len(bank))
    b.observe(np.array([0]), 0, q, np.array([5]), np.array([1]), np.array([5]))
    k = q.dimension
    assert b.mu_self[0, k] > 0 and b.mu_pref[0, k] < 0
    assert b.var_self[0, k] < PRIOR_VAR and b.var_pref[0, k] < PRIOR_VAR
    assert b.weights[0, k] > 1.0
    assert b.var_self[1, k] == PRIOR_VAR
    assert b.answered[0, 0] and not b.answered[1, 0]


def test_reverse_question_flips_sign():
    bank = load_bank()
    q = next(q for q in bank if q.reverse)
    b = Beliefs(1, len(DIMENSIONS), len(bank))
    b.observe(np.array([0]), 0, q, np.array([5]), np.array([5]), np.array([3]))
    assert b.mu_self[0, q.dimension] < 0


def test_directed_scores_match_brute_force():
    rng = np.random.default_rng(0)
    b = random_beliefs(rng)
    s = directed_scores(b)
    w, d = b.weights, len(DIMENSIONS)
    for u in range(b.n_users):
        for v in range(b.n_users):
            diff = b.mu_pref[u] + b.mu_gap[u] - b.mu_self[v]
            s2 = b.var_pref[u] + b.var_gap[u] + b.var_self[v]
            mean = -(w[u] * (diff**2 + s2)).sum() / d
            std = np.sqrt((w[u] ** 2 * (4 * diff**2 * s2 + 2 * s2**2)).sum()) / d
            assert s.mean[u, v] == pytest.approx(mean)
            assert s.std[u, v] == pytest.approx(std)
    u, v = np.meshgrid(np.arange(b.n_users), np.arange(b.n_users), indexing="ij")
    mean, std = pair_scores(b, u.ravel(), v.ravel())
    assert np.allclose(mean, s.mean.ravel()) and np.allclose(std, s.std.ravel())


def test_mutual_scores_symmetric_and_masked():
    rng = np.random.default_rng(1)
    n = 10
    eligible = rng.random((n, n)) < 0.6
    eligible = eligible & eligible.T
    np.fill_diagonal(eligible, False)
    m = mutual_scores(rng.standard_normal((n, n)), eligible)
    assert np.allclose(m, m.T)
    assert np.all(m[~eligible] == 0)
    assert np.all((m[eligible] > 0) & (m[eligible] < 1))


def test_confidence_rises_with_answers():
    rng = np.random.default_rng(2)
    bank = load_bank()
    pop = generate(60, len(DIMENSIONS), rng)
    b = Beliefs(pop.n_users, len(DIMENSIONS), len(bank))
    users = np.arange(pop.n_users)
    before = confidence(directed_scores(b), b.weights, pop.eligible)[pop.eligible].mean()
    for i, q in enumerate(bank[:24]):
        b.observe(users, i, q, *answer(pop, users, q, rng))
    after = confidence(directed_scores(b), b.weights, pop.eligible)[pop.eligible].mean()
    assert after > before


def test_adaptive_picks_distinct_unanswered_questions():
    rng = np.random.default_rng(3)
    bank = load_bank()
    b = random_beliefs(rng, n=5)
    b.answered[:, :10] = True
    picks = adaptive(b, bank, np.arange(5), 8)
    for row in picks:
        assert len(set(row)) == 8
        assert np.all(row >= 10)


def test_adaptive_spreads_a_day_across_dimensions():
    bank = load_bank()
    b = Beliefs(1, len(DIMENSIONS), len(bank))
    picks = adaptive(b, bank, np.array([0]), len(DIMENSIONS))
    assert len({bank[i].dimension for i in picks[0]}) == len(DIMENSIONS)


def test_policies_stop_when_bank_is_exhausted():
    rng = np.random.default_rng(4)
    bank = load_bank()
    b = Beliefs(2, len(DIMENSIONS), len(bank))
    b.answered[:, :-2] = True
    for picks in (adaptive(b, bank, np.arange(2), 5), random_order(b, bank, np.arange(2), 5, rng)):
        assert np.all(np.sort(picks, axis=1)[:, -2:] == [len(bank) - 2, len(bank) - 1])
        assert np.all(np.sort(picks, axis=1)[:, :3] == -1)


def test_greedy_b_matching_respects_capacity_and_history():
    rng = np.random.default_rng(5)
    n, k = 30, 2
    eligible = np.ones((n, n), dtype=bool)
    np.fill_diagonal(eligible, False)
    shown = np.zeros_like(eligible)
    shown[0, 1] = shown[1, 0] = True
    m = mutual_scores(rng.standard_normal((n, n)), eligible)
    pairs = greedy_b_matching(m, eligible, shown, k)
    degree = np.bincount(pairs.ravel(), minlength=n)
    assert degree.max() <= k
    assert len({tuple(sorted(p)) for p in pairs}) == len(pairs)
    assert not any(set(p) == {0, 1} for p in pairs)
    assert np.all(eligible[pairs[:, 0], pairs[:, 1]])


def test_naive_top_k_concentrates_exposure():
    n = 20
    eligible = np.ones((n, n), dtype=bool)
    np.fill_diagonal(eligible, False)
    popularity = np.arange(n, dtype=float)
    m = mutual_scores(np.tile(popularity, (n, 1)), eligible)
    naive = naive_top_k(m, eligible, np.zeros_like(eligible), 3)
    greedy = greedy_b_matching(m, eligible, np.zeros_like(eligible), 3)
    assert np.bincount(naive[:, 1], minlength=n).max() > 3
    assert np.bincount(greedy.ravel(), minlength=n).max() <= 3


def test_explain_names_real_dimensions():
    rng = np.random.default_rng(6)
    b = random_beliefs(rng, n=3)
    why = explain(b, 0, 1)
    assert set(why["aligned"]) <= set(DIMENSIONS)
    assert why["friction"] in DIMENSIONS


def test_new_users_have_zero_confidence():
    n = 4
    b = Beliefs(n, len(DIMENSIONS), len(load_bank()))
    eligible = ~np.eye(n, dtype=bool)
    conf = confidence(directed_scores(b), b.weights, eligible)
    assert np.allclose(conf[eligible], 0.0)


def test_learning_beats_random_on_synthetic_population():
    rng = np.random.default_rng(7)
    bank = load_bank()
    pop = generate(200, len(DIMENSIONS), rng)
    truth = attraction(pop)
    b = Beliefs(pop.n_users, len(DIMENSIONS), len(bank))
    users = np.arange(pop.n_users)
    for i, q in enumerate(bank):
        b.observe(users, i, q, *answer(pop, users, q, rng))
    pred = directed_scores(b).mean
    corr = np.mean(
        [np.corrcoef(pred[u, pop.eligible[u]], truth[u, pop.eligible[u]])[0, 1] for u in users if pop.eligible[u].sum() > 3]
    )
    assert corr > 0.5
