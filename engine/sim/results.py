from typing import TypedDict


class Evaluation(TypedDict):
    spearman: float
    precision_at_10: float
    mutual_like_rate: float


class DayRow(Evaluation):
    cumulative_mutual_matches: int
    mean_confidence: float
    day: int
    questions_answered: int


class AllocationRow(TypedDict):
    mutual_like_rate: float
    exposure_gini: float
    max_exposure: int
    users_never_shown: float


class Baselines(TypedDict):
    oracle: Evaluation
    random: Evaluation


class DecisionRow(TypedDict):
    day: int
    spearman: float
    cumulative_mutual_matches: int


class DecisionRuns(TypedDict):
    survey: list[DecisionRow]
    survey_and_decisions: list[DecisionRow]


class Results(TypedDict):
    config: dict[str, float]
    random: list[DayRow]
    adaptive: list[DayRow]
    allocation: dict[str, AllocationRow]
    baselines: Baselines
    decisions: dict[str, DecisionRuns]
