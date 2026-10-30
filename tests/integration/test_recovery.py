"""Five-validator simulator integration with real SDK cross-contract calls.

GLSim executes Python, not GenVM, and uses an inline sandbox shim. Its native message hook does not settle
recipient balances; live smoke verifies actual transfers separately.
"""
import json
import hashlib
from pathlib import Path
import pytest

pytest.importorskip('glsim')
from glsim.engine import SimEngine
from glsim.state import StateStore
from glsim.consensus import run_consensus

TENANT='0x'+'1'*40
LANDLORD='0x'+'2'*40
IMAGE=b'isolated integration photograph'
MANIFEST=json.dumps([{'item_id':'floor','url':'https://fixture.example/photo','sha256':hashlib.sha256(IMAGE).hexdigest()}])

@pytest.fixture
def network(monkeypatch):
    import glsim.engine as module
    original=module.deploy_contract
    def deploy(*args,**kwargs):
        kwargs['sdk_version']='v0.2.16'
        return original(*args,**kwargs)
    monkeypatch.setattr(module,'deploy_contract',deploy)
    engine=SimEngine(StateStore());engine.activate()
    engine.vm.warp('2026-10-30T10:00:00Z')
    registry,_=engine.deploy(str(Path('contracts/tenancy_registry.py').resolve()),sender=TENANT)
    court,_=engine.deploy(str(Path('contracts/condition_court.py').resolve()),[registry],sender=TENANT)
    escrow,_=engine.deploy(str(Path('contracts/deposit_escrow.py').resolve()),[registry,court],sender=TENANT)
    from genlayer import gl
    monkeypatch.setattr(gl.vm,"spawn_sandbox",lambda fn: gl.vm.Return(fn()))
    def warp(timestamp):
        engine.vm.warp(timestamp);gl.message_raw['datetime']=timestamp
    warp('2026-10-30T10:00:00Z')
    engine.vm.mock_web(r'fixture\.example',{'status':200,'body':'Committed replacement reference and paid carpet invoice.'})
    engine.vm.mock_web(r'images\.example',{'response':{'status':200,'body':IMAGE,'headers':{}},'method':'GET'})
    def write(address,method,args=None,sender=TENANT,value=0):
        engine.vm.value=value
        def execute():return engine.call_method(address,method,args or [],sender=sender),b''
        receipt=run_consensus(engine,execute,num_validators=5,max_rotations=3)
        assert receipt.error is None,receipt.error
        assert receipt.votes==['agree']*5
        return receipt.result
    def read(address,method):return engine.call_method(address,method,['1'],sender=TENANT)
    write(registry,'wire',[court,escrow]);write(court,'wire',[escrow])
    item={'id':'floor','name':'Carpet','class':'carpet','age_months':12,'replacement_atto':'1000','cost_reference_url':'https://fixture.example/reference'}
    tid=write(registry,'create_tenancy',[TENANT,LANDLORD,1000,1000,'2026-10-30','2026-10-31','Ordinary wear is allowed under this agreed condition clause.',json.dumps([item]),'US_CA_STANDARD'])
    assert tid=='1'
    write(registry,'accept_terms',['1',read(registry,'get_tenancy')['agreement_hash']],LANDLORD)
    manifest=json.loads(MANIFEST);manifest[0]['url']='https://images.example/photo';manifest=json.dumps(manifest)
    write(registry,'commit_evidence',['1','move_in',manifest])
    write(registry,'acknowledge_arrival',['1',read(registry,'get_tenancy')['move_in']['manifest_hash']],LANDLORD)
    write(escrow,'fund_deposit',['1'],value=1000);engine.vm.deal(escrow,1000)
    yield engine,write,read,warp,registry,court,escrow,manifest
    engine.deactivate()

@pytest.mark.parametrize('scenario',['missing_notice','invalid_photo','abandoned_appeal','failed_rehearing','unfunded_penalty'])
def test_connected_contracts_have_bounded_recovery(network,scenario):
    engine,write,read,warp,registry,court,escrow,manifest=network
    warp('2026-10-31T10:00:00Z')
    if scenario=='missing_notice':
        warp('2026-11-22T10:00:00Z');write(court,'adjudicate',['1'])
    else:
        write(registry,'commit_evidence',['1','move_out',manifest])
        claim={'item_id':'floor','claimed_atto':'900','expenditure_atto':'900','expenditure_reference_url':'https://fixture.example/invoice','reason':'A new carpet tear requires documented replacement.'}
        write(registry,'submit_notice',['1',json.dumps([claim])],LANDLORD)
        if scenario=='invalid_photo':
            bad=json.loads(manifest);bad[0]['sha256']='a'*64
            write(registry,'commit_evidence',['1','move_out',json.dumps(bad)])
        classification='NEW_DAMAGE'
        def answer(kind,faith=False):
            engine.vm._llm_mocks.clear()
            engine.vm.mock_llm('neutral condition adjudicator',json.dumps({'classification':kind,'band':'HIGH' if kind=='NEW_DAMAGE' else 'NONE','bad_faith':faith,'expense_supported':True,'reason':'An independent comparison supports this finding.'}))
        answer(classification);write(court,'adjudicate',['1'])
        if scenario in ['abandoned_appeal','failed_rehearing','unfunded_penalty']:
            write(escrow,'bond_appeal',['1'],LANDLORD if scenario=='abandoned_appeal' else TENANT,value=10);engine.vm.deal(escrow,1010)
            if scenario=='failed_rehearing':
                original=read(court,'get_verdict');answer('UNDETERMINED');write(court,'rehear',['1'],LANDLORD)
                assert read(court,'get_verdict')==original
                answer('NORMAL_WEAR');write(court,'rehear',['1'],LANDLORD)
            if scenario=='unfunded_penalty':
                answer('PRE_EXISTING',True);write(court,'rehear',['1'])
    warp('2026-12-07T10:00:00Z');write(escrow,'settle',['1'])
    account=read(escrow,'get_account')
    assert account['settled']
    assert int(account['tenant_payout_atto'])+int(account['landlord_payout_atto'])==1000+int(account['appeal_bond_atto'])
    if scenario=='unfunded_penalty':assert account['penalty_due_atto']=='2000' and account['tenant_payout_atto']=='1010'
    if scenario in ['missing_notice','invalid_photo']:assert account['tenant_payout_atto']=='1000'
