import argparse
import datetime as dt
import json
import logging
import os
import time
from dataclasses import dataclass

import numpy as np
import psycopg

from matchium import DIMENSIONS, Beliefs
from matchium.allocation import MIN_MUTUAL_SCORE, greedy_b_matching
from matchium.revealed import Decisions, learn, pool_spread
from matchium.scoring import confidence, directed_scores, explain, mutual_scores

GENDERS = ("WOMAN", "MAN", "NONBINARY")
LOCK_KEY = "matchium-nightly"
MATCHES_CHANNEL = "matches_ready"
log = logging.getLogger("matchium.nightly")


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


def city_key(user: dict) -> str:
    return user["city"].strip().lower()


def by_city(users: list[dict]) -> list[list[dict]]:
    groups: dict[str, list[dict]] = {}
    for user in users:
        groups.setdefault(city_key(user), []).append(user)
    return [groups[key] for key in sorted(groups)]


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
        if u.get("muGap"):
            beliefs.mu_gap[i] = u["muGap"]
            beliefs.var_gap[i] = u["varGap"]
        if u.get("muBar") is not None:
            beliefs.mu_bar[i] = u["muBar"]
            beliefs.var_bar[i] = u["varBar"]

    gender = np.array([GENDERS.index(u["gender"]) for u in users], dtype=int)
    seeks = np.array([[g in u["seeking"] for g in GENDERS] for u in users], dtype=bool).reshape(n, len(GENDERS))
    city = np.array([city_key(u) for u in users])
    eligible = seeks[:, gender] & seeks[:, gender].T & (city[:, None] == city[None, :])
    np.fill_diagonal(eligible, False)

    index = {user_id: i for i, user_id in enumerate(ids)}
    shown = np.zeros((n, n), dtype=bool)
    for a, b in history:
        if a in index and b in index:
            shown[index[a], index[b]] = shown[index[b], index[a]] = True
    return Pool(ids, beliefs, eligible, shown)


def learn_decisions(pool: Pool, decisions: list[tuple[str, str, bool]]) -> np.ndarray:
    index = {user_id: i for i, user_id in enumerate(pool.ids)}
    known = [(index[a], index[b], liked) for a, b, liked in decisions if a in index and b in index]
    if not known:
        return np.array([], dtype=int)
    chooser, target, liked = (np.array(column) for column in zip(*known))
    directed = directed_scores(pool.beliefs)
    learn(pool.beliefs, Decisions(chooser, target, liked.astype(bool)), *pool_spread(directed.mean, pool.eligible))
    return np.unique(chooser)


def plan(pool: Pool, per_user: int) -> list[PlannedMatch]:
    if len(pool.ids) < 2:
        return []
    directed = directed_scores(pool.beliefs)
    mutual = mutual_scores(directed.mean, pool.eligible)
    conf = confidence(directed, pool.beliefs.weights, pool.eligible)
    planned = []
    for u, v in greedy_b_matching(mutual, pool.eligible, pool.shown, per_user, MIN_MUTUAL_SCORE):
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
               b."muSelf", b."varSelf", b."muPref", b."varPref", b."logWSum", b."logWCount",
               b."muGap", b."varGap", b."muBar", b."varBar"
        FROM "User" u JOIN "Belief" b ON b."userId" = u.id
        WHERE b."answerCount" >= %s AND u."bannedAt" IS NULL
        ORDER BY u.id
        """,
        (min_answers,),
    ).fetchall()
    keys = (
        "id", "gender", "seeking", "city", "muSelf", "varSelf", "muPref", "varPref", "logWSum", "logWCount",
        "muGap", "varGap", "muBar", "varBar",
    )
    return [dict(zip(keys, row)) for row in rows]


def apply_decisions(conn: psycopg.Connection, pools: list[Pool]) -> int:
    rows = conn.execute(
        """
        SELECT d."matchId"::text, d."userId"::text,
               CASE WHEN d."userId" = m."userAId" THEN m."userBId" ELSE m."userAId" END::text, d.liked
        FROM "MatchDecision" d JOIN "Match" m ON m.id = d."matchId"
        WHERE d."learnedAt" IS NULL
        ORDER BY d."decidedAt", d."matchId", d."userId"
        FOR UPDATE OF d
        """
    ).fetchall()
    if not rows:
        return 0
    decisions = [(chooser, target, liked) for _, chooser, target, liked in rows]
    updates = []
    for pool in pools:
        b = pool.beliefs
        updates += [
            (b.mu_gap[i].tolist(), b.var_gap[i].tolist(), float(b.mu_bar[i]), float(b.var_bar[i]), pool.ids[i])
            for i in learn_decisions(pool, decisions)
        ]
    with conn.cursor() as cur:
        cur.executemany(
            'UPDATE "Belief" SET "muGap" = %s, "varGap" = %s, "muBar" = %s, "varBar" = %s WHERE "userId" = %s::uuid',
            updates,
        )
        cur.executemany(
            'UPDATE "MatchDecision" SET "learnedAt" = now() WHERE "matchId" = %s::uuid AND "userId" = %s::uuid',
            [(match_id, chooser) for match_id, chooser, _, _ in rows],
        )
    return len(rows)


def run(conn: psycopg.Connection, day: dt.date, per_user: int, min_answers: int) -> int:
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (LOCK_KEY,))
        if conn.execute('SELECT 1 FROM "Match" WHERE day = %s LIMIT 1', (day,)).fetchone():
            return 0
        history = conn.execute('SELECT "userAId"::text, "userBId"::text FROM "Match"').fetchall()
        started = time.perf_counter()
        pools = [build_pool(group, history) for group in by_city(load_users(conn, min_answers))]
        learned = apply_decisions(conn, pools)
        planned = [match for pool in pools for match in plan(pool, per_user)]
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO "Match" (id, day, "userAId", "userBId", score, confidence, aligned, friction)
                VALUES (gen_random_uuid(), %s, %s::uuid, %s::uuid, %s, %s, %s, %s)
                """,
                [(day, m.user_a, m.user_b, m.score, m.confidence, m.aligned, m.friction) for m in planned],
            )
        if planned:
            conn.execute("SELECT pg_notify(%s, %s)", (MATCHES_CHANNEL, json.dumps({"day": day.isoformat()})))
        log.info(
            json.dumps(
                {
                    "event": "nightly",
                    "day": day.isoformat(),
                    "users": sum(len(p.ids) for p in pools),
                    "cities": len(pools),
                    "largest_city": max((len(p.ids) for p in pools), default=0),
                    "decisions_learned": learned,
                    "matches": len(planned),
                    "seconds": round(time.perf_counter() - started, 3),
                }
            )
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
