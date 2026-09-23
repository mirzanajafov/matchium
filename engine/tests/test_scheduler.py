import datetime as dt

import pytest

from jobs.scheduler import next_run, run_with_retry, serve

UTC = dt.UTC
AT = dt.time(3, 0)


class Stop(Exception):
    pass


class FakeTime:
    def __init__(self, start: dt.datetime, stop_after: int):
        self.now = start
        self.sleeps: list[float] = []
        self.stop_after = stop_after

    def clock(self) -> dt.datetime:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        if len(self.sleeps) > self.stop_after:
            raise Stop
        self.now += dt.timedelta(seconds=seconds)


def test_next_run_is_today_before_the_hour_and_tomorrow_after():
    assert next_run(dt.datetime(2026, 9, 23, 1, 30, tzinfo=UTC), AT) == dt.datetime(2026, 9, 23, 3, 0, tzinfo=UTC)
    assert next_run(dt.datetime(2026, 9, 23, 3, 0, tzinfo=UTC), AT) == dt.datetime(2026, 9, 24, 3, 0, tzinfo=UTC)
    assert next_run(dt.datetime(2026, 9, 23, 22, 0, tzinfo=UTC), AT) == dt.datetime(2026, 9, 24, 3, 0, tzinfo=UTC)


def test_retries_then_gives_up():
    calls, sleeps = [], []

    def flaky(day):
        calls.append(day)
        raise RuntimeError("db down")

    assert run_with_retry(flaky, dt.date(2026, 9, 23), sleeps.append, retry_delay=5, attempts=3) is False
    assert len(calls) == 3
    assert sleeps == [5, 5]


def test_recovers_after_a_failure():
    outcomes = iter([RuntimeError("blip"), 12])

    def job(day):
        result = next(outcomes)
        if isinstance(result, Exception):
            raise result
        return result

    assert run_with_retry(job, dt.date(2026, 9, 23), lambda s: None, retry_delay=1, attempts=3) is True


def test_serve_catches_up_on_start_then_runs_daily():
    fake = FakeTime(dt.datetime(2026, 9, 23, 10, 0, tzinfo=UTC), stop_after=2)
    days = []

    with pytest.raises(Stop):
        serve(lambda day: days.append(day) or 1, AT, clock=fake.clock, sleep=fake.sleep)

    assert days == [dt.date(2026, 9, 23), dt.date(2026, 9, 24), dt.date(2026, 9, 25)]
    assert fake.sleeps[0] == 17 * 3600
    assert fake.sleeps[1] == 24 * 3600
