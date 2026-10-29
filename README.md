# Threshold

Keep the photos. Keep the peace.

[Open Threshold](https://threshold-peace.vercel.app)

A deposit should not become a prize for whoever tells the better story. Threshold gives both people the same starting point: photos committed when the tenancy begins, before anyone knows what might be disputed.

The tenant gets protection from invented damage. The landlord gets protection from the claim that every broken thing was already broken. Everyone gets a record they can actually read.

## What you can do

Sign in with your email. Create a tenancy, add the inventory and published replacement references, then share its link with the other person. Both people accept the same agreement.

Capture arrival photos by arrival day. The capture flow checks for faces, removes location metadata and lets you review the exact saved image. The other person acknowledges that set. The tenant then places the deposit into escrow, where it stays throughout the tenancy.

At departure, capture the same items from the same angles. The landlord registers an itemised notice. GenLayer validators compare each pair, check the recorded dates and produce a finding with a deduction band. The app shows the evidence beside the finding.

Either person can bond a rehearing. A decided verdict has a three day settlement pause. Once that window closes, either person can request release. Every action has a receipt, including actions interrupted by a closed tab.

There are no sample tenancies or invented verdicts in the app. An empty account starts empty.

## The deployed contracts

Network: GenLayer StudioNet, chain ID 61999.

| Contract | Address | Responsibility |
| :--- | :--- | :--- |
| Tenancy registry | `0xf4F93c5962Df927B342c4057389e50913d08390d` | Parties, agreement, inventory, dates and evidence commitments |
| Condition court | `0xE117b28EB5782f9e647A706fb412BBeb7b3b5D38` | Image comparison, procedure, deduction bands and rehearing |
| Deposit escrow | `0x07B6336B24d12F34E751Fc00102cFe64F4c00Ec9` | Actual native custody, appeal bonds, penalty reserve and payout instructions |

Deployment hashes, source fingerprints and wiring receipts are in [deployment.json](deployment.json). All contracts pin a concrete GenVM runner.

Studio balances are simulated credits. This deployment does not hold fiat deposits. A stored number never substitutes for an actual payable funding transaction.

## How a finding becomes a verdict

Each validator fetches the committed image bytes and checks SHA256 before judging. Each item is classified as new damage, pre existing condition, normal wear or undetermined.

Validators must agree exactly on item identity, classification, deduction band, bad faith finding, the number of items with new damage and the procedural checks. Explanations can differ. Bands deliberately stay coarse: none, low, medium and high. Deterministic code computes depreciation, claim ceilings and the deposit cap.

Unclear evidence produces `UNDETERMINED`. That holds funds for appeal instead of forcing a deduction. The contract permits one bonded rehearing. If that also remains undetermined, funds stay held; this version has no administrative override. Failed consensus also cannot manufacture a successful verdict.

The live image control pair reached consensus as pre existing condition. That proves the image path works. It does not establish stability across varied real damage. The public record is [docs/image-probe.json](docs/image-probe.json).

## Dates, references and penalties

The current profile covers standard California residential tenancies under Civil Code 1950.5. It uses the ordinary one month deposit ceiling and a notice deadline of 21 calendar days. Small landlord exceptions, other jurisdictions, equipment and vehicle rentals need their own profiles before use.

The agreed escrow terms produce no deduction for a late or missing registered notice. Registered dates use network UTC dates. Registration proves the app record time, not postal service. The app does not claim every real world late deduction is automatically void.

Useful life comes from HUD Appendix 5D. It is a sample schedule, not a universal legal mandate. Each inventory item also needs a published replacement cost reference and a ceiling both parties accept. Studio credit conversions are agreed by the parties. Unreadable or unrelated references cannot justify an invented price.

A landlord can fund a separate reserve equal to twice the deposit before departure. An upheld tenant appeal with affirmative evidence of bad faith can trigger that multiplier. A mistake, rejected claim or late notice alone is not bad faith. A penalty cannot spend another tenancy’s funds. If the required reserve is insufficient, settlement remains blocked. The reserve is optional in this prototype, so both people should understand that limit before funding.

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

The live smoke creates two separate test accounts and uses the real Studio faucet. It verifies deployed source, schemas, registration, acceptance, immutable arrival evidence, acknowledgement and native custody. Private test accounts remain ignored. Departure and payout checks are time gated; direct tests cover them, but the complete live settlement lifecycle has not yet been verified.

To deploy fresh contracts, set your deployment key locally and run `npm run contracts:deploy`. The script saves receipts as it progresses and resumes an interrupted deployment. Keep the resulting public `deployment.json` with the application.

Deploy the app with Vercel using Node 22. Configure Privy, Neon and Blob environment values on the hosting platform. Set `APP_URL` to the public application origin. Run the database migration before accepting users. Keep the Privy secret, database URL, storage token and deployment key out of Git and browser bundles.

Design decisions and authority boundaries are recorded in [docs/design.md](docs/design.md) and [docs/architecture.md](docs/architecture.md).
