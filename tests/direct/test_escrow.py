import pytest
from types import SimpleNamespace

TENANT="0x"+"1"*40
LANDLORD="0x"+"2"*40
REGISTRY="0x"+"3"*40
COURT="0x"+"4"*40

@pytest.fixture
def escrow(direct_vm,direct_deploy,monkeypatch):
    direct_vm.sender=TENANT;direct_vm.warp("2026-10-29T10:00:00Z")
    c=direct_deploy("contracts/deposit_escrow.py",REGISTRY,COURT)
    from genlayer import gl
    state={"record":{"tenant":TENANT,"landlord":LANDLORD,"deposit_atto":"1000","start":"2026-10-29","end":"2026-10-30","departure_date":"2026-10-30","tenant_accepted":True,"landlord_accepted":True,"move_in":{"acknowledged":True},"move_out":None},"verdict":{"status":"DECIDED","deduction_atto":"200","release_after":"2026-10-31T10:00:00+00:00","appeal":False,"penalty_multiplier":0},"transfers":[]}
    view=SimpleNamespace(get_tenancy=lambda _:state["record"],get_verdict=lambda _:state["verdict"])
    monkeypatch.setattr(gl,"get_contract_at",lambda _:SimpleNamespace(view=lambda:view))
    # Isolate settlement arithmetic while asserting emitted recipient and amount.
    import sys
    mod=sys.modules[c.__module__]
    monkeypatch.setattr(mod,"Recipient",lambda address:SimpleNamespace(emit_transfer=lambda **kw:state["transfers"].append((str(address),int(kw["value"])))))
    return c,state

def funded(escrow,direct_vm):
    c,state=escrow;direct_vm.value=1000;c.fund_deposit("1");direct_vm.deal(c.address,1000);return c,state

def test_exact_funding_and_locked_value(escrow,direct_vm):
    c,_=escrow;direct_vm.value=999
    with direct_vm.expect_revert("exact agreed"):c.fund_deposit("1")
    direct_vm.value=1000;c.fund_deposit("1")
    assert c.get_account("1")["deposit_atto"]=="1000" and c.get_config()["total_locked_atto"]=="1000"
    with direct_vm.expect_revert("already funded"):c.fund_deposit("1")

def test_arrival_evidence_required(escrow,direct_vm):
    c,state=escrow;state["record"]["move_in"]["acknowledged"]=False;direct_vm.value=1000
    with direct_vm.expect_revert("acknowledgment"):c.fund_deposit("1")

def test_funding_deadline(escrow,direct_vm):
    c,_=escrow;direct_vm.warp("2026-10-30T10:00:00Z");direct_vm.value=1000
    with direct_vm.expect_revert("by arrival day"):c.fund_deposit("1")

def test_only_tenant_funds(escrow,direct_vm):
    c,_=escrow;direct_vm.sender=LANDLORD;direct_vm.value=1000
    with direct_vm.expect_revert("Tenant funds"):c.fund_deposit("1")

def test_landlord_reserve_is_separate(escrow,direct_vm):
    c,_=funded(escrow,direct_vm);direct_vm.sender=LANDLORD;direct_vm.value=2000;c.fund_reserve("1")
    assert c.get_config()["total_locked_atto"]=="3000" and c.get_account("1")["reserve_atto"]=="2000"
    with direct_vm.expect_revert("top-up"):c.fund_reserve("1")

def test_release_window_and_split(escrow,direct_vm):
    c,state=funded(escrow,direct_vm)
    with direct_vm.expect_revert("appeal window"):c.settle("1")
    direct_vm.warp("2026-11-01T10:00:00Z");direct_vm.value=0;c.settle("1")
    assert state["transfers"]==[(TENANT,800),(LANDLORD,200)]
    assert c.get_account("1")["settled"] and c.get_config()["total_locked_atto"]=="0"
    with direct_vm.expect_revert("unsettled"):c.settle("1")

@pytest.mark.parametrize("status",["UNDETERMINED","AWAITING_EVIDENCE"])
def test_uncertain_verdict_cannot_release(escrow,direct_vm,status):
    c,state=funded(escrow,direct_vm);state["verdict"]["status"]=status;direct_vm.warp("2026-11-01T10:00:00Z")
    with direct_vm.expect_revert("decided"):c.settle("1")

def test_bond_waits_only_until_completion_deadline(escrow,direct_vm):
    c,state=funded(escrow,direct_vm);direct_vm.value=9
    with direct_vm.expect_revert("one percent"):c.bond_appeal("1")
    direct_vm.value=10;c.bond_appeal("1")
    assert c.get_account("1")["appeal_bond_atto"]=="10"
    direct_vm.warp("2026-11-01T10:00:00Z")
    direct_vm.warp("2026-10-31T12:00:00Z")
    with direct_vm.expect_revert("Bonded appeal"):c.settle("1")
    direct_vm.warp("2026-11-01T10:00:00Z"); direct_vm.deal(c.address,1010); direct_vm.value=0; c.settle("1")
    assert c.get_account("1")["settled"] and state["transfers"] == [(TENANT,810),(LANDLORD,200)]

def test_penalty_paid_from_reserve_and_bond_returned(escrow,direct_vm):
    c,state=funded(escrow,direct_vm);direct_vm.sender=LANDLORD;direct_vm.value=2000;c.fund_reserve("1")
    direct_vm.sender=TENANT;direct_vm.value=10;c.bond_appeal("1")
    state["verdict"].update(appeal=True,appeal_upheld=True,bad_faith=True,penalty_multiplier=2,deduction_atto="0")
    direct_vm.warp("2026-11-01T10:00:00Z");direct_vm.deal(c.address,3010);direct_vm.value=0;c.settle("1")
    assert state["transfers"]==[(TENANT,3010)]
    assert c.get_account("1")["penalty_atto"]=="2000"
    assert c.get_config()["total_locked_atto"]=="0"

