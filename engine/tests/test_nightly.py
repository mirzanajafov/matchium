import datetime as dt
import json
import os
import uuid
from collections.abc import Iterator
from dataclasses import replace

import numpy as np
import psycopg
import pytest

from jobs.nightly import PlannedMatch, User, build_pool, by_city, learn_decisions, plan, run
from matchium import DIMENSIONS
from matchium.allocation import MIN_MUTUAL_SCORE
from matchium.model import BAR_PRIOR_MEAN, GAP_PRIOR_VAR

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://matchium:matchium@localhost:5441/matchium_test")


def fake_user(rng: np.random.Generator, gender: str, seeking: list[str], city: str = "Baku") -> User:
    d = len(DIMENSIONS)
    return User(
        id=str(uuid.uuid4()),
        gender=gender,
        seeking=seeking,
        city=city,
        mu_self=rng.standard_normal(d).tolist(),
        var_self=rng.uniform(0.1, 0.5, d).tolist(),
        mu_pref=rng.standard_normal(d).tolist(),
        var_pref=rng.uniform(0.1, 0.5, d).tolist(),
        log_w_sum=rng.standard_normal(d).tolist(),
        log_w_count=[4.0] * d,
        mu_gap=[],
        var_gap=[],
        mu_bar=None,
        var_bar=None,
    )


def population(rng: np.random.Generator) -> list[User]:
    women = [fake_user(rng, "WOMAN", ["MAN"]) for _ in range(8)]
    men = [fake_user(rng, "MAN", ["WOMAN"]) for _ in range(8)]
    elsewhere = [fake_user(rng, "WOMAN", ["MAN"], city="Ganja"), fake_user(rng, "MAN", ["WOMAN"], city=" ganja ")]
    return women + men + elsewhere


def test_plan_respects_capacity_eligibility_and_history() -> None:
    rng = np.random.default_rng(0)
    users = population(rng)
    by_id = {u.id: u for u in users}
    history = [(users[0].id, users[8].id)]
    matches = plan(build_pool(users, history), per_user=3)

    degree: dict[str, int] = {}
    for m in matches:
        a, b = by_id[m.user_a], by_id[m.user_b]
        assert m.user_a < m.user_b
        assert a.gender in b.seeking and b.gender in a.seeking
        assert a.city.strip().lower() == b.city.strip().lower()
        assert {m.user_a, m.user_b} != {users[0].id, users[8].id}
        assert 0 < m.score < 1 and 0 <= m.confidence <= 1
        assert set(m.aligned) <= set(DIMENSIONS) and m.friction in DIMENSIONS
        for uid in (m.user_a, m.user_b):
            degree[uid] = degree.get(uid, 0) + 1
    assert max(degree.values()) <= 3
    assert {users[-2].id, users[-1].id} in [{m.user_a, m.user_b} for m in matches]


def test_learn_decisions_updates_only_choosers_in_the_pool() -> None:
    rng = np.random.default_rng(3)
    users = population(rng)
    pool = build_pool(users, [])
    outsider = str(uuid.uuid4())
    updated = learn_decisions(
        pool,
        [
            (users[0].id, users[8].id, True),
            (users[9].id, users[1].id, False),
            (outsider, users[2].id, True),
        ],
    )
    assert sorted(updated.tolist()) == [0, 9]
    assert np.any(pool.beliefs.mu_gap[0] != 0) and np.any(pool.beliefs.mu_gap[9] != 0)
    assert np.all(pool.beliefs.mu_gap[8] == 0) and pool.beliefs.mu_bar[8] == BAR_PRIOR_MEAN
    assert learn_decisions(pool, []).size == 0


