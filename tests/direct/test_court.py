import json
import hashlib
import pytest
from types import SimpleNamespace

TENANT="0x"+"1"*40
LANDLORD="0x"+"2"*40
REGISTRY="0x"+"3"*40
ESCROW="0x"+"4"*40
IMAGE=b'isolated image fixture bytes'
HASH=hashlib.sha256(IMAGE).hexdigest()

def record():
    evidence={"images":[{"item_id":"floor","url":"https://objects.example.org/image.jpg","sha256":HASH}],"acknowledged":True,"committed_at":"2027-10-29T10:00:00+00:00"}
    return {"id":"1","tenant":TENANT,"landlord":LANDLORD,"deposit_atto":"1000","rent_atto":"1000","start":"2026-10-29","end":"2027-10-29","departure_date":"2027-10-29","condition_clause":"Ordinary wear is allowed.","items":[{"id":"floor","name":"Carpet","class":"carpet","age_months":12,"replacement_atto":"1000","lifespan_months":60,"cost_reference_url":"https://shop.example.org/carpet","cost_reference_text":"Published carpet replacement reference, comparable item price."}],"move_in":evidence.copy(),"move_out":evidence.copy(),"departure_evidence":{"tenant":evidence.copy()},"notice":{"submitted_at":"2027-10-30T10:00:00+00:00","claims":[{"item_id":"floor","claimed_atto":"900","expenditure_atto":"900","expenditure_text":"Paid invoice for carpet replacement for this damage.","reason":"The carpet has a new large tear."}]}}

@pytest.fixture
def court(direct_vm,direct_deploy,monkeypatch):
    direct_vm.sender=bytes.fromhex(TENANT[2:])
    direct_vm.warp("2027-10-31T10:00:00Z")
    c=direct_deploy("contracts/condition_court.py",REGISTRY)
    c.wire(ESCROW)
    from genlayer import gl
    monkeypatch.setattr(gl.vm, "spawn_sandbox", lambda fn: gl.vm.Return(fn()))
    state={"record":record(),"account":{"deposit_atto":"1000","settled":False,"appeal_bond_atto":"0","appellant":"","appeal_deadline":"2027-11-03T10:00:00+00:00"}}
    view=SimpleNamespace(get_tenancy=lambda _:state["record"],get_account=lambda _:state["account"])
    monkeypatch.setattr(gl,"get_contract_at",lambda _:SimpleNamespace(view=lambda:view))
    direct_vm.mock_web(r"objects\.example\.org",{"response":{"status":200,"body":IMAGE,"headers":{}},"method":"GET"})
    direct_vm.mock_web(r"shop\.example\.org",{"status":200,"body":"Published carpet replacement reference, comparable item price."})
    return c,state

def answer(direct_vm,classification="NEW_DAMAGE",band="HIGH",bad_faith=False):
    direct_vm._llm_mocks.clear()
    direct_vm.mock_llm(r".*neutral condition adjudicator.*",json.dumps({"classification":classification,"band":band,"reason":"A new tear is visible on departure and was absent on arrival.","bad_faith":bad_faith,"expense_supported":True}))

@pytest.mark.parametrize("classification,band,expected",[("NEW_DAMAGE","HIGH",600),("NEW_DAMAGE","MEDIUM",300),("NEW_DAMAGE","LOW",150),("PRE_EXISTING","NONE",0),("NORMAL_WEAR","NONE",0),("UNDETERMINED","NONE",0)])
def test_classification_depreciation_and_bands(court,direct_vm,classification,band,expected):
    c,_=court;answer(direct_vm,classification,band);c.adjudicate("1");v=c.get_verdict("1")
    assert v["items"][0]["classification"]==classification
    assert int(v["deduction_atto"])==expected
    assert v["new_damage_count"]==(1 if classification=="NEW_DAMAGE" else 0)
    assert v["status"]==("UNDETERMINED" if classification=="UNDETERMINED" else "DECIDED")
    assert c.get_original("1")==v

