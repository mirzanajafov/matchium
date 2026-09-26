import numpy as np

from matchium import Beliefs, DIMENSIONS
from matchium.model import BAR_PRIOR_MEAN, GAP_PRIOR_VAR
from matchium.revealed import Decisions, learn, pool_spread
from matchium.scoring import directed_scores


def beliefs(rng, n=6):
    d = len(DIMENSIONS)
    b = Beliefs(n, d, 0)
    b.mu_self = rng.standard_normal((n, d))
    b.mu_pref = rng.standard_normal((n, d))
    b.var_self = np.full((n, d), 0.2)
    b.var_pref = np.full((n, d), 0.2)
    return b


def spread(b):
    eligible = ~np.eye(b.n_users, dtype=bool)
    return pool_spread(directed_scores(b).mean, eligible)


def distance(b, u, v):
    return float((b.weights[u] * (b.pref_mean[u] - b.mu_self[v]) ** 2).sum())


def decide(b, u, v, liked):
    learn(b, Decisions(np.array([u]), np.array([v]), np.array([liked])), *spread(b))


def test_like_pulls_preference_toward_target_and_lowers_the_bar():
    b = beliefs(np.random.default_rng(0))
    before = distance(b, 0, 1)
    decide(b, 0, 1, True)
    assert distance(b, 0, 1) < before
    assert b.mu_bar[0] < BAR_PRIOR_MEAN
    assert np.all(b.var_gap[0] <= GAP_PRIOR_VAR) and b.var_gap[0].min() < GAP_PRIOR_VAR
    assert np.all(b.mu_gap[1:] == 0) and np.all(b.var_gap[1:] == GAP_PRIOR_VAR)


def test_pass_pushes_preference_away_and_raises_the_bar():
    b = beliefs(np.random.default_rng(1))
    before = distance(b, 0, 1)
    decide(b, 0, 1, False)
    assert distance(b, 0, 1) > before
    assert b.mu_bar[0] > BAR_PRIOR_MEAN


def test_stated_preferences_are_left_alone():
    b = beliefs(np.random.default_rng(2))
    mu_pref, var_pref = b.mu_pref.copy(), b.var_pref.copy()
    decide(b, 2, 3, True)
    assert np.array_equal(b.mu_pref, mu_pref) and np.array_equal(b.var_pref, var_pref)


def test_batch_matches_one_decision_at_a_time():
    rng = np.random.default_rng(3)
    batched = beliefs(rng)
    sequential = Beliefs(batched.n_users, len(DIMENSIONS), 0)
    for name in ("mu_self", "mu_pref", "var_self", "var_pref"):
        setattr(sequential, name, getattr(batched, name).copy())
    center, width = spread(batched)

    chooser = np.array([0, 1, 0, 2, 0])
    target = np.array([3, 4, 5, 3, 4])
    liked = np.array([True, False, False, True, True])
    learn(batched, Decisions(chooser, target, liked), center, width)
    for u, v, y in zip(chooser, target, liked):
        learn(sequential, Decisions(np.array([u]), np.array([v]), np.array([y])), center, width)

    assert np.allclose(batched.mu_gap, sequential.mu_gap)
    assert np.allclose(batched.var_gap, sequential.var_gap)
    assert np.allclose(batched.mu_bar, sequential.mu_bar)


def test_no_decisions_is_a_no_op():
    b = beliefs(np.random.default_rng(4))
    empty = np.array([], dtype=int)
    learn(b, Decisions(empty, empty, empty.astype(bool)), *spread(b))
    assert np.all(b.mu_gap == 0) and np.all(b.mu_bar == BAR_PRIOR_MEAN)
