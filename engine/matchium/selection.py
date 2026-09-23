import numpy as np

from .model import Beliefs, observation_var, posterior_var
from .questions import Question


def _variance_drop(var: np.ndarray, obs_var: np.ndarray) -> np.ndarray:
    return var - posterior_var(var, obs_var)


def adaptive(
    beliefs: Beliefs,
    bank: list[Question],
    users: np.ndarray,
    n: int,
    population_weights: np.ndarray | None = None,
) -> np.ndarray:
    dims = np.array([q.dimension for q in bank])
    obs_var = np.array([observation_var(q) for q in bank])
    w = beliefs.weights[users]
    w_pop = beliefs.weights.mean(0) if population_weights is None else population_weights
    var_pref = beliefs.var_pref[users].copy()
    var_self = beliefs.var_self[users].copy()
    available = ~beliefs.answered[users]
    rows = np.arange(len(users))

    picks = np.full((len(users), n), -1)
    for step in range(n):
        value = w[:, dims] * _variance_drop(var_pref[:, dims], obs_var) + w_pop[dims] * _variance_drop(
            var_self[:, dims], obs_var
        )
        value = np.where(available, value, -np.inf)
        choice = value.argmax(1)
        has_choice = np.isfinite(value[rows, choice])
        picks[has_choice, step] = choice[has_choice]
        available[rows, choice] = False
        k = dims[choice]
        var_pref[rows, k] = posterior_var(var_pref[rows, k], obs_var[choice])
        var_self[rows, k] = posterior_var(var_self[rows, k], obs_var[choice])
    return picks


def random_order(
    beliefs: Beliefs, bank: list[Question], users: np.ndarray, n: int, rng: np.random.Generator
) -> np.ndarray:
    picks = np.full((len(users), n), -1)
    for i, u in enumerate(users):
        open_questions = np.flatnonzero(~beliefs.answered[u])
        chosen = rng.permutation(open_questions)[:n]
        picks[i, : len(chosen)] = chosen
    return picks
