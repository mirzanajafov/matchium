import math
from dataclasses import dataclass

import numpy as np

from .model import Beliefs
from .scoring import pair_scores, standardize

DECISION_NOISE = 0.6
_erfc = np.frompyfunc(math.erfc, 1, 1)


@dataclass
class Decisions:
    chooser: np.ndarray
    target: np.ndarray
    liked: np.ndarray

    def __len__(self) -> int:
        return len(self.chooser)


def normal_cdf(x: np.ndarray) -> np.ndarray:
    return 0.5 * _erfc(-np.asarray(x, dtype=float) / math.sqrt(2)).astype(float)


def pool_spread(scores: np.ndarray, eligible: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    _, center, scale = standardize(scores, eligible)
    return center[:, 0], np.sqrt(scale[:, 0] ** 2 + DECISION_NOISE**2)


def learn(beliefs: Beliefs, decisions: Decisions, center: np.ndarray, spread: np.ndarray) -> None:
    if len(decisions) == 0:
        return
    order = np.argsort(decisions.chooser, kind="stable")
    chooser = decisions.chooser[order]
    first = np.searchsorted(chooser, chooser)
    rank = np.empty(len(order), dtype=int)
    rank[order] = np.arange(len(order)) - first
    d = beliefs.mu_self.shape[1]

    for r in range(rank.max() + 1):
        pick = rank == r
        u, v = decisions.chooser[pick], decisions.target[pick]
        y = np.where(decisions.liked[pick], 1.0, -1.0)

        mean, std = pair_scores(beliefs, u, v)
        cut = center[u] + spread[u] * beliefs.mu_bar[u]
        total = np.sqrt(std**2 + DECISION_NOISE**2 + spread[u] ** 2 * beliefs.var_bar[u])
        t = np.clip(y * (mean - cut) / total, -30.0, 30.0)
        ratio = np.exp(-0.5 * t**2) / math.sqrt(2 * math.pi) / normal_cdf(t)
        shrink = ratio * (ratio + t)
        step, squeeze = y * ratio / total, shrink / total**2

        g = -2 * beliefs.weights[u] * (beliefs.pref_mean[u] - beliefs.mu_self[v]) / d
        var = beliefs.var_gap[u]
        beliefs.mu_gap[u] += step[:, None] * var * g
        beliefs.var_gap[u] = var - squeeze[:, None] * var**2 * g**2

        h = -spread[u]
        var_bar = beliefs.var_bar[u]
        beliefs.mu_bar[u] += step * var_bar * h
        beliefs.var_bar[u] = var_bar - squeeze * var_bar**2 * h**2
