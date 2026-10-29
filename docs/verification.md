# What has been checked

All five written contracts pass GenVM lint. There are 69 passing direct contract tests and 41 passing backend tests. Frontend lint, TypeScript and the production build pass.

The deployed registry, court and escrow match their committed source fingerprints and are wired together. A real StudioNet smoke used two independent accounts, the actual faucet, accepted terms, immutable arrival evidence, acknowledgement, a funded reserve and native deposit custody. Lossless receipt parsing was checked against the actual registration, deposit and reserve transactions.

A real image control pair reached consensus as pre existing condition. A separate live sandbox probe verified the 21 day deadline calculation. The complete departure, appeal and payout lifecycle remains time gated and has direct test coverage. It has not been presented as a completed live settlement.

A real email code was accepted by Privy. The resulting access token was cryptographically verified, the account has an embedded Ethereum wallet, and the protected tenancy API returned its actual empty list. No fabricated account records were seeded. Desktop and mobile screenshots were reviewed in both themes. The authenticated dashboard also passed. Firefox reported no page errors or mobile overflow.

The production app uses Vercel Blob and Neon. Vercel’s visitor authentication gate is disabled for this public application. Secrets remain in ignored local files or hosting configuration. The deployment signer is absent from the application runtime.

## Dependency review

Updates removed the websocket, UUID and URI decoder advisories. The remaining audit result comes from one Zod memory exhaustion advisory in transitive dependencies used by Privy and Vercel tooling. Several parents require Zod 3. Forcing Zod 4 across those packages would change their validation APIs and has not been treated as a safe fix.

The application’s own Zod version is patched. API bodies, inventory sizes, photo bytes and request rates are bounded. External wallet login methods are disabled. The upstream dependency still requires a compatible patched release; a clean application lint result does not mean the dependency audit is clean.
