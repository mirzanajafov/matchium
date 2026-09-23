import json

from matchium.contract import CONTRACT_DIR, questions_payload, vectors_payload


def test_contract_files_are_up_to_date():
    for name, payload in (("questions.json", questions_payload()), ("engine-vectors.json", vectors_payload())):
        on_disk = json.loads((CONTRACT_DIR / name).read_text())
        assert on_disk == json.loads(json.dumps(payload)), f"run: python -m matchium.contract ({name} is stale)"
