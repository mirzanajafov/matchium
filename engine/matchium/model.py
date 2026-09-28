import numpy as np

from .questions import Question

LIKERT_CENTERS = np.array([-1.9, -0.95, 0.0, 0.95, 1.9])
QUANTIZATION_VAR = 0.1
PRIOR_VAR = 1.0
IMPORTANCE_SLOPE = 1.5
IMPORTANCE_PRIOR_COUNT = 1.0
GAP_PRIOR_VAR = 0.1
BAR_PRIOR_MEAN = 0.84
BAR_PRIOR_VAR = 0.25


def observation_var(question: Question) -> float:
    return question.noise**2 + QUANTIZATION_VAR


def posterior_var(var: np.ndarray, obs_var: float) -> np.ndarray:
    return var * obs_var / (var + obs_var)


class Beliefs:
    def __init__(self, n_users: int, n_dims: int, n_questions: int):
        self.mu_self = np.zeros((n_users, n_dims))
        self.var_self = np.full((n_users, n_dims), PRIOR_VAR)
        self.mu_pref = np.zeros((n_users, n_dims))
        self.var_pref = np.full((n_users, n_dims), PRIOR_VAR)
        self.log_w_sum = np.zeros((n_users, n_dims))
        self.log_w_count = np.full((n_users, n_dims), IMPORTANCE_PRIOR_COUNT)
        self.mu_gap = np.zeros((n_users, n_dims))
        self.var_gap = np.full((n_users, n_dims), GAP_PRIOR_VAR)
        self.mu_bar = np.full(n_users, BAR_PRIOR_MEAN)
        self.var_bar = np.full(n_users, BAR_PRIOR_VAR)
        self.answered = np.zeros((n_users, n_questions), dtype=bool)

    @property
    def n_users(self) -> int:
        return self.mu_self.shape[0]

    @property
    def pref_mean(self) -> np.ndarray:
        return self.mu_pref + self.mu_gap

    @property
    def pref_var(self) -> np.ndarray:
        return self.var_pref + self.var_gap

    @property
    def weights(self) -> np.ndarray:
        return 2.0 ** (self.log_w_sum / self.log_w_count)

    def observe(
        self,
        users: np.ndarray,
        q_index: int,
        question: Question,
        self_answer: np.ndarray,
        pref_answer: np.ndarray,
        importance: np.ndarray,
    ) -> None:
        k = question.dimension
        sign = -1.0 if question.reverse else 1.0
        obs_var = observation_var(question)

        for mu, var, answer in (
            (self.mu_self, self.var_self, self_answer),
            (self.mu_pref, self.var_pref, pref_answer),
        ):
            z = sign * LIKERT_CENTERS[np.asarray(answer) - 1]
            prior_var = var[users, k]
            gain = prior_var / (prior_var + obs_var)
            mu[users, k] += gain * (z - mu[users, k])
            var[users, k] = posterior_var(prior_var, obs_var)

        self.log_w_sum[users, k] += (np.asarray(importance) - 3) / IMPORTANCE_SLOPE
        self.log_w_count[users, k] += 1
        self.answered[users, q_index] = True