@pytest.mark.parametrize("change",["classification","band","count","procedure","bad_faith","item_id"])
def test_validator_checks_substance_independently(court,direct_vm,change):
    c,_=court;answer(direct_vm);c.adjudicate("1")
    leader_result,leader_fn,validator_fn=direct_vm._captured_validators[-1]
    from genlayer import gl
    independent=leader_fn()
    altered=json.loads(json.dumps(independent))
    if change=="classification":altered["items"][0]["classification"]="NORMAL_WEAR"
    elif change=="band":altered["items"][0]["band"]="LOW"
    elif change=="count":altered["new_damage_count"]=0
    elif change=="procedure":altered["procedure"]["notice_timely"]=False
    elif change=="bad_faith":altered["items"][0]["bad_faith"]=True
    elif change=="item_id":altered["items"][0]["item_id"]="other"
    assert not validator_fn(gl.vm.Return(altered))
    altered=json.loads(json.dumps(independent));altered["items"][0]["reason"]="A different but compatible explanation of the same finding."
    assert validator_fn(gl.vm.Return(altered))

@pytest.mark.parametrize("classification,band",[("NEW_DAMAGE","NONE"),("NORMAL_WEAR","HIGH"),("OTHER","NONE"),("NEW_DAMAGE","OTHER")])
def test_malformed_model_output_does_not_become_verdict(court,direct_vm,classification,band):
    c,_=court;answer(direct_vm,classification,band)
    with direct_vm.expect_revert("LLM_ERROR"):c.adjudicate("1")
    assert c.get_verdict("1")["status"]=="AWAITING_EVIDENCE"

def test_hash_mismatch_reverts(court,direct_vm):
    c,state=court;state["record"]["departure_evidence"]["tenant"]["images"]=[{"item_id":"floor","url":"https://objects.example.org/image.jpg","sha256":"a"*64}];answer(direct_vm)
    c.adjudicate("1")
    assert c.get_verdict("1")["status"] == "UNDETERMINED"
    assert c.get_verdict("1")["deduction_atto"] == "0"

def test_late_notice_zeroes_deduction_without_penalty(court,direct_vm):
    c,state=court;state["record"]["notice"]["submitted_at"]="2027-11-20T10:00:00Z";answer(direct_vm);c.adjudicate("1")
    v=c.get_verdict("1");assert not v["procedure"]["notice_timely"] and v["deduction_atto"]=="0" and v["penalty_multiplier"]==0

def test_missing_notice_waits_for_deadline(court,direct_vm):
    c,state=court;state["record"]["notice"]=None
    with direct_vm.expect_revert("deadline"):c.adjudicate("1")
    direct_vm.warp("2027-11-20T10:00:00Z");answer(direct_vm);c.adjudicate("1")
    assert c.get_verdict("1")["deduction_atto"]=="0"

def test_claim_caps_the_award(court,direct_vm):
    c,state=court;state["record"]["notice"]["claims"][0]["claimed_atto"]="20";answer(direct_vm);c.adjudicate("1")
    assert c.get_verdict("1")["deduction_atto"]=="20"

def test_fully_depreciated_item_has_no_award(court,direct_vm):
    c,state=court;state["record"]["items"][0]["age_months"]=60;answer(direct_vm);c.adjudicate("1")
    assert c.get_verdict("1")["deduction_atto"]=="0"

def test_tenant_upheld_bad_faith_appeal(court,direct_vm):
    c,state=court;answer(direct_vm);c.adjudicate("1")
    state["account"].update(appeal_bond_atto="10",appellant=TENANT)
    direct_vm.clear_mocks();direct_vm.mock_web(r"objects\.example\.org",{"response":{"status":200,"body":IMAGE,"headers":{}},"method":"GET"});direct_vm.mock_web(r"shop\.example\.org",{"status":200,"body":"Published price."});answer(direct_vm,"PRE_EXISTING","NONE",True)
    c.rehear("1");v=c.get_verdict("1");assert v["appeal_upheld"] and v["penalty_multiplier"]==2
    assert c.get_original("1")["deduction_atto"]=="600"
    with direct_vm.expect_revert("One contract"):c.rehear("1")

def test_rehearing_requires_bond(court,direct_vm):
    c,_=court;answer(direct_vm);c.adjudicate("1")
    with direct_vm.expect_revert("bond first"):c.rehear("1")

def test_unauthorized_and_repeat_judgment(court,direct_vm):
    c,_=court;answer(direct_vm);direct_vm.sender="0x"+"5"*40
    with direct_vm.expect_revert("parties only"):c.adjudicate("1")
    direct_vm.sender=bytes.fromhex(TENANT[2:]);c.adjudicate("1")
    with direct_vm.expect_revert("already recorded"):c.adjudicate("1")

