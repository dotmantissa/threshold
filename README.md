# Threshold

Keep the photos. Keep the peace.

[Open Threshold](https://threshold-peace.vercel.app)

A deposit should not become a prize for whoever tells the better story. Threshold gives both people the same starting point: photos committed when the tenancy begins, before anyone knows what might be disputed.

The tenant gets protection from invented damage. The landlord gets protection from the claim that every broken thing was already broken. Everyone gets a record they can actually read.

## What you can do

Sign in with your email. Create a tenancy, add the inventory and published replacement references, then share its link with the other person. Both people accept the same agreement.

Capture arrival photos by arrival day. The capture flow checks for faces, removes location metadata and lets you review the exact saved image. The other person acknowledges that set. The tenant then places the deposit into escrow, where it stays throughout the tenancy.

The agreed end date anchors departure and depreciation; both parties can agree an earlier date without backdating it. Each person can submit and correct a separate departure photo set through day 35. The landlord registers an itemised notice with actual expenditure and a published receipt. GenLayer validators compare each pair, check the recorded dates and produce a finding with a deduction band. The app shows the evidence beside the finding.

Either person can bond a rehearing and either can complete it within three days. Inconclusive attempts preserve a decided original and can be retried within that window. Subjective verdicts have a three day settlement pause, bounded by the fixed resolution deadline. A missing, late or empty notice produces a deterministic zero deduction without fetching evidence. After the end of departure day 35, settlement can proceed even without a verdict, using only supported deductions. Unsigned preparations expire and never lock the other person’s actions. Accepted execution, final execution and completed recipient transfers have separate statuses; both participants can reconcile submitted receipts. Every action has a receipt, including actions interrupted by a closed tab.

There are no sample tenancies or invented verdicts in the app. An empty account starts empty.

## The deployed contracts

Network: GenLayer StudioNet, chain ID 61999.

| Contract | Address | Responsibility |
| :--- | :--- | :--- |
| Tenancy registry | `0x111A9f88734D0C4040B79A4C1D4e2Bc7267922CD` | Parties, agreement, inventory, dates and evidence commitments |
| Condition court | `0xaf431725Ec27c577e47AAB22f10F2cA0fbf860D3` | Image comparison, procedure, deduction bands and rehearing |
| Deposit escrow | `0xb1F44D08be4A7e733dDF8aB03B5230b9869AE5be` | Native custody, appeal bonds, penalty reserve and external wallet payouts |

Deployment hashes, source fingerprints and wiring receipts are in [deployment.json](deployment.json). All contracts pin a concrete GenVM runner. Previous addresses remain in that file and existing indexed tenancies retain their original contracts. These immutable legacy escrows cannot acquire the new recovery methods by redeploying.

Studio balances are simulated credits. This deployment does not hold fiat deposits. A stored number never substitutes for an actual payable funding transaction.

## How a finding becomes a verdict

Each validator fetches usable committed images from both participants and checks SHA256 before judging. Bad hashes and unavailable images do not poison the other party’s usable set. Each item is classified as new damage, pre existing condition, normal wear or undetermined.

Validators must agree exactly on item identity, classification, deduction band, bad faith and expenditure-support findings, the number of items with new damage and the procedural checks. Explanations can differ. Bands deliberately stay coarse: none, low, medium and high. Deterministic code caps the award by documented actual expenditure, depreciation, the selected band, the claim and the deposit. Bands are conservative agreed ceilings, not estimates of exact legal damages.

Unclear claimed evidence produces `UNDETERMINED` and a zero unsupported deduction. Original reviews can be retried with corrected photos; inconclusive rehearings remain retryable within the bond deadline. Neither can extend the fixed recovery horizon. After it expires, either party can settle without external evidence or a completed review. Failed consensus cannot manufacture a successful finding.

The live image control pair reached consensus as pre existing condition. That proves the image path works. It does not establish stability across varied real damage. The public record is [docs/image-probe.json](docs/image-probe.json).

## Dates, references and penalties

The current profile covers standard California residential tenancies under Civil Code 1950.5. It uses the ordinary one month deposit ceiling and a notice deadline of 21 calendar days from the agreed departure date, independent of upload time. Small landlord exceptions, other jurisdictions, equipment and vehicle rentals need their own profiles before use.

The agreed escrow terms produce no deduction for a late or missing registered notice. Registered dates use network UTC dates. Registration proves the app record time, not postal service. The app does not claim every real world late deduction is automatically void.

Useful life comes from HUD Appendix 5D. It is a sample schedule, not a universal legal mandate. Each inventory item also needs a published replacement cost reference and a ceiling both parties accept. Reference text and its SHA256 snapshot are part of the complete agreement fingerprint, including parties, money, dates, jurisdiction, clause and inventory. Receipt text is snapshotted when a positive claim is submitted; later page changes cannot alter either reference. Studio credit conversions are agreed by the parties. Unreadable or unrelated references cannot justify an invented price.

A landlord can fund and top up a separate reserve up to twice the deposit only after the accepted arrival and deposit funding, including after departure. An upheld tenant appeal with affirmative evidence of bad faith can trigger that multiplier. A mistake, rejected claim or late notice alone is not bad faith. A penalty cannot spend another tenancy’s funds. Settlement releases the principal and available penalty reserve. Any unpaid penalty is recorded as a separate debt and can be paid after settlement; it cannot consume another tenancy’s balance or block principal release. The reserve is optional, so collection of an unpaid penalty is not guaranteed.

Sources: [California Courts](https://selfhelp.courts.ca.gov/guide-security-deposits) and [HUD guidance](https://www.hud.gov/sites/documents/HSG-06-01GHBGUID.PDF).

## Photos and privacy

Images live in object storage. Only fingerprints and fetchable URLs go on chain. Those URLs grant access to the image: validators and anyone reading the chain can fetch them. They are not private albums.

Faces and documents must be excluded at capture time. A local MediaPipe model checks for faces before upload and blocks capture if the check cannot load. It can miss a face. Users must move documents, screens and personal details out of frame and explicitly review the photo. The server removes EXIF and location metadata, and the client verifies the final saved bytes before commitment. Original photos are not uploaded.

The production store uses immutable Vercel Blob objects. S3 storage with conditional writes is also supported. Local storage requires a persistent server and a public HTTPS address; it is unsuitable for serverless deployment.

## Run locally

Use Node 22 and Python 3.12 or later. Copy `.env.example` to `.env.local` and fill in your own values. Keep that file private. The deployment signer is for deployment scripts only and must not be installed in the application runtime.

```sh
npm ci
python3 -m pip install -r requirements.txt
npm run db:migrate
npm run dev
```

Privy uses email codes and embedded accounts. Account signing stays with the user. The server checks authentication and tenancy membership; it never signs tenancy actions with a shared deployment key. Neon is a convenient index. The deployed contracts remain authoritative.

The workstation transport bridge is optional. Enable `THRESHOLD_CURL_TRANSPORT=1` only where native Node fetch cannot reach providers. It keeps private request headers in restricted temporary files. Normal deployment uses native fetch.

## Verify and deploy

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run contracts:lint
npm run contracts:test
npm run contracts:smoke
```

Direct tests cover every written contract, including the image and sandbox probes. The harness uses the explicit GenVM v0.2.16 SDK archive, which contains the contracts’ pinned runner. Backend tests cover receipt binding, exact amounts, authorization rules and request boundaries. Test fixtures never become application records.

Real email authentication and the authenticated empty dashboard have also been verified.

The complete live smoke passed with two separate test accounts and the real Studio faucet. It verified finalized execution, source equality, snapshots, agreement, arrival, native custody, mutual early departure, competing departure sets including an invalid opposing hash, a zero-claim verdict and settlement. It verified exact finalized credited external transfers and recipient balance increases of 1,000 and 2,000 atto, with escrow decreasing by 3,000 atto. The receipt and balance proof is in [docs/studionet-smoke.json](docs/studionet-smoke.json). Private accounts remain ignored. Five-validator simulator tests exercise adversarial deadlines, abandoned bonds, invalid evidence, rehearing recovery and unpaid penalties with real SDK cross-contract reads and an inline sandbox shim; they are not actual GenVM execution or independent external models. The live zero-claim lifecycle does not establish varied real-damage or live time-expiry consensus.

To deploy a new immutable version, set your deployment key locally and run `npm run contracts:deploy -- --fresh`. Resume an interrupted deployment without `--fresh`. The script saves receipts as it progresses and resumes an interrupted deployment. Keep the resulting public `deployment.json` with the application.

Deploy the app with Vercel using Node 22. Configure Privy, Neon and Blob environment values on the hosting platform. Set `APP_URL` to the public application origin. Run the database migration before accepting users. Keep the Privy secret, database URL, storage token and deployment key out of Git and browser bundles.

Design decisions and authority boundaries are recorded in [docs/design.md](docs/design.md) and [docs/architecture.md](docs/architecture.md).
