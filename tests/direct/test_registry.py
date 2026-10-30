import json
import pytest

ITEM = {"id": "floor", "name": "Living room carpet", "class": "carpet", "age_months": 12, "replacement_atto": "1000", "cost_reference_url": "https://example.org/carpet"}
CLAUSE = "Return the property in its recorded condition allowing for ordinary wear."

@pytest.fixture
def registry(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, monkeypatch):
    direct_vm.warp("2026-10-29T10:00:00Z")
    direct_vm.sender = direct_alice
    direct_vm.mock_web(r"example\.org", {"status": 200, "body": "Published carpet replacement price and paid repair receipt."})
    c = direct_deploy("contracts/tenancy_registry.py")
    c.wire("0x"+direct_bob.hex(), "0x"+direct_charlie.hex())
    from genlayer import gl
    from types import SimpleNamespace
    monkeypatch.setattr(gl, "get_contract_at", lambda _: SimpleNamespace(view=lambda: SimpleNamespace(get_account=lambda _: {"settled": False})))
    return c

@pytest.fixture
def create(registry, direct_alice, direct_bob):
    def create(**overrides):
        values = dict(tenant="0x"+direct_alice.hex(), landlord="0x"+direct_bob.hex(), deposit_atto=1000, rent_atto=1000, start="2026-10-29", end="2027-10-29", condition_clause=CLAUSE, items_json=json.dumps([ITEM]), jurisdiction="US_CA_STANDARD")
        values.update(overrides)
        return registry.create_tenancy(**values)
    return create

def manifests():
    return json.dumps([{"item_id": "floor", "sha256": "a"*64, "url": "https://objects.example.org/arrival.jpg"}])

def accept(registry, create, direct_vm, direct_bob):
    tid = create()
    direct_vm.sender = direct_bob
    registry.accept_terms(tid, registry.get_tenancy(tid)["agreement_hash"])
    return tid

def test_create_and_accept_terms(registry, create, direct_vm, direct_bob):
    tid = create()
    r = registry.get_tenancy(tid)
    assert r["tenant_accepted"] and not r["landlord_accepted"]
    assert r["items"][0]["lifespan_months"] == 60
    direct_vm.sender = direct_bob
    registry.accept_terms(tid, r["agreement_hash"])
    assert registry.get_tenancy(tid)["landlord_accepted"]

@pytest.mark.parametrize("fields,message", [
    ({"deposit_atto": 1001}, "at most one month"),
    ({"deposit_atto": 0}, "positive"),
    ({"start": "2026-10-28"}, "Register before"),
    ({"end": "2026-10-29"}, "valid tenancy dates"),
    ({"jurisdiction": "US_NY"}, "Unsupported jurisdiction"),
    ({"condition_clause": "Fine"}, "condition clause"),
    ({"items_json": "[]"}, "1 to 20"),
    ({"items_json": json.dumps([ITEM, ITEM])}, "Unique item"),
    ({"items_json": json.dumps([{**ITEM, "class": "spaceship"}])}, "Unsupported item"),
    ({"items_json": json.dumps([{**ITEM, "age_months": -1}])}, "Invalid item age"),
    ({"items_json": json.dumps([{**ITEM, "replacement_atto": "0"}])}, "replacement ceiling"),
    ({"items_json": json.dumps([{**ITEM, "cost_reference_url": "http://local"}])}, "Published cost")])
def test_registration_validation(create, direct_vm, fields, message):
    with direct_vm.expect_revert(message): create(**fields)

def test_outsider_cannot_create_or_accept(registry, create, direct_vm, direct_charlie):
    tid=create()
    direct_vm.sender=direct_charlie
    with direct_vm.expect_revert("parties only"): create()
    with direct_vm.expect_revert("parties only"): registry.accept_terms(tid, registry.get_tenancy(tid)["agreement_hash"])

def test_wiring_immutable(registry, direct_vm, direct_alice, direct_bob):
    with direct_vm.expect_revert("immutable"): registry.wire("0x"+direct_alice.hex(),"0x"+direct_bob.hex())

def test_arrival_commit_and_other_party_acknowledgment(registry, create, direct_vm, direct_alice, direct_bob):
    tid=accept(registry,create,direct_vm,direct_bob)
    registry.commit_evidence(tid,"move_in",manifests())
    evidence=registry.get_tenancy(tid)["move_in"]
    assert evidence["submitted_by"]=="landlord"
    with direct_vm.expect_revert("Other party"): registry.acknowledge_arrival(tid,evidence["manifest_hash"])
    direct_vm.sender=direct_alice
    with direct_vm.expect_revert("exact arrival"): registry.acknowledge_arrival(tid,"b"*64)
    registry.acknowledge_arrival(tid,evidence["manifest_hash"])
    assert registry.get_tenancy(tid)["move_in"]["acknowledged"]
    with direct_vm.expect_revert("already committed"): registry.commit_evidence(tid,"move_in",manifests())

@pytest.mark.parametrize("images", [[],[{"item_id":"wrong","sha256":"a"*64,"url":"https://example.org"}],[{"item_id":"floor","sha256":"z"*64,"url":"https://example.org"}],[{"item_id":"floor","sha256":"a"*64,"url":"http://example.org"}]])
def test_invalid_manifests(registry, create, direct_vm, direct_bob, images):
    tid=accept(registry,create,direct_vm,direct_bob)
    with direct_vm.expect_revert(): registry.commit_evidence(tid,"move_in",json.dumps(images))

def test_commit_needs_both_terms(registry,create,direct_vm):
    tid=create()
    with direct_vm.expect_revert("Both parties"):registry.commit_evidence(tid,"move_in",manifests())

