# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json
import hashlib
from datetime import date, datetime, timedelta

LIFESPAN_MONTHS = {"carpet": 60, "refrigerator": 120, "range": 240, "water_heater": 120, "air_conditioner": 120, "paint_flat": 36, "paint_enamel": 60, "linoleum": 60, "blinds": 36}

def now() -> datetime:
    return datetime.fromisoformat(gl.message_raw["datetime"].replace("Z", "+00:00"))

class TenancyRegistry(gl.Contract):
    owner: Address
    records: TreeMap[str, str]
    sequence: u256
    court: str
    escrow: str

    def __init__(self):
        self.owner = gl.message.sender_address
        self.sequence = u256(0)
        self.court = ""
        self.escrow = ""

    @gl.public.write
    def wire(self, court: str, escrow: str) -> None:
        if gl.message.sender_address != self.owner or self.court:
            raise gl.vm.UserError("[EXPECTED] Wiring is owner only and immutable")
        if Address(court) == Address(escrow) or Address(court) == self.address or Address(escrow) == self.address:
            raise gl.vm.UserError("[EXPECTED] Distinct contracts required")
        self.court, self.escrow = court, escrow

    @gl.public.view
    def get_config(self) -> dict:
        return {"court": self.court, "escrow": self.escrow, "count": int(self.sequence)}

    @gl.public.view
    def get_tenancy(self, tenancy_id: str) -> dict:
        if tenancy_id not in self.records:
            raise gl.vm.UserError("[EXPECTED] Tenancy not found")
        return json.loads(self.records[tenancy_id])

    def _party(self, record: dict) -> str:
        sender = str(gl.message.sender_address).lower()
        if sender == record["tenant"].lower():
            return "tenant"
        if sender == record["landlord"].lower():
            return "landlord"
        raise gl.vm.UserError("[EXPECTED] Tenancy parties only")

    def _save(self, record: dict) -> None:
        self.records[record["id"]] = json.dumps(record, sort_keys=True)

    @gl.public.write
    def create_tenancy(self, tenant: str, landlord: str, deposit_atto: u256, rent_atto: u256, start: str, end: str, condition_clause: str, items_json: str, jurisdiction: str) -> str:
        if not self.court:
            raise gl.vm.UserError("[EXPECTED] Contracts are not wired")
        if Address(tenant) == Address(landlord):
            raise gl.vm.UserError("[EXPECTED] Different parties required")
        if jurisdiction != "US_CA_STANDARD":
            raise gl.vm.UserError("[EXPECTED] Unsupported jurisdiction")
        if deposit_atto <= 0 or rent_atto <= 0 or deposit_atto > rent_atto or int(deposit_atto) > 10**36:
            raise gl.vm.UserError("[EXPECTED] Deposit must be positive and at most one month of rent")
        start_day, end_day = date.fromisoformat(start), date.fromisoformat(end)
        today = now().date()
        if start_day < today or end_day <= start_day or (end_day-start_day).days > 3650:
            raise gl.vm.UserError("[EXPECTED] Register before arrival with valid tenancy dates")
        if not 20 <= len(condition_clause.strip()) <= 6000 or len(items_json) > 40000:
            raise gl.vm.UserError("[EXPECTED] Invalid condition clause or inventory")
        items = json.loads(items_json)
        if not isinstance(items, list) or not 1 <= len(items) <= 20:
            raise gl.vm.UserError("[EXPECTED] Inventory needs 1 to 20 items")
        ids = []
        for item in items:
            if not isinstance(item, dict) or item.get("class") not in LIFESPAN_MONTHS:
                raise gl.vm.UserError("[EXPECTED] Unsupported item class")
            item_id = item.get("id", "")
            if not isinstance(item_id, str) or not 1 <= len(item_id) <= 64 or item_id in ids:
                raise gl.vm.UserError("[EXPECTED] Unique item identifiers required")
            ids.append(item_id)
            if not isinstance(item.get("name"), str) or not 1 <= len(item["name"]) <= 120:
                raise gl.vm.UserError("[EXPECTED] Item name required")
            if type(item.get("age_months")) is not int or not 0 <= item["age_months"] <= 1200:
                raise gl.vm.UserError("[EXPECTED] Invalid item age")
            cost = item.get("replacement_atto", "")
            if not isinstance(cost, str) or not cost.isdigit() or not 0 < int(cost) <= 10**36:
                raise gl.vm.UserError("[EXPECTED] Positive replacement ceiling required")
            url = item.get("cost_reference_url", "")
            if not isinstance(url, str) or not url.startswith("https://") or len(url) > 2048:
                raise gl.vm.UserError("[EXPECTED] Published cost reference required")
            def snapshot():
                text = gl.nondet.web.render(url, mode="text")
                if not isinstance(text, str) or not text.strip() or len(text) > 64000:
                    raise gl.vm.UserError("[EXTERNAL] Replacement reference unavailable or too large")
                return text.strip()
            item["cost_reference_text"] = gl.eq_principle.strict_eq(snapshot)
            item["cost_reference_sha256"] = hashlib.sha256(item["cost_reference_text"].encode()).hexdigest()
            item["lifespan_months"] = LIFESPAN_MONTHS[item["class"]]
        self.sequence = u256(int(self.sequence)+1)
        record = {"id": str(self.sequence), "tenant": str(Address(tenant)), "landlord": str(Address(landlord)), "deposit_atto": str(deposit_atto), "rent_atto": str(rent_atto), "start": start, "end": end, "jurisdiction": jurisdiction, "condition_clause": condition_clause.strip(), "items": items, "created_at": now().isoformat(), "tenant_accepted": False, "landlord_accepted": False, "move_in": None, "move_out": None, "departure_evidence": {}, "departure_date": end, "departure_proposal": None, "notice": None}
        terms = {key: record[key] for key in ["tenant", "landlord", "deposit_atto", "rent_atto", "start", "end", "jurisdiction", "condition_clause", "items"]}
        record["agreement_hash"] = hashlib.sha256(json.dumps(terms, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        role = self._party(record)
        record[role+"_accepted"] = True
        self._save(record)
        return record["id"]

    @gl.public.write
    def accept_terms(self, tenancy_id: str, agreement_hash: str) -> None:
        record = self.get_tenancy(tenancy_id)
        role = self._party(record)
        if agreement_hash != record["agreement_hash"]:
            raise gl.vm.UserError("[EXPECTED] Agreement fingerprint does not match")
        record[role+"_accepted"] = True
        self._save(record)

    @gl.public.write
    def commit_evidence(self, tenancy_id: str, phase: str, images_json: str) -> None:
        record = self.get_tenancy(tenancy_id)
        role = self._party(record)
        if not record["tenant_accepted"] or not record["landlord_accepted"]:
            raise gl.vm.UserError("[EXPECTED] Both parties must accept terms")
        if phase not in ["move_in", "move_out"] or phase == "move_in" and record[phase] is not None:
            raise gl.vm.UserError("[EXPECTED] Evidence phase is invalid or already committed")
        if phase == "move_in" and now().date() > date.fromisoformat(record["start"]):
            raise gl.vm.UserError("[EXPECTED] Arrival evidence must be committed by arrival day")
        if phase == "move_out":
            if not record["move_in"] or not record["move_in"]["acknowledged"]:
                raise gl.vm.UserError("[EXPECTED] Arrival evidence must be acknowledged")
            if now().date() < date.fromisoformat(record["departure_date"]):
                raise gl.vm.UserError("[EXPECTED] Departure evidence is not due yet")
            if now().date() > date.fromisoformat(record["departure_date"])+timedelta(days=35):
                raise gl.vm.UserError("[EXPECTED] Evidence correction deadline has closed")
            account = gl.get_contract_at(Address(self.escrow)).view().get_account(tenancy_id)
            if account["settled"]:
                raise gl.vm.UserError("[EXPECTED] Tenancy already settled")
        if len(images_json) > 80000:
            raise gl.vm.UserError("[EXPECTED] Evidence manifest too large")
        images = json.loads(images_json)
        expected_ids = sorted(item["id"] for item in record["items"])
        if not isinstance(images, list) or sorted(im.get("item_id", "") for im in images) != expected_ids:
            raise gl.vm.UserError("[EXPECTED] Exactly one image per inventory item required")
        for image in images:
            digest = image.get("sha256", "")
            url = image.get("url", "")
            if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
                raise gl.vm.UserError("[EXPECTED] Invalid SHA256 fingerprint")
            if not isinstance(url, str) or not url.startswith("https://") or len(url) > 2048:
                raise gl.vm.UserError("[EXPECTED] Fetchable HTTPS image URL required")
        canonical = json.dumps(images, sort_keys=True, separators=(",", ":"))
        evidence = {"images": images, "manifest_hash": hashlib.sha256(canonical.encode()).hexdigest(), "committed_at": now().isoformat(), "submitted_by": role, "acknowledged": False}
        if phase == "move_out":
            record["departure_evidence"][role] = evidence
            # Compatibility preview only; the court reads both participant sets.
            record["move_out"] = evidence
        else:
            record[phase] = evidence
        self._save(record)

    @gl.public.write
    def propose_departure(self, tenancy_id: str, departure_date: str) -> None:
        record = self.get_tenancy(tenancy_id)
        role = self._party(record)
        day = date.fromisoformat(departure_date)
        if not record["tenant_accepted"] or not record["landlord_accepted"] or record["move_out"] or record["notice"] or now().date() >= date.fromisoformat(record["departure_date"]):
            raise gl.vm.UserError("[EXPECTED] Agree early departure before the existing departure date")
        if not date.fromisoformat(record["start"]) <= day < date.fromisoformat(record["departure_date"]) or day < now().date():
            raise gl.vm.UserError("[EXPECTED] Early departure cannot be backdated or extend the tenancy")
        record["departure_proposal"] = {"date": departure_date, "submitted_by": role}
        self._save(record)

    @gl.public.write
    def acknowledge_departure(self, tenancy_id: str, departure_date: str) -> None:
        record = self.get_tenancy(tenancy_id)
        role = self._party(record)
        proposal = record["departure_proposal"]
        if not proposal or proposal["submitted_by"] == role or proposal["date"] != departure_date or now().date() > date.fromisoformat(departure_date) or record["move_out"] or record["notice"]:
            raise gl.vm.UserError("[EXPECTED] Other party must acknowledge the exact departure date before departure")
        record["departure_date"] = departure_date
        record["departure_proposal"] = None
        self._save(record)

    @gl.public.write
    def acknowledge_arrival(self, tenancy_id: str, manifest_hash: str) -> None:
        record = self.get_tenancy(tenancy_id)
        role = self._party(record)
        evidence = record["move_in"]
        if evidence is None or evidence["submitted_by"] == role or evidence["manifest_hash"] != manifest_hash:
            raise gl.vm.UserError("[EXPECTED] Other party must acknowledge the exact arrival record")
        if now().date() > date.fromisoformat(record["start"]):
            raise gl.vm.UserError("[EXPECTED] Acknowledge arrival by arrival day")
        evidence["acknowledged"] = True
        self._save(record)

    @gl.public.write
    def submit_notice(self, tenancy_id: str, claims_json: str) -> None:
        record = self.get_tenancy(tenancy_id)
        if self._party(record) != "landlord" or now().date() < date.fromisoformat(record["departure_date"]) or record["notice"] is not None:
            raise gl.vm.UserError("[EXPECTED] Landlord must submit one notice after departure")
        if len(claims_json) > 16000:
            raise gl.vm.UserError("[EXPECTED] Notice too large")
        claims = json.loads(claims_json)
        if not isinstance(claims, list) or len(claims) > len(record["items"]):
            raise gl.vm.UserError("[EXPECTED] Invalid itemised notice")
        ids = []
        for claim in claims:
            if claim.get("item_id") not in [item["id"] for item in record["items"]] or claim["item_id"] in ids:
                raise gl.vm.UserError("[EXPECTED] Unknown or duplicate claim item")
            ids.append(claim["item_id"])
            amount = claim.get("claimed_atto", "")
            if not isinstance(amount, str) or not amount.isdigit() or not 0 <= int(amount) <= int(record["deposit_atto"]):
                raise gl.vm.UserError("[EXPECTED] Invalid claim amount")
            expense = claim.get("expenditure_atto", "")
            url = claim.get("expenditure_reference_url", "")
            if int(amount) > 0:
                if not isinstance(expense, str) or not expense.isdigit() or not 0 < int(expense) <= 10**36 or not isinstance(url, str) or not url.startswith("https://") or len(url) > 2048:
                    raise gl.vm.UserError("[EXPECTED] Positive claims require actual expenditure and a published receipt")
                def snapshot_expense():
                    text = gl.nondet.web.render(url, mode="text")
                    if not isinstance(text, str) or not text.strip() or len(text) > 64000:
                        raise gl.vm.UserError("[EXTERNAL] Expenditure receipt unavailable or too large")
                    return text.strip()
                claim["expenditure_text"] = gl.eq_principle.strict_eq(snapshot_expense)
                claim["expenditure_sha256"] = hashlib.sha256(claim["expenditure_text"].encode()).hexdigest()
            if not isinstance(claim.get("reason"), str) or not 10 <= len(claim["reason"]) <= 1500:
                raise gl.vm.UserError("[EXPECTED] Explain each deduction")
        record["notice"] = {"claims": claims, "submitted_at": now().isoformat()}
        self._save(record)