def test_build_pool_reads_stored_revealed_state() -> None:
    rng = np.random.default_rng(4)
    user = fake_user(rng, "WOMAN", ["MAN"])
    fresh = build_pool([user], []).beliefs
    assert np.all(fresh.var_gap == GAP_PRIOR_VAR) and fresh.mu_bar[0] == BAR_PRIOR_MEAN

    d = len(DIMENSIONS)
    learned = replace(user, mu_gap=[0.1] * d, var_gap=[0.2] * d, mu_bar=1.1, var_bar=0.2)
    stored = build_pool([learned], []).beliefs
    assert np.allclose(stored.pref_mean[0], np.array(user.mu_pref) + 0.1)
    assert stored.mu_bar[0] == 1.1 and stored.var_bar[0] == 0.2


def key(m: PlannedMatch) -> tuple[str, str, float, float]:
    return (m.user_a, m.user_b, round(m.score, 12), round(m.confidence, 12))


def test_scoring_city_by_city_gives_the_same_matches_as_one_big_pool() -> None:
    rng = np.random.default_rng(8)
    users = [
        fake_user(rng, g, [o], city=c)
        for c in ("Baku", "Ganja", " baku", "Sumqayit")
        for g, o in (("WOMAN", "MAN"), ("MAN", "WOMAN"))
        for _ in range(4)
    ]
    history = [(users[0].id, users[1].id)]

    whole = sorted(map(key, plan(build_pool(users, history), per_user=3)))
    groups = by_city(users)
    split = sorted(key(m) for group in groups for m in plan(build_pool(group, history), per_user=3))

    assert [len(g) for g in groups] == [16, 8, 8]
    assert whole == split and len(whole) > 0


def test_plan_skips_pairs_below_the_score_floor() -> None:
    rng = np.random.default_rng(9)
    users = population(rng)
    matches = plan(build_pool(users, []), per_user=3)
    assert matches and min(m.score for m in matches) >= MIN_MUTUAL_SCORE


def test_plan_handles_tiny_pools() -> None:
    rng = np.random.default_rng(1)
    assert plan(build_pool([], []), 3) == []
    assert plan(build_pool([fake_user(rng, "WOMAN", ["MAN"])], []), 3) == []


