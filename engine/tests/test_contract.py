import json
import math

from matchium.contract import CONTRACT_DIR, vectors_payload, write


def same_contract(on_disk, fresh):
    if type(on_disk) is not type(fresh):
        return False
    if isinstance(fresh, float):
        return math.isclose(on_disk, fresh, rel_tol=1e-12, abs_tol=1e-12)
    if isinstance(fresh, dict):
        return on_disk.keys() == fresh.keys() and all(same_contract(on_disk[key], fresh[key]) for key in fresh)
    if isinstance(fresh, list):
        return len(on_disk) == len(fresh) and all(map(same_contract, on_disk, fresh))
    return on_disk == fresh


def test_contract_files_are_up_to_date(tmp_path):
    write(tmp_path)
    for name in ("questions.json", "engine-vectors.json"):
        on_disk = json.loads((CONTRACT_DIR / name).read_text())
        fresh = json.loads((tmp_path / name).read_text())
        assert same_contract(on_disk, fresh), f"run: python -m matchium.contract ({name} is stale)"


def test_a_weight_one_ulp_lower_on_another_cpu_is_not_stale():
    fresh = vectors_payload()
    other_cpu = vectors_payload()
    weights = other_cpu["scenarios"][1]["populationWeights"]
    weights[7] = math.nextafter(weights[7], 0)
    assert same_contract(other_cpu, fresh)


def test_a_weight_moved_by_1e_9_is_stale():
    fresh = vectors_payload()
    moved = vectors_payload()
    moved["scenarios"][0]["populationWeights"][0] += 1e-9
    assert not same_contract(moved, fresh)
