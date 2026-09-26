import xml.dom.minidom

from sim.chart import Series, decision_chart, line_chart, question_chart


def rows(values):
    return [{"day": i + 1, "spearman": v, "cumulative_mutual_matches": i} for i, v in enumerate(values)]


def test_line_chart_is_valid_svg_with_one_line_per_series():
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


def test_result_charts_render_from_simulation_output():
    results = {
        "config": {"per_day": 6},
        "adaptive": rows([0.4, 0.6, 0.7]),
        "random": rows([0.3, 0.5, 0.6]),
        "baselines": {"oracle": {"spearman": 0.77}},
        "decisions": {
            "honest": {"survey": rows([0.5, 0.69])},
            "misreporting": {"survey": rows([0.45, 0.63]), "survey_and_decisions": rows([0.45, 0.68])},
        },
    }
    for svg in (question_chart(results), decision_chart(results)):
        assert len(xml.dom.minidom.parseString(svg).getElementsByTagName("polyline")) == 3
