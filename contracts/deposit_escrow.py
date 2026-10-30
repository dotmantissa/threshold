# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json
from datetime import datetime, timedelta

def now() -> datetime:
    return datetime.fromisoformat(gl.message_raw["datetime"].replace("Z", "+00:00"))

@gl.contract_interface
class Recipient:
    class View:
        pass
    class Write:
        pass

class DepositEscrow(gl.Contract):
    registry: str
    court: str
    accounts: TreeMap[str, str]
    total_locked: u256

    def __init__(self, registry: str, court: str):
        self.registry = str(Address(registry))
        self.court = str(Address(court))
        self.total_locked = u256(0)

    @gl.public.view
    def get_config(self) -> dict:
        return {"registry": self.registry, "court": self.court, "total_locked_atto": str(self.total_locked), "native_balance_atto": str(self.balance)}

    @gl.public.view
    def get_account(self, tenancy_id: str) -> dict:
        if tenancy_id not in self.accounts:
            return {"deposit_atto": "0", "reserve_atto": "0", "appeal_bond_atto": "0", "appellant": "", "settled": False}
        return json.loads(self.accounts[tenancy_id])

    def _record(self, tenancy_id: str) -> dict:
        return gl.get_contract_at(Address(self.registry)).view().get_tenancy(tenancy_id)

    def _party(self, record: dict) -> str:
        sender = str(gl.message.sender_address).lower()
        if sender == record["tenant"].lower():
            return "tenant"
        if sender == record["landlord"].lower():
            return "landlord"
        raise gl.vm.UserError("[EXPECTED] Tenancy parties only")

    def _save(self, tenancy_id: str, account: dict) -> None:
        self.accounts[tenancy_id] = json.dumps(account, sort_keys=True)

    @gl.public.write.payable
    def fund_deposit(self, tenancy_id: str) -> None:
        record = self._record(tenancy_id)
        if self._party(record) != "tenant":
            raise gl.vm.UserError("[EXPECTED] Tenant funds the deposit")
        account = self.get_account(tenancy_id)
        if account["deposit_atto"] != "0" or account["settled"]:
            raise gl.vm.UserError("[EXPECTED] Deposit already funded or settled")
        if not record["tenant_accepted"] or not record["landlord_accepted"] or not record["move_in"] or not record["move_in"]["acknowledged"] or record["move_out"]:
            raise gl.vm.UserError("[EXPECTED] Fund after arrival acknowledgment and before departure")
        if now().date().isoformat() > record["start"]:
            raise gl.vm.UserError("[EXPECTED] Deposit must be funded by arrival day")
        if int(gl.message.value) != int(record["deposit_atto"]):
            raise gl.vm.UserError("[EXPECTED] Send the exact agreed deposit")
        account["deposit_atto"] = str(gl.message.value)
        account["funded_at"] = now().isoformat()
        self.total_locked = u256(int(self.total_locked)+int(gl.message.value))
        self._save(tenancy_id, account)

    @gl.public.write.payable
    def fund_reserve(self, tenancy_id: str) -> None:
        record = self._record(tenancy_id)
        if self._party(record) != "landlord":
            raise gl.vm.UserError("[EXPECTED] Landlord funds the penalty reserve")
        account = self.get_account(tenancy_id)
        if account["settled"] or account["deposit_atto"] != record["deposit_atto"] or not record["tenant_accepted"] or not record["landlord_accepted"] or not record["move_in"] or not record["move_in"]["acknowledged"]:
            raise gl.vm.UserError("[EXPECTED] Reserve requires an accepted tenancy and funded deposit")
        amount = int(gl.message.value)
        if not 0 < amount <= 2*int(record["deposit_atto"])-int(account["reserve_atto"]):
            raise gl.vm.UserError("[EXPECTED] Reserve top-up exceeds twice the deposit")
        account["reserve_atto"] = str(int(account["reserve_atto"])+amount)
        self.total_locked = u256(int(self.total_locked)+int(gl.message.value))
        self._save(tenancy_id, account)

    @gl.public.write.payable
    def bond_appeal(self, tenancy_id: str) -> None:
        record = self._record(tenancy_id)
        self._party(record)
        verdict = gl.get_contract_at(Address(self.court)).view().get_verdict(tenancy_id)
        account = self.get_account(tenancy_id)
        if account["settled"] or account["appeal_bond_atto"] != "0" or verdict.get("status") not in ["DECIDED", "UNDETERMINED"] or verdict.get("appeal") or verdict.get("procedure_only") or account["deposit_atto"] != record["deposit_atto"]:
            raise gl.vm.UserError("[EXPECTED] No appeal available")
        if now() > datetime.fromisoformat(verdict["release_after"]) or now() >= datetime.fromisoformat(record["departure_date"]+"T00:00:00+00:00")+timedelta(days=36):
            raise gl.vm.UserError("[EXPECTED] Appeal window has closed")
        required = max(1, int(record["deposit_atto"])//100)
        if int(gl.message.value) != required:
            raise gl.vm.UserError("[EXPECTED] Appeal bond must equal one percent of the deposit")
        account["appeal_bond_atto"] = str(required)
        account["appellant"] = str(gl.message.sender_address)
        account["appeal_deadline"] = min(now()+timedelta(days=3), datetime.fromisoformat(record["departure_date"]+"T00:00:00+00:00")+timedelta(days=36)).isoformat()
        self.total_locked = u256(int(self.total_locked)+required)
        self._save(tenancy_id, account)

    @gl.public.write
    def settle(self, tenancy_id: str) -> None:
        record = self._record(tenancy_id)
        self._party(record)
        account = self.get_account(tenancy_id)
        verdict = gl.get_contract_at(Address(self.court)).view().get_verdict(tenancy_id)
        recovery_after = datetime.fromisoformat(record["departure_date"]+"T00:00:00+00:00")+timedelta(days=36)
        expired = now() >= recovery_after
        if account["settled"] or account["deposit_atto"] == "0":
            raise gl.vm.UserError("[EXPECTED] A funded unsettled deposit is required")
        if verdict.get("status") != "DECIDED" and not expired:
            raise gl.vm.UserError("[EXPECTED] A decided verdict or expired resolution deadline is required")
        if verdict.get("release_after") and now() < datetime.fromisoformat(verdict["release_after"]) and not expired:
            raise gl.vm.UserError("[EXPECTED] Wait for the appeal window to close")
        if account["appeal_bond_atto"] != "0" and not verdict.get("appeal") and now() < datetime.fromisoformat(account["appeal_deadline"]) and not expired:
            raise gl.vm.UserError("[EXPECTED] Bonded appeal must be resolved or expire")
        deposit, reserve, bond = int(account["deposit_atto"]), int(account["reserve_atto"]), int(account["appeal_bond_atto"])
        deduction = int(verdict.get("deduction_atto", "0"))
        multiplier = verdict.get("penalty_multiplier", 0)
        if not 0 <= deduction <= deposit or multiplier not in [0, 2]:
            raise gl.vm.UserError("[EXPECTED] Invalid court settlement")
        if multiplier and (not verdict.get("appeal") or not verdict.get("appeal_upheld") or not verdict.get("bad_faith")):
            raise gl.vm.UserError("[EXPECTED] Penalty requires an upheld bad faith appeal")
        penalty = deposit*multiplier
        paid_penalty = min(penalty, reserve)
        tenant_amount, landlord_amount = deposit-deduction+paid_penalty, deduction+reserve-paid_penalty
        # Bonds are refundable. They prevent cost free repeated contract rehearings without
        # awarding a forfeiture unrelated to the statutory finding.
        if bond:
            if account["appellant"].lower() == record["tenant"].lower(): tenant_amount += bond
            else: landlord_amount += bond
        payout = tenant_amount+landlord_amount
        if self.balance < payout:
            raise gl.vm.UserError("[EXPECTED] Insufficient native escrow balance")
        account.update({"settled": True, "settled_at": now().isoformat(), "tenant_payout_atto": str(tenant_amount), "landlord_payout_atto": str(landlord_amount), "penalty_atto": str(penalty), "penalty_paid_atto": str(paid_penalty), "penalty_due_atto": str(penalty-paid_penalty), "resolution": "DEADLINE_FALLBACK" if verdict.get("status") != "DECIDED" else "COURT_VERDICT", "appeal_expired": bool(bond and not verdict.get("appeal")), "transfers": "EMITTED_FOR_FINALIZATION"})
        self.total_locked = u256(int(self.total_locked)-payout)
        self._save(tenancy_id, account)
        if tenant_amount:
            Recipient(Address(record["tenant"])).emit_transfer(value=u256(tenant_amount))
        if landlord_amount:
            Recipient(Address(record["landlord"])).emit_transfer(value=u256(landlord_amount))

    @gl.public.write.payable
    def pay_penalty(self, tenancy_id: str) -> None:
        record = self._record(tenancy_id)
        account = self.get_account(tenancy_id)
        if self._party(record) != "landlord" or not account["settled"]:
            raise gl.vm.UserError("[EXPECTED] Landlord pays outstanding penalty after settlement")
        amount, due = int(gl.message.value), int(account.get("penalty_due_atto", "0"))
        if not 0 < amount <= due:
            raise gl.vm.UserError("[EXPECTED] Payment must be positive and at most the outstanding penalty")
        account["penalty_due_atto"] = str(due-amount)
        account["penalty_paid_atto"] = str(int(account["penalty_paid_atto"])+amount)
        self._save(tenancy_id, account)
        Recipient(Address(record["tenant"])).emit_transfer(value=u256(amount))

    @gl.public.write
    def refund_unused_reserve(self, tenancy_id: str) -> None:
        record = self._record(tenancy_id)
        account = self.get_account(tenancy_id)
        if self._party(record) != "landlord" or account["settled"] or account["deposit_atto"] != "0" or int(account["reserve_atto"]) == 0:
            raise gl.vm.UserError("[EXPECTED] Only an unused reserve can be refunded")
        if record["tenant_accepted"] and record["landlord_accepted"] and now().date().isoformat() <= record["start"]:
            raise gl.vm.UserError("[EXPECTED] Wait until the deposit funding deadline expires")
        amount = int(account["reserve_atto"])
        if self.balance < amount:
            raise gl.vm.UserError("[EXPECTED] Insufficient native escrow balance")
        account["reserve_atto"] = "0"
        account["reserve_refunded_at"] = now().isoformat()
        self.total_locked = u256(int(self.total_locked)-amount)
        self._save(tenancy_id, account)
        Recipient(Address(record["landlord"])).emit_transfer(value=u256(amount))