@pytest.mark.parametrize('case',['missing','late','empty'])
def test_zero_entitlement_needs_no_network_or_model(court,direct_vm,monkeypatch,case):
    c,state=court
    if case=='missing':state['record']['notice']=None;direct_vm.warp('2027-11-20T10:00:00Z')
    elif case=='late':state['record']['notice']['submitted_at']='2027-11-20T10:00:00Z'
    else:state['record']['notice']['claims']=[]
    state['record']['departure_evidence']={};state['record']['move_out']=None
    from genlayer import gl
    monkeypatch.setattr(gl.vm,'run_nondet_unsafe',lambda *_: (_ for _ in ()).throw(AssertionError('No nondeterminism permitted')))
    c.adjudicate('1');v=c.get_verdict('1')
    assert v['status']=='DECIDED' and v['deduction_atto']=='0' and v['procedure_only']

@pytest.mark.parametrize('bad_hash',[True,False])
def test_invalid_party_photos_do_not_poison_other_set(court,direct_vm,bad_hash):
    c,state=court
    state['record']['departure_evidence']['landlord']={'images':[{'item_id':'floor','url':'https://bad.example.org/photo','sha256':'a'*64 if bad_hash else HASH}]}
    direct_vm.mock_web(r'bad\.example\.org',{'response':{'status':200 if bad_hash else 404,'body':IMAGE,'headers':{}},'method':'GET'})
    answer(direct_vm);c.adjudicate('1')
    assert c.get_verdict('1')['status']=='DECIDED' and c.get_verdict('1')['deduction_atto']=='600'

def test_rehearing_retry_preserves_decided_original_and_allows_takeover(court,direct_vm):
    c,state=court;answer(direct_vm);c.adjudicate('1');original=c.get_verdict('1')
    state['account'].update(appeal_bond_atto='10',appellant=LANDLORD)
    answer(direct_vm,'UNDETERMINED','NONE');c.rehear('1')
    assert c.get_verdict('1')==original and c.get_rehearing('1')['status']=='UNDETERMINED'
    answer(direct_vm,'NORMAL_WEAR','NONE');c.rehear('1')
    assert c.get_verdict('1')['status']=='DECIDED' and c.get_verdict('1')['appeal']
    assert c.get_original('1')==original

def test_original_undetermined_can_retry_without_bond(court,direct_vm):
    c,_=court;answer(direct_vm,'UNDETERMINED','NONE');c.adjudicate('1')
    answer(direct_vm);c.adjudicate('1');assert c.get_verdict('1')['status']=='DECIDED'

def test_deadline_finalization_uses_no_external_sources(court,direct_vm,monkeypatch):
    c,state=court;state['record']['departure_evidence']={};direct_vm.warp('2027-12-05T00:00:00Z')
    from genlayer import gl
    monkeypatch.setattr(gl.vm,'run_nondet_unsafe',lambda *_: (_ for _ in ()).throw(AssertionError('No external sources at expiry')))
    c.adjudicate('1');assert c.get_verdict('1')['status']=='DECIDED' and c.get_verdict('1')['deduction_atto']=='0'

def test_unclaimed_items_do_not_make_verdict_inconclusive(court,direct_vm):
    c,state=court;second={**state['record']['items'][0],'id':'unclaimed'};state['record']['items'].append(second)
    answer(direct_vm);c.adjudicate('1')
    assert c.get_verdict('1')['status']=='DECIDED' and c.get_verdict('1')['items'][1]['classification']=='NO_CLAIM'

def test_departure_upload_does_not_change_deadline_or_depreciation(court,direct_vm):
    c,state=court;state['record']['move_out']['committed_at']='2027-12-01T10:00:00Z';answer(direct_vm);c.adjudicate('1')
    assert c.get_verdict('1')['procedure']['deadline']=='2027-11-19'
    assert c.get_verdict('1')['deduction_atto']=='600'

def test_expenditure_caps_award_and_validator_checks_support(court,direct_vm):
    c,state=court;state['record']['notice']['claims'][0]['expenditure_atto']='70';answer(direct_vm);c.adjudicate('1')
    assert c.get_verdict('1')['deduction_atto']=='70'
    result,leader,validator=direct_vm._captured_validators[-1]
    altered=leader();altered['items'][0]['expense_supported']=False
    from genlayer import gl
    assert not validator(gl.vm.Return(altered))

def test_reference_never_refetched_during_judgment(court,direct_vm,monkeypatch):
    c,_=court
    from genlayer import gl
    monkeypatch.setattr(gl.nondet.web,'render',lambda *_args,**_kwargs: (_ for _ in ()).throw(AssertionError('Immutable snapshot must be used')))
    answer(direct_vm);c.adjudicate('1');assert c.get_verdict('1')['status']=='DECIDED'
