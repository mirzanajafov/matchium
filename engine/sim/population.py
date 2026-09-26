import warnings
from dataclasses import dataclass

import numpy as np

from matchium.model import IMPORTANCE_SLOPE
from matchium.questions import Question

LIKERT_THRESHOLDS = np.array([-1.5, -0.5, 0.5, 1.5])
IMPORTANCE_ANSWER_NOISE = 0.5


@dataclass
class Population:
    traits: np.ndarray
    prefs: np.ndarray
    stated_prefs: np.ndarray
    weights: np.ndarray
    chemistry: np.ndarray
    gender: np.ndarray
    eligible: np.ndarray

    @property
    def n_users(self) -> int:
        return len(self.traits)


def generate(
    n_users: int,
    n_dims: int,
    rng: np.random.Generator,
    homophily: float = 0.5,
    chemistry_std: float = 0.6,
    stated_gap: float = 0.0,
) -> Population:
    traits = rng.standard_normal((n_users, n_dims))
    prefs = homophily * traits + np.sqrt(1 - homophily**2) * rng.standard_normal((n_users, n_dims))
    weights = rng.dirichlet(np.full(n_dims, 2.0), n_users) * n_dims

    shared = rng.standard_normal((n_users, n_users))
    shared = (shared + shared.T) / np.sqrt(2)
    one_sided = rng.standard_normal((n_users, n_users))
    chemistry = chemistry_std * (0.8 * shared + 0.6 * one_sided)

    gender = rng.choice(3, size=n_users, p=[0.48, 0.48, 0.04])
    seeks = np.zeros((n_users, 3), dtype=bool)
    orientation = rng.choice(3, size=n_users, p=[0.85, 0.08, 0.07])
    binary = gender < 2
    other = 1 - gender
    idx = np.arange(n_users)
    seeks[idx[binary & (orientation == 0)], other[binary & (orientation == 0)]] = True
    seeks[idx[binary & (orientation == 1)], gender[binary & (orientation == 1)]] = True
    seeks[binary & (orientation == 2)] = True
    seeks[~binary] = True

    eligible = seeks[:, gender] & seeks[:, gender].T
    np.fill_diagonal(eligible, False)
    stated = prefs + stated_gap * rng.standard_normal(prefs.shape) if stated_gap > 0 else prefs
    return Population(traits, prefs, stated, weights, chemistry, gender, eligible)


def predictable_attraction(pop: Population) -> np.ndarray:
    w, p, t = pop.weights, pop.prefs, pop.traits
    squared = (w * p**2).sum(1)[:, None] - 2 * (w * p) @ t.T + w @ (t**2).T
    return -squared / w.shape[1]


def attraction(pop: Population) -> np.ndarray:
    return predictable_attraction(pop) + pop.chemistry


def _likert(latent: np.ndarray, noise: float, rng: np.random.Generator) -> np.ndarray:
    observed = latent + noise * rng.standard_normal(latent.shape)
    return np.digitize(observed, LIKERT_THRESHOLDS) + 1


def answer(
    pop: Population, users: np.ndarray, question: Question, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    k = question.dimension
    sign = -1.0 if question.reverse else 1.0
    self_answer = _likert(sign * pop.traits[users, k], question.noise, rng)
    pref_answer = _likert(sign * pop.stated_prefs[users, k], question.noise, rng)
    level = 3 + IMPORTANCE_SLOPE * np.log2(pop.weights[users, k])
    level += IMPORTANCE_ANSWER_NOISE * rng.standard_normal(len(users))
    importance = np.clip(np.rint(level), 1, 5).astype(int)
    return self_answer, pref_answer, importance


def likes(pop: Population, rng: np.random.Generator, selectivity: float = 0.8) -> np.ndarray:
    a = attraction(pop) + 0.2 * rng.standard_normal((pop.n_users, pop.n_users))
    masked = np.where(pop.eligible, a, np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        threshold = np.nanquantile(masked, selectivity, axis=1, keepdims=True)
    return pop.eligible & (a > threshold)
