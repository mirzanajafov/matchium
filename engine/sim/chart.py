import json
from dataclasses import dataclass
from html import escape
from pathlib import Path

WIDTH, HEIGHT = 640, 360
LEFT, RIGHT, TOP, BOTTOM = 56, 175, 44, 44
INK, MUTED, GRID = "#1d1f1c", "#6b6f68", "#e3e1d9"


@dataclass
class Series:
    label: str
    x: list[float]
    y: list[float]
    color: str
    dashed: bool = False


def _ticks(low: float, high: float, count: int = 5) -> list[float]:
    step = (high - low) / (count - 1)
    return [low + i * step for i in range(count)]


def _day_ticks(first: float, last: float) -> list[int]:
    if last - first <= 10:
        return list(range(round(first), round(last) + 1))
    return sorted({round(v) for v in _ticks(first, last)})


def line_chart(title: str, series: list[Series], x_label: str, y_label: str, y_range: tuple[float, float]) -> str:
    x_min = min(min(s.x) for s in series)
    x_max = max(max(s.x) for s in series)
    y_min, y_max = y_range
    plot_w, plot_h = WIDTH - LEFT - RIGHT, HEIGHT - TOP - BOTTOM

    def px(x: float) -> float:
        return LEFT + (x - x_min) / (x_max - x_min) * plot_w

    def py(y: float) -> float:
        return TOP + (1 - (y - y_min) / (y_max - y_min)) * plot_h

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}" '
        f'font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="12">',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#ffffff" rx="8"/>',
        f'<text x="{LEFT}" y="24" font-size="14" font-weight="600" fill="{INK}">{escape(title)}</text>',
    ]
    for y in _ticks(y_min, y_max, round((y_max - y_min) / 0.1) + 1):
        parts.append(f'<line x1="{LEFT}" x2="{LEFT + plot_w}" y1="{py(y):.1f}" y2="{py(y):.1f}" stroke="{GRID}"/>')
        parts.append(f'<text x="{LEFT - 8}" y="{py(y) + 4:.1f}" text-anchor="end" fill="{MUTED}">{y:.2f}</text>')
    for x in _day_ticks(x_min, x_max):
        parts.append(f'<text x="{px(x):.1f}" y="{TOP + plot_h + 18}" text-anchor="middle" fill="{MUTED}">{x}</text>')
    parts.append(
        f'<text x="{LEFT + plot_w / 2:.1f}" y="{HEIGHT - 6}" text-anchor="middle" fill="{MUTED}">{escape(x_label)}</text>'
    )
    parts.append(
        f'<text transform="translate(14 {TOP + plot_h / 2:.1f}) rotate(-90)" text-anchor="middle" fill="{MUTED}">'
        f"{escape(y_label)}</text>"
    )

    for i, s in enumerate(series):
        points = " ".join(f"{px(x):.1f},{py(y):.1f}" for x, y in zip(s.x, s.y))
        dash = ' stroke-dasharray="5 4"' if s.dashed else ""
        parts.append(
            f'<polyline points="{points}" fill="none" stroke="{s.color}" stroke-width="2.5" '
            f'stroke-linejoin="round" stroke-linecap="round"{dash}/>'
        )
        legend_y = TOP + 8 + i * 20
        parts.append(
            f'<line x1="{WIDTH - RIGHT + 16}" x2="{WIDTH - RIGHT + 36}" y1="{legend_y}" y2="{legend_y}" '
            f'stroke="{s.color}" stroke-width="2.5"{dash}/>'
        )
        parts.append(f'<text x="{WIDTH - RIGHT + 42}" y="{legend_y + 4}" fill="{INK}">{escape(s.label)}</text>')
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def question_chart(results: dict) -> str:
    days = [row["day"] for row in results["adaptive"]]
    oracle = results["baselines"]["oracle"]["spearman"]
    return line_chart(
        "Accuracy by question policy",
        [
            Series("adaptive", days, [row["spearman"] for row in results["adaptive"]], "#1f9d63"),
            Series("random order", days, [row["spearman"] for row in results["random"]], "#8a8f86"),
            Series("oracle ceiling", [days[0], days[-1]], [oracle, oracle], "#1d1f1c", dashed=True),
        ],
        f"day ({results['config']['per_day']} questions a day)",
        "rank correlation with truth",
        (0.2, 0.8),
    )


def decision_chart(results: dict) -> str:
    runs = results["decisions"]
    days = [row["day"] for row in runs["misreporting"]["survey"]]

    def spearman(rows: list[dict]) -> list[float]:
        return [row["spearman"] for row in rows]

    return line_chart(
        "Learning from likes and passes",
        [
            Series("honest answers", days, spearman(runs["honest"]["survey"]), "#8a8f86", dashed=True),
            Series("misreported + likes", days, spearman(runs["misreporting"]["survey_and_decisions"]), "#1f9d63"),
            Series("misreported only", days, spearman(runs["misreporting"]["survey"]), "#c2553a"),
        ],
        "day",
        "rank correlation with truth",
        (0.4, 0.8),
    )


def render(results: dict, directory: Path) -> None:
    (directory / "questions.svg").write_text(question_chart(results))
    if "decisions" in results:
        (directory / "decisions.svg").write_text(decision_chart(results))


def main():
    directory = Path(__file__).resolve().parents[1] / "results"
    render(json.loads((directory / "latest.json").read_text()), directory)


if __name__ == "__main__":
    main()