def test_no_backdated_arrival(registry,create,direct_vm,direct_bob):
    tid=accept(registry,create,direct_vm,direct_bob)
    direct_vm.warp("2026-10-30T10:00:00Z")
    with direct_vm.expect_revert("by arrival day"):registry.commit_evidence(tid,"move_in",manifests())

def test_departure_notice_lifecycle(registry,create,direct_vm,direct_alice,direct_bob):
    tid=accept(registry,create,direct_vm,direct_bob)
    registry.commit_evidence(tid,"move_in",manifests())
    direct_vm.sender=direct_alice
    registry.acknowledge_arrival(tid,registry.get_tenancy(tid)["move_in"]["manifest_hash"])
    with direct_vm.expect_revert("not due"):registry.commit_evidence(tid,"move_out",manifests())
    direct_vm.warp("2027-10-29T10:00:00Z")
    registry.commit_evidence(tid,"move_out",manifests())
    with direct_vm.expect_revert("Landlord"):registry.submit_notice(tid,"[]")
    direct_vm.sender=direct_bob
    registry.submit_notice(tid,json.dumps([{"item_id":"floor","claimed_atto":"50","reason":"There is a large new tear in the carpet.","expenditure_atto":"50","expenditure_reference_url":"https://example.org/receipt"}]))
    assert registry.get_tenancy(tid)["notice"]["submitted_at"].startswith("2027-10-29")
    with direct_vm.expect_revert("one notice"):registry.submit_notice(tid,"[]")

@pytest.mark.parametrize('change',[{'deposit_atto':900},{'rent_atto':1100},{'end':'2028-10-29'},{'tenant':'0x'+'9'*40},{'items_json':json.dumps([{**ITEM,'replacement_atto':'2000'}])}])
def test_complete_agreement_fingerprint(registry,create,direct_vm,direct_bob,change):
    first=create(); original=registry.get_tenancy(first)['agreement_hash']
    if 'tenant' in change: direct_vm.sender=direct_bob
    second=create(**change)
    assert registry.get_tenancy(second)['agreement_hash'] != original

def test_reference_snapshot_is_hashed_and_immutable(registry,create,direct_vm):
    tid=create(); item=registry.get_tenancy(tid)['items'][0]
    import hashlib
    assert item['cost_reference_sha256']==hashlib.sha256(item['cost_reference_text'].encode()).hexdigest()
    direct_vm.clear_mocks(); direct_vm.mock_web(r'example\.org',{'status':200,'body':'A changed replacement price.'})
    changed=create()
    assert registry.get_tenancy(tid)['items'][0]==item
    assert registry.get_tenancy(changed)['agreement_hash']!=registry.get_tenancy(tid)['agreement_hash']

def test_departure_sets_can_be_corrected_independently(registry,create,direct_vm,direct_alice,direct_bob):
    tid=accept(registry,create,direct_vm,direct_bob)
    registry.commit_evidence(tid,'move_in',manifests()); direct_vm.sender=direct_alice
    registry.acknowledge_arrival(tid,registry.get_tenancy(tid)['move_in']['manifest_hash'])
    direct_vm.warp('2027-10-29T10:00:00Z'); registry.commit_evidence(tid,'move_out',manifests())
    direct_vm.sender=direct_bob; registry.commit_evidence(tid,'move_out',manifests())
    landlord=registry.get_tenancy(tid)['departure_evidence']['landlord']
    direct_vm.sender=direct_alice
    corrected=json.loads(manifests());corrected[0]['sha256']='b'*64
    registry.commit_evidence(tid,'move_out',json.dumps(corrected))
    record=registry.get_tenancy(tid)
    assert record['departure_evidence']['landlord']==landlord
    assert record['departure_evidence']['tenant']['images'][0]['sha256']=='b'*64
    assert record['departure_date']=='2027-10-29'
    direct_vm.warp('2027-12-05T00:00:00Z')
    with direct_vm.expect_revert('deadline'):registry.commit_evidence(tid,'move_out',manifests())

def test_early_departure_requires_counterparty_and_cannot_extend(registry,create,direct_vm,direct_alice,direct_bob):
    tid=accept(registry,create,direct_vm,direct_bob)
    registry.propose_departure(tid,'2026-11-01')
    with direct_vm.expect_revert('Other party'):registry.acknowledge_departure(tid,'2026-11-01')
    direct_vm.sender=direct_alice
    with direct_vm.expect_revert('exact departure'):registry.acknowledge_departure(tid,'2026-11-02')
    registry.acknowledge_departure(tid,'2026-11-01')
    assert registry.get_tenancy(tid)['departure_date']=='2026-11-01'
    with direct_vm.expect_revert('extend'):registry.propose_departure(tid,'2027-01-01')

def test_notice_can_be_registered_without_photos(registry,create,direct_vm,direct_bob):
    tid=accept(registry,create,direct_vm,direct_bob);direct_vm.warp('2027-10-29T10:00:00Z')
    registry.submit_notice(tid,'[]')
    assert registry.get_tenancy(tid)['notice']['claims']==[]
    assert registry.get_tenancy(tid)['move_out'] is None

def test_positive_notice_requires_snapshotted_expenditure(registry,create,direct_vm,direct_bob):
    tid=accept(registry,create,direct_vm,direct_bob);direct_vm.warp('2027-10-29T10:00:00Z')
    claim={'item_id':'floor','claimed_atto':'100','reason':'Carpet replacement for a new large tear.'}
    with direct_vm.expect_revert('actual expenditure'):registry.submit_notice(tid,json.dumps([claim]))
    claim.update(expenditure_atto='50',expenditure_reference_url='https://example.org/invoice')
    registry.submit_notice(tid,json.dumps([claim]))
    assert registry.get_tenancy(tid)['notice']['claims'][0]['expenditure_sha256']
