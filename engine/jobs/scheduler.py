import argparse
import datetime as dt
import logging
import os
import time
from collections.abc import Callable

import psycopg

from jobs.nightly import run

log = logging.getLogger("matchium.scheduler")

Clock = Callable[[], dt.datetime]
Sleep = Callable[[float], None]


def next_run(now: dt.datetime, at: dt.time) -> dt.datetime:
    candidate = dt.datetime.combine(now.date(), at, tzinfo=dt.UTC)
    return candidate if candidate > now else candidate + dt.timedelta(days=1)


def run_day(database_url: str, day: dt.date, per_user: int, min_answers: int) -> int:
    with psycopg.connect(database_url) as conn:
        return run(conn, day, per_user, min_answers)


def run_with_retry(job: Callable[[dt.date], int], day: dt.date, sleep: Sleep, retry_delay: float, attempts: int) -> bool:
    for attempt in range(1, attempts + 1):
        try:
            created = job(day)
            log.info("%s: %s", day, f"{created} matches created" if created else "already done")
            return True
        except Exception:
            log.exception("%s: attempt %d of %d failed", day, attempt, attempts)
            if attempt < attempts:
                sleep(retry_delay)
    return False


def serve(
    job: Callable[[dt.date], int],
    at: dt.time,
    clock: Clock = lambda: dt.datetime.now(dt.UTC),
    sleep: Sleep = time.sleep,
    retry_delay: float = 300,
    attempts: int = 6,
) -> None:
    run_with_retry(job, clock().date(), sleep, retry_delay, attempts)
    while True:
        due = next_run(clock(), at)
        log.info("next run at %s", due.isoformat())
        sleep(max((due - clock()).total_seconds(), 0))
        run_with_retry(job, due.date(), sleep, retry_delay, attempts)


def main():
    parser = argparse.ArgumentParser(description="Run the nightly matching job every day at a fixed UTC time.")
    parser.add_argument("--at", type=dt.time.fromisoformat, default=dt.time.fromisoformat(os.environ.get("MATCH_AT", "03:00")))
    parser.add_argument("--per-user", type=int, default=int(os.environ.get("MATCHES_PER_USER", "3")))
    parser.add_argument("--min-answers", type=int, default=int(os.environ.get("MIN_ANSWERS", "6")))
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    args = parser.parse_args()
    if not args.database_url:
        parser.error("set DATABASE_URL or pass --database-url")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    serve(lambda day: run_day(args.database_url, day, args.per_user, args.min_answers), args.at)


if __name__ == "__main__":
    main()
