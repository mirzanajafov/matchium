import argparse
import json
import urllib.error
import urllib.request

import numpy as np

from matchium import DIMENSIONS, load_bank
from sim.population import answer, generate

WOMEN = ["Aysel", "Leyla", "Nigar", "Sabina", "Gunel", "Aynur", "Lala", "Narmin", "Sevinj", "Ulviyya", "Kamala", "Zarifa"]
MEN = ["Murad", "Elvin", "Tural", "Rashad", "Orkhan", "Kamran", "Farid", "Ilkin", "Samir", "Emil", "Nijat", "Ramil"]


def call(base: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    request = urllib.request.Request(
        base + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"content-type": "application/json", **({"authorization": f"Bearer {token}"} if token else {})},
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())


def sign_in(base: str, profile: dict) -> str:
    try:
        return call(base, "/auth/register", profile)["accessToken"]
    except urllib.error.HTTPError as error:
        if error.code != 409:
            raise
        return call(base, "/auth/login", {"email": profile["email"], "password": profile["password"]})["accessToken"]


def main():
    parser = argparse.ArgumentParser(description="Create synthetic users through the API and answer today's questions.")
    parser.add_argument("--api", default="http://localhost:3100")
    parser.add_argument("--users", type=int, default=40)
    parser.add_argument("--city", default="Baku")
    parser.add_argument("--seed", type=int, default=3)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    pop = generate(args.users, len(DIMENSIONS), rng)
    bank = {q.id: q for q in load_bank()}
    answered = 0

    for i in range(args.users):
        woman = i % 2 == 0
        names = WOMEN if woman else MEN
        profile = {
            "email": f"demo{i}@example.com",
            "password": "demo-password",
            "displayName": names[(i // 2) % len(names)],
            "birthDate": f"{1990 + int(rng.integers(0, 12))}-0{1 + int(rng.integers(0, 9))}-1{int(rng.integers(0, 9))}",
            "gender": "WOMAN" if woman else "MAN",
            "seeking": ["MAN"] if woman else ["WOMAN"],
            "city": args.city,
        }
        token = sign_in(args.api, profile)
        today = call(args.api, "/questions/today", token=token)
        for question in today["questions"]:
            if question["answered"]:
                continue
            self_answer, pref_answer, importance = answer(pop, np.array([i]), bank[question["id"]], rng)
            call(
                args.api,
                f"/questions/{question['id']}/answer",
                {"self": int(self_answer[0]), "partner": int(pref_answer[0]), "importance": int(importance[0])},
                token,
            )
            answered += 1

    print(f"{args.users} demo users ready in {args.city}, {answered} answers submitted")


if __name__ == "__main__":
    main()
