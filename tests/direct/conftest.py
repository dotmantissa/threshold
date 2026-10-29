import sys
import pytest

@pytest.fixture(autouse=True)
def refresh_transaction_time(direct_vm, monkeypatch):
    """The installed direct fixture warps Python time but leaves message_raw stale.
    Mirror the network transaction timestamp without changing contract code.
    """
    original = direct_vm.warp
    def warp(timestamp):
        original(timestamp)
        gl = sys.modules.get("genlayer.gl")
        if gl is not None and getattr(gl, "message_raw", None) is not None:
            gl.message_raw["datetime"] = timestamp
    monkeypatch.setattr(direct_vm, "warp", warp)

@pytest.fixture
def direct_deploy(direct_deploy):
    """Use the release containing the pinned contract runner on fresh machines.

    New GenVM releases no longer publish the universal archive expected by this
    harness. The release is explicit; the contract runner hash stays unchanged.
    """
    def deploy(path, *args, **kwargs):
        return direct_deploy(path, *args, sdk_version="v0.2.16", **kwargs)
    return deploy
