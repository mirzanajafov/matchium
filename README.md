# Matchium

There's a Rick and Morty episode where Jerry gets an alien intern to build him a dating app. It tells everyone who to date, changes its mind every five minutes, and people just go along with it. I wanted to see what that app would look like if the matching was actually grounded in data.

The idea: you answer a handful of questions every day, and the app gets a better picture of who you are, what you're looking for, and what you actually care about. Each day you get a few matches, and for each one it tells you how sure it is and why it picked that person.

Right now this repo has the matching engine and a simulator I use to test it. API and web app are next.

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

## Running it

Python 3.11+.

```bash
cd engine
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest
python -m sim.run --users 1500 --days 7 --per-day 6
```

## What's where

```
engine/matchium/   questions, beliefs, scoring, question selection, allocation
engine/sim/        synthetic population, metrics, experiment runner
engine/tests/
```

## Next

- NestJS API and a Next.js web app (daily questions, match feed)
- Use likes/passes and chat activity alongside stated answers
- Bigger question bank and a proper IRT model once there's real data
