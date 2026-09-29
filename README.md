# Matchium

There's a Rick and Morty episode where Jerry gets an alien intern to build him a dating app. It tells everyone who to date, changes its mind every five minutes, and people just go along with it. I wanted to see what that app would look like if the matching was actually grounded in data.

The idea: you answer a handful of questions every day, and the app gets a better picture of who you are, what you're looking for, and what you actually care about. Each day you get a few matches, and for each one it tells you how sure it is and why it picked that person.

It's split into a matching engine in Python (plus a simulator I use to test it), a NestJS API, and a Next.js web app.

![Today's questions, a match with its explanation, and a chat](docs/screenshots/app.png)

## How matching works

Every question has three parts: your answer, the answer you'd want from a partner, and how much it matters to you. The engine keeps a Gaussian belief per user for each of 8 dimensions (social energy, adventure, ambition, family, tidiness, planning, tradition, activity), both for "who I am" and "who I want". Each answer is a Kalman-style update, so it's cheap and every number can be explained.

A few things I spent most of the time on:

- **Which questions to ask.** Questions aren't random. For each user I pick the ones that should shrink the uncertainty in their match scores the most, weighted by how much they care about that dimension.
- **Both sides have to fit.** A score from u to v isn't enough. Mutual score is the geometric mean of both directions, after normalizing each person's scores against their own pool, so picky and easy-going people end up on the same scale.
- **Confidence.** Scores come with a variance, so the app can say "62% sure" instead of pretending. A brand-new user starts at 0.
- **What people do, not just what they say.** Stated preferences and real ones aren't the same thing. Every like or pass is treated as a probit observation and folded in overnight with a moment-matched update (the same trick TrueSkill uses). It only moves a separate "gap" term on top of the stated preference, plus a per-person "bar" for how picky they are, so the answers are never overwritten, only corrected.
- **Who gets shown to whom.** If everyone just sees their own top 3, popular profiles land in dozens of lists and a lot of people get nothing. Daily matches are assigned with a greedy b-matching instead, so a match is shown to both people and nobody gets more than k a day. Pairs below a minimum mutual score are skipped even if that leaves a slot empty. In the simulator that floor costs nothing, but in a small city on launch week it's the difference between one decent match and three where one is a 3% fit.

## Does it work?

No real users yet, so I built a simulator. It generates people with hidden traits and preferences, plus a random "chemistry" term per pair that no questionnaire could ever capture. Simulated users answer questions with noise, and the engine never sees the ground truth.

1500 users, 6 questions a day, 3 matches a day:

| | day 1 | day 2 | day 7 |
|---|---|---|---|
| rank correlation, random question order | 0.28 | 0.45 | 0.67 |
| rank correlation, adaptive | 0.47 | 0.60 | 0.69 |
| mutual matches so far, random order | 383 | 993 | 4626 |
| mutual matches so far, adaptive | 612 | 1440 | 5319 |

![Rank correlation by day for adaptive and random question order](engine/results/questions.svg)

What I take from this:

- Adaptive questions get to the same accuracy with about half the questions (12 vs ~24).
- The bank has 96 questions (12 per dimension). With the first 48, accuracy stopped at 0.689 once people ran out of questions around day 8; with 96 it keeps going to 0.718 by day 21, which is 94% of an oracle that knows everyone's true traits (0.77). The rest is chemistry, and I don't think any questionnaire gets that part.
- Learning from likes and passes barely matters when people answer honestly (0.718 vs 0.720 after four weeks, 0.6% more mutual matches). It does when they don't: if every stated preference is off by noise with std 0.5, questions alone stall at 0.65, and adding decisions pushes that to 0.69 by day 28 with 6% more mutual matches. The prior on how far answers can be from behaviour is deliberately small; a bigger one gained a bit more in the misreporting world but started to hurt honest users once the bank grew.
- b-matching drops exposure inequality from a Gini of 0.46 to 0.02 and costs about 4 points of like rate. I think that trade is worth it.

![Rank correlation over 28 days with and without learning from likes](engine/results/decisions.svg)

Full numbers are written to `engine/results/latest.json` every time the simulation runs, and the charts are redrawn from them (`python -m sim.chart` redraws without rerunning).

## How the pieces fit

```
Next.js ──> NestJS API ──> Postgres <── nightly job (Python)
```

The API handles the fast, per-user stuff: sign up, today's questions, saving an answer and updating that user's beliefs. Scoring every pair is heavier, so a nightly Python job reads all beliefs, runs the matching and allocation, and writes the day's matches back. The API only reads them.

That means the belief update and question picking exist in both TypeScript and Python. To keep them from drifting apart, the Python side exports the question bank and a set of recorded answer sequences with the expected results to `contract/`, and the API tests replay them. If the math changes on one side and not the other, the tests fail.

Answers for the same user are written under a row lock on their belief, so answering from two tabs at once doesn't lose an update. There's a test for that.

The web app never talks to the API from the browser. Pages and form actions run on the Next server, which keeps the JWT in an httpOnly cookie and calls the API with it. The browser never sees the token, and the API doesn't need CORS.

People can add up to four photos, pick which one leads, and write a short bio. The browser scales photos down to 2160px before sending them (a 7 MB phone photo goes out as about 1.4 MB, and the canvas drops its metadata on the way), and every upload is decoded and re-encoded with sharp: the camera rotation is applied, it's shrunk to at most 1080×1350, saved as WebP, and all metadata is dropped, including GPS, which on a dating app can be someone's home address. Photos live in a private S3 bucket (MinIO locally, started by `docker compose up -d`) and are served through the API, which only hands them to the owner, people they're currently matched with, and admins; the web app proxies them so the token still never reaches the browser.

Either person can unmatch at any point, optionally filing a report (spam, harassment, fake profile, possibly underage). The match disappears for both of them, the chat stops accepting messages, an open chat on the other side is told over the stream and locks, and the pair is never matched again because the nightly job skips any pair it has matched before. Reports go to a small moderation queue at `/admin`, where an admin sees both people, the note and the conversation, and either dismisses the report or bans the account. A ban locks the person out on their next request, closes every open match they have, resolves any other reports against them and keeps them out of the nightly run. A report keeps a copy of the reported person's name, email and the last 50 messages from the moment it was filed, so deleting the account doesn't delete the evidence, and an email that was banned can't be used to sign up again. There's no endpoint that makes someone an admin; that's `npm run admin:grant -- <email>` on the server.

Chat messages are pushed live. When a message is saved the API fires a Postgres `NOTIFY`, every API instance is `LISTEN`ing, and each one forwards it to the people who have that chat open over server-sent events. The web app proxies the stream through a Next route handler so the token still stays on the server. If the stream drops, the page reconnects and fetches anything it missed.

Web push covers the times the app isn't open: a new message, a mutual like, and "your matches are here" after the nightly run. The API signs pushes with its own VAPID keys, so there's no third-party account. The nightly job fires `NOTIFY matches_ready` when it commits, and whichever API instance claims the day first (`UPDATE ... WHERE "notifiedAt" IS NULL RETURNING`) sends the pushes, so running several instances doesn't mean several notifications. Dead subscriptions (404/410 from the push service) are deleted on the spot. The service worker skips the notification if you're already looking at that chat.

People who haven't turned push on get one email instead when their matches are ready, with the unread chat count. It goes out over plain SMTP, so any provider works (Brevo's and Resend's free tiers are enough for this), and locally `docker compose up -d` starts Mailpit, where you can read what was sent at http://localhost:8027. Every email has a signed unsubscribe link and the one-click `List-Unsubscribe` headers. The unsubscribe page only acts when you press its button, so link scanners in mail clients can't unsubscribe anyone, and the unsubscribe token can't be used to log in.

Every login creates a session row and the JWT carries its id. The guard already loads the user on each request, so it checks the session in the same query: logging out ends that device right away, and a password reset ends all of them. Sign-up sends a confirmation email, and match emails only go to confirmed addresses, so nobody gets mail because someone else typed their address. Forgot-password answers the same way whether or not the account exists; the reset link is signed with a stamp of the current password hash, so it stops working the moment it's used.

Login, sign-up and sending messages are rate limited: 10 login attempts per account and 30 per address every 15 minutes, 5 sign-ups per address an hour, 30 messages a minute per person. The counters live in Postgres (one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` per check), so every API instance sees the same numbers without Redis. Going over returns 429 with `Retry-After`. Because the API only ever sees the Next server, the web app forwards the client address, taking it from the right end of `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`) so a client can't pick its own; the API only believes that header from addresses in `TRUST_PROXY`.

With `LOG_JSON=true` the API logs one JSON line per request (method, route template, status, ms) plus its own events, and the nightly job logs a JSON summary per run (users, cities, largest city, decisions learned, matches, seconds). `GET /metrics` serves Prometheus metrics when `METRICS_TOKEN` is set and is a 404 otherwise: request counts and latency by route template (so ids never become label values), push and email results, rate-limit refusals and open chat streams.

## Running it

The quickest way to see the whole thing is Docker alone:

```bash
docker compose --profile app up -d --build   # web on http://localhost:3101, API on :3100
```

That starts Postgres, the API (it migrates and seeds the question bank on start), the web app and the nightly scheduler. Push stays off unless you pass `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

For development you need Docker, Node 24 and Python 3.11+.

```bash
docker compose up -d

cd api
cp .env.example .env
npm install
npx web-push generate-vapid-keys   # paste into .env to turn on push
npx prisma migrate deploy
npx prisma db seed
npm run start:dev             # http://localhost:3100, docs at /docs
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
npm run dev                    # http://localhost:3101
npm test
```

To have someone to match with locally, `python -m jobs.seed_demo --users 40` creates simulated users through the API and has them answer today's questions (log in as any of them with `demo0@example.com` / `demo-password`). Then run the nightly job.

The job scores each city on its own, since people are only matched within a city. That gives exactly the same matches as one big pool but memory grows with the largest city instead of the whole user base: 66 MB instead of 2.3 GB for 6,000 users across 6 cities.

In a real deployment the job runs on its own: `docker compose --profile jobs up -d` starts a small scheduler container that catches up on start (the job skips days that already have matches) and then runs every day at 03:00 UTC, retrying a few times if the database isn't reachable.

On a server I run it with the production override, which publishes no ports at all and takes every secret from `.env`:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build
```

It needs `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET`, `WEB_URL` and `EDGE_NETWORK`, the Docker network of whatever reverse proxy terminates TLS; the web container joins it and the proxy points at `matchium-web:3101`. Updating the server is `./deploy/deploy.sh`: it does nothing if `main` hasn't moved, otherwise it takes a backup, fast-forwards, rebuilds, waits for the API health check and the web app to answer, and goes back to the previous commit if they don't. A rollback can't undo a migration that already ran, which is why the backup comes first.

The production override also runs a backup container: every day at 04:00 UTC, after the nightly matches, it writes a `pg_dump` (checked with `pg_restore --list` before it counts), mirrors the photo bucket with rsync into `./backups`, keeps 14 days and records the last success. `docker compose ... run --rm backup once` takes one on demand. Restoring is `pg_restore --no-owner -d matchium` on a dump and copying `backups/photos` back into the MinIO volume. The backups sit on the same disk, so they cover mistakes, not a dead server; copying `./backups` somewhere else is the next step. Email and push stay off until `SMTP_URL` and the VAPID keys are set, and the app hides the email prompts while email is off.

If you touch the engine math or the question bank, regenerate the shared fixtures with `python -m matchium.contract`.

## API

| | |
|---|---|
| `POST /auth/register`, `POST /auth/login` | returns a JWT tied to a session |
| `POST /auth/logout` | ends this session only |
| `POST /auth/logout-all` | ends every session for the account |
| `POST /auth/verify-email`, `POST /auth/verify-email/resend` | confirm the address from the emailed link |
| `POST /auth/password/forgot`, `POST /auth/password/reset` | emailed reset link, single use, 30 minutes |
| `GET /me` | profile, answer count, how much the model knows about you, where your likes disagree with your answers |
| `GET /me/export` | everything stored about you as JSON (never the other person's messages) |
| `DELETE /me` | `{ password }`, deletes the account and everything tied to it |
| `GET /admin/reports?status=open\|reviewed` | admins only: reports with both people and their conversation |
| `POST /admin/reports/:id/resolve` | admins only: `{ outcome: DISMISSED \| BANNED }` |
| `GET /questions/today` | today's questions (same set all day) |
| `POST /questions/:id/answer` | `{ self, partner, importance }`, each 1-5 |
| `GET /matches/today` | today's matches with score, confidence, what fits and what might clash |
| `POST /matches/:id/decision` | `{ like }`, tells you if it's mutual |
| `POST /matches/:id/unmatch` | closes the match and chat for both people, optionally with `{ report: { reason, note } }` |
| `GET /chats` | your mutual matches, most recent conversation first |
| `GET /chats/:id/messages?after=` | messages in a chat, optionally only newer ones |
| `POST /chats/:id/messages` | `{ body }`, only once you both said yes |
| `GET /chats/:id/stream` | server-sent events with new messages as they arrive |
| `GET /inbox` | how many new matches and unread chats you have |
| `PATCH /me/preferences` | `{ emailDigest }` |
| `PATCH /me/profile` | `{ bio }`, up to 300 characters |
| `POST /me/photos`, `DELETE /me/photos/:id` | multipart `photo`, up to 4, 8 MB each |
| `POST /me/photos/:id/main` | move a photo to the front |
| `GET /photos/:id` | the image, only if you're allowed to see it |
| `POST /email/unsubscribe?token=` | stops match emails, used by the link in the email |
| `GET /push/key` | the VAPID public key, or `null` if push is off |
| `POST /push/subscriptions`, `DELETE /push/subscriptions` | register or drop this browser for push |

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

- Email digests for people who don't allow push
- Use chat activity as a signal too, not only likes and passes
- Bigger question bank and a proper IRT model once there's real data
