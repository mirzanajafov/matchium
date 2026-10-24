import copy
import json
import math
import sys

from matchium.contract import CONTRACT_DIR, main, vectors_payload


def same_contract(on_disk, fresh):
    if type(on_disk) is not type(fresh):
        return False
    if isinstance(fresh, float):
        return abs(on_disk - fresh) < 10**-12 / 2
    if isinstance(fresh, dict):
        return on_disk.keys() == fresh.keys() and all(same_contract(on_disk[key], fresh[key]) for key in fresh)
    if isinstance(fresh, list):
        return len(on_disk) == len(fresh) and all(map(same_contract, on_disk, fresh))
    return on_disk == fresh


def test_contract_files_are_up_to_date(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "argv", ["matchium.contract", "--out", str(tmp_path)])
    main()
    for name in ("questions.json", "engine-vectors.json"):
        on_disk = json.loads((CONTRACT_DIR / name).read_text())
        fresh = json.loads((tmp_path / name).read_text())
        assert same_contract(on_disk, fresh), f"run: python -m matchium.contract ({name} is stale)"


def test_a_float_one_ulp_off_on_another_cpu_is_not_stale():
    fresh = vectors_payload()
    other_cpu = copy.deepcopy(fresh)
    weights = other_cpu["scenarios"][0]["populationWeights"]
    weights[0] = math.nextafter(weights[0], 0)
    assert same_contract(other_cpu, fresh)


def test_a_float_moved_in_the_twelfth_decimal_is_stale():
    fresh = vectors_payload()
    moved = copy.deepcopy(fresh)
    moved["scenarios"][0]["populationWeights"][0] += 1e-12
    assert not same_contract(moved, fresh)