@pytest.fixture
def conn() -> Iterator[psycopg.Connection]:
    try:
        connection = psycopg.connect(TEST_DATABASE_URL, connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("test database not available")
    [(match_table,)] = connection.execute("SELECT to_regclass('\"Match\"')").fetchall()
    if match_table is None:
        connection.close()
        pytest.skip("test database has no schema (run the API e2e setup first)")
    connection.execute('TRUNCATE "User" CASCADE')
    connection.commit()
    yield connection
    connection.execute('TRUNCATE "User" CASCADE')
    connection.commit()
    connection.close()


def insert_users(conn: psycopg.Connection, users: list[User], answer_count: int = 6) -> None:
    with conn.cursor() as cur:
        for u in users:
            cur.execute(
                """
                INSERT INTO "User" (id, email, "passwordHash", "displayName", "birthDate", gender, seeking, city)
                VALUES (%s, %s, 'x', 'Test', '1995-01-01', %s::"Gender", %s::"Gender"[], %s)
                """,
                (u.id, f"{u.id}@example.com", u.gender, u.seeking, u.city),
            )
            cur.execute(
                """
                INSERT INTO "Belief" ("userId", "muSelf", "varSelf", "muPref", "varPref", "logWSum", "logWCount",
                                      "answerCount", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                """,
                (u.id, u.mu_self, u.var_self, u.mu_pref, u.var_pref, u.log_w_sum, u.log_w_count, answer_count),
            )
    conn.commit()


def test_run_writes_matches_once_per_day_and_never_repeats_pairs(conn: psycopg.Connection) -> None:
    rng = np.random.default_rng(2)
    users = population(rng)
    newcomer = fake_user(rng, "WOMAN", ["MAN"])
    insert_users(conn, users)
    insert_users(conn, [newcomer], answer_count=2)
    day = dt.date(2026, 9, 23)

    created = run(conn, day, per_user=3, min_answers=6)
    assert created > 0
    assert run(conn, day, per_user=3, min_answers=6) == 0

    rows = conn.execute('SELECT "userAId"::text, "userBId"::text FROM "Match" WHERE day = %s', (day,)).fetchall()
    assert len(rows) == created
    assert all(newcomer.id not in pair for pair in rows)

    run(conn, day + dt.timedelta(days=1), per_user=3, min_answers=6)
    pairs = conn.execute('SELECT "userAId", "userBId" FROM "Match"').fetchall()
    assert len(pairs) == len(set(pairs))


def test_run_skips_banned_users(conn: psycopg.Connection) -> None:
    rng = np.random.default_rng(7)
    users = population(rng)
    insert_users(conn, users)
    banned = users[0].id
    conn.execute('UPDATE "User" SET "bannedAt" = now() WHERE id = %s::uuid', (banned,))
    conn.commit()
    run(conn, dt.date(2026, 9, 23), per_user=3, min_answers=6)
    conn.commit()
    pairs = conn.execute('SELECT "userAId"::text, "userBId"::text FROM "Match"').fetchall()
    assert pairs and all(banned not in pair for pair in pairs)


def test_run_announces_new_matches_after_commit(conn: psycopg.Connection) -> None:
    insert_users(conn, population(np.random.default_rng(6)))
    listener = psycopg.connect(TEST_DATABASE_URL, autocommit=True)
    try:
        listener.execute("LISTEN matches_ready")
        day = dt.date(2026, 9, 23)
        run(conn, day, per_user=3, min_answers=6)
        conn.commit()
        received = [n.payload for n in listener.notifies(timeout=5, stop_after=1)]
        assert received == ['{"day": "2026-09-23"}']
        run(conn, day, per_user=3, min_answers=6)
        conn.commit()
        assert list(listener.notifies(timeout=0.5)) == []
    finally:
        listener.close()


def test_run_logs_a_summary(conn: psycopg.Connection, caplog: pytest.LogCaptureFixture) -> None:
    insert_users(conn, population(np.random.default_rng(10)))
    with caplog.at_level("INFO", logger="matchium.nightly"):
        created = run(conn, dt.date(2026, 9, 23), per_user=3, min_answers=6)
    summary = json.loads(caplog.records[-1].getMessage())
    assert summary["event"] == "nightly" and summary["matches"] == created
    assert summary["cities"] == 2 and summary["users"] == 18 and summary["largest_city"] == 16


def test_run_learns_each_decision_once(conn: psycopg.Connection) -> None:
    rng = np.random.default_rng(5)
    insert_users(conn, population(rng))
    day = dt.date(2026, 9, 23)
    run(conn, day, per_user=3, min_answers=6)
    [(match_id, chooser)] = conn.execute(
        'SELECT id::text, "userAId"::text FROM "Match" WHERE day = %s ORDER BY id LIMIT 1', (day,)
    ).fetchall()
    conn.execute(
        'INSERT INTO "MatchDecision" ("matchId", "userId", liked) VALUES (%s::uuid, %s::uuid, true)',
        (match_id, chooser),
    )
    conn.commit()

    run(conn, day + dt.timedelta(days=1), per_user=3, min_answers=6)
    [(learned_at,)] = conn.execute('SELECT "learnedAt" FROM "MatchDecision"').fetchall()
    [(mu_gap, mu_bar)] = conn.execute(
        'SELECT "muGap", "muBar" FROM "Belief" WHERE "userId" = %s::uuid', (chooser,)
    ).fetchall()
    assert learned_at is not None and len(mu_gap) == len(DIMENSIONS) and mu_bar < BAR_PRIOR_MEAN
    [(touched,)] = conn.execute('SELECT count(*) FROM "Belief" WHERE cardinality("muGap") > 0').fetchall()
    assert touched == 1

    run(conn, day + dt.timedelta(days=2), per_user=3, min_answers=6)
    again = conn.execute('SELECT "muGap", "muBar" FROM "Belief" WHERE "userId" = %s::uuid', (chooser,)).fetchone()
    assert again == (mu_gap, mu_bar)
