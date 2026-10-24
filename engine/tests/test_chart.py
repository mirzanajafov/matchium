import xml.dom.minidom

from sim.chart import Series, decision_chart, line_chart, question_chart
from sim.results import DayRow, DecisionRow, Evaluation, Results


def evaluation(spearman: float) -> Evaluation:
    return {"spearman": spearman, "precision_at_10": 0.0, "mutual_like_rate": 0.0}


def day_rows(spearman: list[float]) -> list[DayRow]:
    return [
        {
            **evaluation(value),
            "cumulative_mutual_matches": i,
            "mean_confidence": 0.0,
            "day": i + 1,
            "questions_answered": 0,
        }
        for i, value in enumerate(spearman)
    ]


def decision_rows(spearman: list[float]) -> list[DecisionRow]:
    return [{"day": i + 1, "spearman": value, "cumulative_mutual_matches": i} for i, value in enumerate(spearman)]


def test_line_chart_is_valid_svg_with_one_line_per_series() -> None:
    svg = line_chart(
        "A & B",
        [Series("a", [1, 2, 3], [0.2, 0.5, 0.6], "#000"), Series("b <x>", [1, 3], [0.3, 0.3], "#111", dashed=True)],
        "day",
        "score",
        (0.0, 1.0),
    )
    doc = xml.dom.minidom.parseString(svg)
    assert len(doc.getElementsByTagName("polyline")) == 2
    assert "A &amp; B" in svg and "b &lt;x&gt;" in svg
    assert svg.count('stroke-dasharray="5 4"') == 2


def test_result_charts_render_from_simulation_output() -> None:
    results: Results = {
        "config": {"per_day": 6},
        "random": day_rows([0.3, 0.5, 0.6]),
        "adaptive": day_rows([0.4, 0.6, 0.7]),
        "allocation": {},
        "baselines": {"oracle": evaluation(0.77), "random": evaluation(0.0)},
        "decisions": {
            "honest": {"survey": decision_rows([0.5, 0.69]), "survey_and_decisions": decision_rows([0.5, 0.7])},
            "misreporting": {
                "survey": decision_rows([0.45, 0.63]),
                "survey_and_decisions": decision_rows([0.45, 0.68]),
            },
        },
    }
    for svg in (question_chart(results), decision_chart(results)):
        assert len(xml.dom.minidom.parseString(svg).getElementsByTagName("polyline")) == 3
