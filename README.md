# Matchium

There's a Rick and Morty episode where Jerry gets an alien intern to build him a dating app. It tells everyone who to date, changes its mind every five minutes, and people just go along with it. I wanted to see what that app would look like if the matching was actually grounded in data.

The idea: you answer a handful of questions every day, and the app gets a better picture of who you are, what you're looking for, and what you actually care about. Each day you get a few matches, and for each one it tells you how sure it is and why it picked that person.

It's split into a matching engine in Python (plus a simulator I use to test it), a NestJS API, and a Next.js web app.

## How matching works

Every question has three parts: your answer, the answer you'd want from a partner, and how much it matters to you. The engine keeps a Gaussian belief per user for each of 8 dimensions (social energy, adventure, ambition, family, tidiness, planning, tradition, activity), both for "who I am" and "who I want". Each answer is a Kalman-style update, so it's cheap and every number can be explained.

A few things I spent most of the time on:

- **Which questions to ask.** Questions aren't random. For each user I pick the ones that should shrink the uncertainty in their match scores the most, weighted by how much they care about that dimension.
- **Both sides have to fit.** A score from u to v isn't enough. Mutual score is the geometric mean of both directions, after normalizing each person's scores against their own pool, so picky and easy-going people end up on the same scale.
- **Confidence.** Scores come with a variance, so the app can say "62% sure" instead of pretending. A brand-new user starts at 0.
- **Who gets shown to whom.** If everyone just sees their own top 3, popular profiles land in dozens of lists and a lot of people get nothing. Daily matches are assigned with a greedy b-matching instead, so a match is shown to both people and nobody gets more than k a day.

## Does it work?

No real users yet, so I built a simulator. It generates people with hidden traits and preferences, plus a random "chemistry" term per pair that no questionnaire could ever capture. Simulated users answer questions with noise, and the engine never sees the ground truth.

1500 users, 6 questions a day, 3 matches a day:

| | day 1 | day 2 | day 7 |
|---|---|---|---|
| rank correlation, random question order | 0.28 | 0.46 | 0.68 |
| rank correlation, adaptive | 0.47 | 0.60 | 0.69 |
| mutual matches so far, random order | 396 | 1016 | 4854 |
| mutual matches so far, adaptive | 612 | 1440 | 5212 |

What I take from this:

- Adaptive questions get to the same accuracy with about half the questions (12 vs ~24). The gap closes by day 7 because the question bank is only 48 questions, so the bank needs to grow.
- After a week the model gets to about 89% of an oracle that knows everyone's true traits (0.69 vs 0.77). The rest is chemistry, and I don't think any questionnaire gets that part.
- b-matching drops exposure inequality from a Gini of 0.46 to 0.02 and costs about 3 points of like rate. I think that trade is worth it.

Full numbers are written to `engine/results/latest.json` every time the simulation runs.

## How the pieces fit

```
Next.js ──> NestJS API ──> Postgres <── nightly job (Python)
```

The API handles the fast, per-user stuff: sign up, today's questions, saving an answer and updating that user's beliefs. Scoring every pair is heavier, so a nightly Python job reads all beliefs, runs the matching and allocation, and writes the day's matches back. The API only reads them.

That means the belief update and question picking exist in both TypeScript and Python. To keep them from drifting apart, the Python side exports the question bank and a set of recorded answer sequences with the expected results to `contract/`, and the API tests replay them. If the math changes on one side and not the other, the tests fail.

Answers for the same user are written under a row lock on their belief, so answering from two tabs at once doesn't lose an update. There's a test for that.

The web app never talks to the API from the browser. Pages and form actions run on the Next server, which keeps the JWT in an httpOnly cookie and calls the API with it. The browser never sees the token, and the API doesn't need CORS.

## Running it

You need Docker, Node 24 and Python 3.11+.

```bash
docker compose up -d

cd api
cp .env.example .env
npm install
npx prisma migrate deploy
npx prisma db seed
npm run start:dev             # http://localhost:3000, docs at /docs
npm test && npm run test:e2e

cd ../engine
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest
python -m sim.run --users 1500 --days 7 --per-day 6
DATABASE_URL=postgresql://matchium:matchium@localhost:5441/matchium python -m jobs.nightly

cd ../web
cp .env.example .env.local
npm install
npm run dev                    # http://localhost:3001
npm test
```

To have someone to match with locally, `python -m jobs.seed_demo --users 40` creates simulated users through the API and has them answer today's questions (log in as any of them with `demo0@example.com` / `demo-password`). Then run the nightly job.

In a real deployment the job runs on its own: `docker compose --profile jobs up -d` starts a small scheduler container that catches up on start (the job skips days that already have matches) and then runs every day at 03:00 UTC, retrying a few times if the database isn't reachable.

If you touch the engine math or the question bank, regenerate the shared fixtures with `python -m matchium.contract`.

## API

| | |
|---|---|
| `POST /auth/register`, `POST /auth/login` | returns a JWT |
| `GET /me` | profile, answer count, how much the model knows about you |
| `GET /questions/today` | today's questions (same set all day) |
| `POST /questions/:id/answer` | `{ self, partner, importance }`, each 1-5 |
| `GET /matches/today` | today's matches with score, confidence, what fits and what might clash |
| `POST /matches/:id/decision` | `{ like }`, tells you if it's mutual |
| `GET /chats` | your mutual matches, most recent conversation first |
| `GET /chats/:id/messages?after=` | messages in a chat, optionally only newer ones |
| `POST /chats/:id/messages` | `{ body }`, only once you both said yes |

## What's where

```
web/               Next.js app
api/               NestJS + Prisma
engine/matchium/   questions, beliefs, scoring, question selection, allocation
engine/sim/        synthetic population, metrics, experiment runner
engine/jobs/       nightly matching job, demo data
contract/          question bank and fixtures shared by the API and the engine
```

## Next

- Notify people when matches are ready
- Push new chat messages over SSE instead of polling every few seconds
- Use likes/passes and chat activity alongside stated answers
- Bigger question bank and a proper IRT model once there's real data
