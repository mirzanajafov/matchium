import numpy as np


def _ranks(x: np.ndarray) -> np.ndarray:
    return np.argsort(np.argsort(x)).astype(float)


def spearman(pred: np.ndarray, truth: np.ndarray, eligible: np.ndarray) -> float:
    values = []
    for u in range(len(pred)):
        pool = np.flatnonzero(eligible[u])
        if len(pool) < 3:
            continue
        values.append(np.corrcoef(_ranks(pred[u, pool]), _ranks(truth[u, pool]))[0, 1])
    return float(np.mean(values))


def precision_at_k(pred: np.ndarray, truth: np.ndarray, eligible: np.ndarray, k: int = 10, top: float = 0.05) -> float:
    values = []
    for u in range(len(pred)):
        pool = np.flatnonzero(eligible[u])
        n_best = max(1, int(round(top * len(pool))))
        if len(pool) < k or n_best < 1:
            continue
        best = set(pool[np.argsort(-truth[u, pool])[:n_best]])
        picked = pool[np.argsort(-pred[u, pool])[:k]]
        values.append(len(best.intersection(picked)) / min(k, n_best))
    return float(np.mean(values))


def mutual_like_rate(pairs: np.ndarray, like: np.ndarray) -> float:
    if len(pairs) == 0:
        return 0.0
    u, v = pairs[:, 0], pairs[:, 1]
    return float(np.mean(like[u, v] & like[v, u]))


def exposure(pairs: np.ndarray, n_users: int, symmetric: bool) -> np.ndarray:
    counts = np.bincount(pairs[:, 1], minlength=n_users)
    if symmetric:
        counts = counts + np.bincount(pairs[:, 0], minlength=n_users)
    return counts


def gini(x: np.ndarray) -> float:
    x = np.sort(np.asarray(x, dtype=float))
    if x.sum() == 0:
        return 0.0
    n = len(x)
    return float((2 * np.arange(1, n + 1) - n - 1).dot(x) / (n * x.sum()))
