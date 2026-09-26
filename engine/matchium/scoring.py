import warnings
from dataclasses import dataclass

import numpy as np

from .model import PRIOR_VAR, Beliefs
from .questions import DIMENSIONS

MUTUAL_SHARPNESS = 1.5


@dataclass
class DirectedScores:
    mean: np.ndarray
    std: np.ndarray


def directed_scores(beliefs: Beliefs) -> DirectedScores:
    w = beliefs.weights
    mp, vp = beliefs.pref_mean, beliefs.pref_var
    mt, vt = beliefs.mu_self, beliefs.var_self
    d = w.shape[1]

    squared = (w * mp**2).sum(1)[:, None] - 2 * (w * mp) @ mt.T + w @ (mt**2).T
    spread = (w * vp).sum(1)[:, None] + w @ vt.T
    mean = -(squared + spread) / d

    w2 = w**2
    var_term = (
        (w2 * mp**2 * vp).sum(1)[:, None]
        + (w2 * mp**2) @ vt.T
        - 2 * (w2 * mp * vp) @ mt.T
        - 2 * (w2 * mp) @ (mt * vt).T
        + (w2 * vp) @ (mt**2).T
        + w2 @ (mt**2 * vt).T
    )
    spread_term = (w2 * vp**2).sum(1)[:, None] + 2 * (w2 * vp) @ vt.T + w2 @ (vt**2).T
    std = np.sqrt(np.maximum(4 * var_term + 2 * spread_term, 0.0)) / d
    return DirectedScores(mean, std)


def pair_scores(beliefs: Beliefs, u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    w = beliefs.weights[u]
    diff = beliefs.pref_mean[u] - beliefs.mu_self[v]
    spread = beliefs.pref_var[u] + beliefs.var_self[v]
    d = w.shape[1]
    mean = -(w * (diff**2 + spread)).sum(1) / d
    std = np.sqrt((w**2 * (4 * diff**2 * spread + 2 * spread**2)).sum(1)) / d
    return mean, std


def standardize(scores: np.ndarray, eligible: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    masked = np.where(eligible, scores, np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        center = np.nanmean(masked, axis=1, keepdims=True)
        scale = np.nanstd(masked, axis=1, keepdims=True)
    center = np.where(np.isfinite(center), center, 0.0)
    scale = np.where(np.isfinite(scale) & (scale > 1e-9), scale, 1.0)
    return (scores - center) / scale, center, scale


def mutual_scores(scores: np.ndarray, eligible: np.ndarray) -> np.ndarray:
    z, _, _ = standardize(scores, eligible)
    p = 1.0 / (1.0 + np.exp(-MUTUAL_SHARPNESS * z))
    return np.where(eligible, np.sqrt(p * p.T), 0.0)


def confidence(directed: DirectedScores, weights: np.ndarray, eligible: np.ndarray) -> np.ndarray:
    d = weights.shape[1]
    prior_std = np.sqrt(2 * (2 * PRIOR_VAR) ** 2 * (weights**2).sum(1))[:, None] / d
    removed = np.clip(1.0 - directed.std / prior_std, 0.0, 1.0)
    return np.where(eligible, (removed + removed.T) / 2, 0.0)


def explain(beliefs: Beliefs, u: int, v: int, top: int = 2) -> dict:
    w = beliefs.weights
    cost_uv = w[u] * (beliefs.pref_mean[u] - beliefs.mu_self[v]) ** 2
    cost_vu = w[v] * (beliefs.pref_mean[v] - beliefs.mu_self[u]) ** 2
    importance = w[u] + w[v]
    cost = cost_uv + cost_vu
    distance = cost / importance
    important = np.flatnonzero(importance >= np.median(importance))
    aligned = important[np.argsort(distance[important])][:top]
    return {
        "aligned": [DIMENSIONS[k] for k in aligned],
        "friction": DIMENSIONS[int(np.argmax(cost))],
        "per_dimension": {DIMENSIONS[k]: round(float(cost[k]), 3) for k in range(len(DIMENSIONS))},
    }
