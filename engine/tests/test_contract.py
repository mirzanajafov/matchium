import copy
import json
import math

from matchium.contract import CONTRACT_DIR, questions_payload, vectors_payload


def same_contract(on_disk, fresh):
    if type(on_disk) is not type(fresh):
        return False
    if isinstance(fresh, float):
        return abs(on_disk - fresh) < 1e-12
    if isinstance(fresh, dict):
        return on_disk.keys() == fresh.keys() and all(same_contract(on_disk[key], fresh[key]) for key in fresh)
    if isinstance(fresh, list):
        return len(on_disk) == len(fresh) and all(map(same_contract, on_disk, fresh))
    return on_disk == fresh


def one_ulp_up(value):
    if isinstance(value, float):
        return math.nextafter(value, math.inf)
    if isinstance(value, dict):
        return {key: one_ulp_up(item) for key, item in value.items()}
    if isinstance(value, list):
        return [one_ulp_up(item) for item in value]
    return value


def test_contract_files_are_up_to_date():
    for name, payload in (("questions.json", questions_payload()), ("engine-vectors.json", vectors_payload())):
        on_disk = json.loads((CONTRACT_DIR / name).read_text())
        fresh = json.loads(json.dumps(payload))
        assert same_contract(on_disk, fresh), f"run: python -m matchium.contract ({name} is stale)"


def test_last_bit_differences_between_cpus_do_not_make_the_contract_stale():
    vectors = vectors_payload()
    assert same_contract(one_ulp_up(vectors), vectors)


def test_a_moved_value_makes_the_contract_stale():
    vectors = vectors_payload()
    moved = copy.deepcopy(vectors)
    moved["scenarios"][0]["populationWeights"][0] += 1e-9
    assert not same_contract(moved, vectors)
