import pytest

from sim.run import parse_args


@pytest.mark.parametrize("argv", [["--days", "1"], ["--long-days", "1"]])
def test_a_simulation_too_short_to_chart_is_a_usage_error(argv: list[str], capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as stopped:
        parse_args(argv)
    assert stopped.value.code == 2
    assert "at least 2 days" in capsys.readouterr().err


def test_two_days_are_enough() -> None:
    config = parse_args(["--days", "2", "--long-days", "2"])
    assert (config.days, config.long_days) == (2, 2)
