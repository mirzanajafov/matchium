import numpy as np


def naive_top_k(mutual: np.ndarray, eligible: np.ndarray, shown: np.ndarray, k: int) -> np.ndarray:
    scores = np.where(eligible & ~shown, mutual, -np.inf)
    top = np.argsort(-scores, axis=1)[:, :k]
    viewers = np.repeat(np.arange(len(mutual)), k)
    candidates = top.ravel()
    valid = np.isfinite(scores[viewers, candidates])
    return np.stack([viewers[valid], candidates[valid]], axis=1)


def greedy_b_matching(mutual: np.ndarray, eligible: np.ndarray, shown: np.ndarray, k: int) -> np.ndarray:
    upper = np.triu(eligible & ~shown, 1)
    us, vs = np.nonzero(upper)
    order = np.argsort(-mutual[us, vs], kind="stable")
    degree = np.zeros(len(mutual), dtype=int)
    pairs = []
    for i in order:
        u, v = us[i], vs[i]
        if degree[u] < k and degree[v] < k:
            pairs.append((u, v))
            degree[u] += 1
            degree[v] += 1
    return np.array(pairs, dtype=int).reshape(-1, 2)
