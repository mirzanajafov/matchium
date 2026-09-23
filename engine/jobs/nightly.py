import argparse
import datetime as dt
import os
from dataclasses import dataclass

import numpy as np
import psycopg

from matchium import DIMENSIONS, Beliefs
from matchium.allocation import greedy_b_matching
from matchium.scoring import confidence, directed_scores, explain, mutual_scores

GENDERS = ("WOMAN", "MAN", "NONBINARY")
LOCK_KEY = "matchium-nightly"


@dataclass
class Pool:
    ids: list[str]
    beliefs: Beliefs
    eligible: np.ndarray
    shown: np.ndarray


@dataclass
class PlannedMatch:
    user_a: str
    user_b: str
    score: float
    confidence: float
    aligned: list[str]
    friction: str


def build_pool(users: list[dict], history: list[tuple[str, str]]) -> Pool:
    n = len(users)
    ids = [u["id"] for u in users]
    beliefs = Beliefs(n, len(DIMENSIONS), 0)
    for i, u in enumerate(users):
        beliefs.mu_self[i] = u["muSelf"]
        beliefs.var_self[i] = u["varSelf"]
        beliefs.mu_pref[i] = u["muPref"]
        beliefs.var_pref[i] = u["varPref"]
        beliefs.log_w_sum[i] = u["logWSum"]
        beliefs.log_w_count[i] = u["logWCount"]

    gender = np.array([GENDERS.index(u["gender"]) for u in users], dtype=int)
    seeks = np.array([[g in u["seeking"] for g in GENDERS] for u in users], dtype=bool).reshape(n, len(GENDERS))
    city = np.array([u["city"].strip().lower() for u in users])
    eligible = seeks[:, gender] & seeks[:, gender].T & (city[:, None] == city[None, :])
    np.fill_diagonal(eligible, False)

    index = {user_id: i for i, user_id in enumerate(ids)}
    shown = np.zeros((n, n), dtype=bool)
    for a, b in history:
        if a in index and b in index:
            shown[index[a], index[b]] = shown[index[b], index[a]] = True
    return Pool(ids, beliefs, eligible, shown)


def plan(pool: Pool, per_user: int) -> list[PlannedMatch]:
    if len(pool.ids) < 2:
        return []
    directed = directed_scores(pool.beliefs)
    mutual = mutual_scores(directed.mean, pool.eligible)
    conf = confidence(directed, pool.beliefs.weights, pool.eligible)
    planned = []
    for u, v in greedy_b_matching(mutual, pool.eligible, pool.shown, per_user):
        a, b = sorted((int(u), int(v)), key=lambda i: pool.ids[i])
        why = explain(pool.beliefs, a, b)
        planned.append(
            PlannedMatch(pool.ids[a], pool.ids[b], float(mutual[a, b]), float(conf[a, b]), why["aligned"], why["friction"])
        )
    return planned


def load_users(conn: psycopg.Connection, min_answers: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT u.id::text, u.gender::text, u.seeking::text[], u.city,
               b."muSelf", b."varSelf", b."muPref", b."varPref", b."logWSum", b."logWCount"
        FROM "User" u JOIN "Belief" b ON b."userId" = u.id
        WHERE b."answerCount" >= %s
        ORDER BY u.id
        """,
        (min_answers,),
    ).fetchall()
    keys = ("id", "gender", "seeking", "city", "muSelf", "varSelf", "muPref", "varPref", "logWSum", "logWCount")
    return [dict(zip(keys, row)) for row in rows]


def run(conn: psycopg.Connection, day: dt.date, per_user: int, min_answers: int) -> int:
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (LOCK_KEY,))
        if conn.execute('SELECT 1 FROM "Match" WHERE day = %s LIMIT 1', (day,)).fetchone():
            return 0
        history = conn.execute('SELECT "userAId"::text, "userBId"::text FROM "Match"').fetchall()
        planned = plan(build_pool(load_users(conn, min_answers), history), per_user)
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO "Match" (id, day, "userAId", "userBId", score, confidence, aligned, friction)
                VALUES (gen_random_uuid(), %s, %s::uuid, %s::uuid, %s, %s, %s, %s)
                """,
                [(day, m.user_a, m.user_b, m.score, m.confidence, m.aligned, m.friction) for m in planned],
            )
        return len(planned)


def main():
    parser = argparse.ArgumentParser(description="Score every eligible pair and write the day's matches.")
    parser.add_argument("--date", type=dt.date.fromisoformat, default=dt.datetime.now(dt.UTC).date())
    parser.add_argument("--per-user", type=int, default=3)
    parser.add_argument("--min-answers", type=int, default=6)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    args = parser.parse_args()
    if not args.database_url:
        parser.error("set DATABASE_URL or pass --database-url")

    with psycopg.connect(args.database_url) as conn:
        created = run(conn, args.date, args.per_user, args.min_answers)
    print(f"{args.date}: {created} matches created" if created else f"{args.date}: nothing to do")


if __name__ == "__main__":
    main()
