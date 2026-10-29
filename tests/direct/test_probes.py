import hashlib
import json
import pytest

IMAGE=b'isolated image probe bytes'
HASH=hashlib.sha256(IMAGE).hexdigest()

@pytest.mark.parametrize('classification',['PRE_EXISTING','NORMAL_WEAR','NEW_DAMAGE','UNDETERMINED'])
def test_image_probe_classification(direct_deploy,direct_vm,classification):
    c=direct_deploy('contracts/probes/image_probe.py')
    direct_vm.mock_web('images.example.org',{'response':{'status':200,'body':IMAGE,'headers':{}},'method':'GET'})
    direct_vm.mock_llm('Compare these two property',json.dumps({'classification':classification,'reason':'A controlled image fixture for direct tests.'}))
    c.compare('https://images.example.org/before','https://images.example.org/after',HASH,HASH)
    assert json.loads(c.get_result())['classification']==classification
    result,leader,validator=direct_vm._captured_validators[-1]
    from genlayer import gl
    assert validator(gl.vm.Return(result))
    assert not validator(gl.vm.Return({**result,'classification':'OTHER'}))

def test_probe_rejects_uncommitted_bytes(direct_deploy,direct_vm):
    c=direct_deploy('contracts/probes/image_probe.py')
    direct_vm.mock_web('images.example.org',{'response':{'status':200,'body':IMAGE,'headers':{}},'method':'GET'})
    with direct_vm.expect_revert('hash mismatch'):c.compare('https://images.example.org/before','https://images.example.org/after','a'*64,HASH)
    assert c.get_result()==''

@pytest.mark.parametrize('departure,deadline',[('2026-10-29','2026-11-19'),('2028-02-15','2028-03-07'),('2027-12-20','2028-01-10')])
def test_sandbox_date_arithmetic(direct_deploy,direct_vm,monkeypatch,departure,deadline):
    c=direct_deploy('contracts/probes/sandbox_probe.py')
    from genlayer import gl
    monkeypatch.setattr(gl.vm,'spawn_sandbox',lambda fn:gl.vm.Return(fn()))
    c.check(departure)
    assert c.get_deadline()==deadline