def test_underfunded_penalty_never_spends_other_deposits(escrow,direct_vm):
    c,state=funded(escrow,direct_vm);direct_vm.value=10;c.bond_appeal("1")
    state["verdict"].update(appeal=True,appeal_upheld=True,bad_faith=True,penalty_multiplier=2)
    direct_vm.warp("2026-11-01T10:00:00Z");direct_vm.deal(c.address,10000)
    c.settle("1")
    assert c.get_account("1")["settled"]
    assert state["transfers"] == [(TENANT,810),(LANDLORD,200)]
    assert c.get_account("1")["penalty_due_atto"] == "2000"
    assert c.get_config()["total_locked_atto"] == "0"

def test_late_bond_rejected_but_undetermined_remains_appealable(escrow,direct_vm):
    c,state=funded(escrow,direct_vm);direct_vm.value=10;direct_vm.warp("2026-11-02T10:00:00Z")
    with direct_vm.expect_revert("window has closed"):c.bond_appeal("1")
    state["verdict"]["status"]="UNDETERMINED"
    with direct_vm.expect_revert("window has closed"):c.bond_appeal("1")

def test_insufficient_native_balance_reverts(escrow,direct_vm):
    c,state=funded(escrow,direct_vm);direct_vm.deal(c.address,0);direct_vm.warp("2026-11-01T10:00:00Z")
    with direct_vm.expect_revert("native escrow balance"):c.settle("1")
    assert not c.get_account("1")["settled"]

def test_outsider_cannot_settle_or_bond(escrow,direct_vm):
    c,_=funded(escrow,direct_vm);direct_vm.sender="0x"+"5"*40
    with direct_vm.expect_revert("parties only"):c.settle("1")
    with direct_vm.expect_revert("parties only"):c.bond_appeal("1")

@pytest.mark.parametrize('status',['AWAITING_EVIDENCE','UNDETERMINED'])
def test_deadline_releases_without_evidence_or_completed_verdict(escrow,direct_vm,status):
    c,state=funded(escrow,direct_vm);state['verdict']={'status':status};direct_vm.value=0
    direct_vm.warp('2026-12-05T00:00:00Z');c.settle('1')
    assert state['transfers']==[(TENANT,1000)] and c.get_account('1')['resolution']=='DEADLINE_FALLBACK'

def test_abandoned_landlord_appeal_cannot_lock_tenant_for_ten_years(escrow,direct_vm):
    c,state=funded(escrow,direct_vm);direct_vm.sender=LANDLORD;direct_vm.value=10;c.bond_appeal('1')
    direct_vm.sender=TENANT;direct_vm.value=0;direct_vm.deal(c.address,1010);direct_vm.warp('2036-12-05T00:00:00Z');c.settle('1')
    assert state['transfers']==[(TENANT,800),(LANDLORD,210)] and c.get_account('1')['appeal_expired']

def test_reserve_rejected_for_unaccepted_or_unfunded_tenancy(escrow,direct_vm):
    c,state=escrow;direct_vm.sender=LANDLORD;direct_vm.value=2000
    with direct_vm.expect_revert('funded deposit'):c.fund_reserve('1')
    direct_vm.sender=TENANT;direct_vm.value=1000;c.fund_deposit('1')
    state['record']['landlord_accepted']=False;direct_vm.sender=LANDLORD;direct_vm.value=2000
    with direct_vm.expect_revert('accepted tenancy'):c.fund_reserve('1')

def test_reserve_can_be_topped_up_after_departure(escrow,direct_vm):
    c,state=funded(escrow,direct_vm);state['record']['move_out']={'images':[]};direct_vm.sender=LANDLORD;direct_vm.value=1000;c.fund_reserve('1');c.fund_reserve('1')
    assert c.get_account('1')['reserve_atto']=='2000'

def test_penalty_debt_paid_after_principal_settlement(escrow,direct_vm):
    c,state=funded(escrow,direct_vm);direct_vm.value=10;c.bond_appeal('1')
    state['verdict'].update(appeal=True,appeal_upheld=True,bad_faith=True,penalty_multiplier=2,deduction_atto='0')
    direct_vm.deal(c.address,1010);direct_vm.value=0;direct_vm.warp('2026-11-02T00:00:00Z');c.settle('1')
    assert state['transfers']==[(TENANT,1010)] and c.get_account('1')['penalty_due_atto']=='2000'
    direct_vm.sender=LANDLORD;direct_vm.value=500;c.pay_penalty('1')
    assert state['transfers'][-1]==(TENANT,500) and c.get_account('1')['penalty_due_atto']=='1500'
    assert c.get_config()['total_locked_atto']=='0'

def test_legacy_unused_reserve_has_refund_path(escrow,direct_vm):
    c,state=escrow
    # Model an existing unused reserve without relaxing new funding rules.
    c._save('1',{**c.get_account('1'),'reserve_atto':'2000'});c.total_locked=2000
    direct_vm.deal(c.address,2000);direct_vm.sender=LANDLORD;direct_vm.value=0
    with direct_vm.expect_revert('funding deadline'):c.refund_unused_reserve('1')
    direct_vm.warp('2026-10-30T00:00:00Z');c.refund_unused_reserve('1')
    assert state['transfers']==[(LANDLORD,2000)] and c.get_config()['total_locked_atto']=='0'
