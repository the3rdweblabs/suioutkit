<h1 align="center">
SuiOutKit
</h1>

Universal payment gateway for merchants: accept **fiat** (bank transfer, OPay, cards) and **crypto** (Sui wallet, outPay). Funds are settled on Sui and paired with on‑chain receipts and Walrus-stored invoice metadata.
| Layer | Path | Role |
|-------|------|------|
| **SDK** | [`sdk/`](sdk/) | Browser package (`suioutkit`) - checkout modal, session API, wallet flows |
| **Backend** | [`backend/`](backend/) | Express service - providers, FX, treasury checks, Walrus, on-chain PTBs |
| **Contracts** | [`contracts/suioutkit/`](contracts/suioutkit/) | Move - treasury, `settle_fiat`, `SuiOutKitReceipt` |

## Features

- **Fiat checkout** - Flutterwave (NGN bank transfer, OPay) and Stripe (cards)
- **Crypto checkout** - Sui wallet and outPay via Mysten Payment Kit
- **On-chain settlement** - Operator treasury releases tokens; Payment Kit enforces nonce uniqueness
- **Receipts** - `SuiOutKitReceipt` on Sui + structured invoice blobs on Walrus
- **Treasury gating** - Charges blocked when the vault cannot cover the FX-derived settlement amount

## How it works

![SOK flow diagram](/docs/assets/sok-how_it_works_flow.svg)

Flow in short: merchant calls the SDK to create a session; the backend orchestrates the charge with a provider, records state in Redis, uploads receipts to Walrus, and finally executes an on-chain settlement PTB which mints a receipt and transfers funds to the merchant.

## Helpers & key files

Quick links to common helpers and implementation entry points used by integrators and contributors:

- SDK
       - [sdk/src/index.ts](sdk/src/index.ts) - package entry and `SuiOutKit` class
       - [sdk/src/config/api.ts](sdk/src/config/api.ts) - API origin and path helpers
       - [sdk/src/utils/http.ts](sdk/src/utils/http.ts) - `request` helper (timeout, retries)
       - [sdk/src/utils/format.ts](sdk/src/utils/format.ts) - `formatNgn`, `formatToken`, `toTokenUnits`
       - [sdk/src/hooks/usePaymentStatus.ts](sdk/src/hooks/usePaymentStatus.ts) - SSE/react helper
- Backend
       - [backend/src/index.ts](backend/src/index.ts) - HTTP entry (Express app)
       - [backend/src/routes/checkout.ts](backend/src/routes/checkout.ts) - session, charge, webhook handlers
       - [backend/src/routes/payments.ts](backend/src/routes/payments.ts) - SSE payment stream
       - [backend/src/services/sui.ts](backend/src/services/sui.ts) - on-chain interaction and settlement helpers
       - [backend/src/services/walrus.ts](backend/src/services/walrus.ts) - invoice upload helper
       - [backend/src/services/redis.ts](backend/src/services/redis.ts) - session store and locks
- Contracts
       - [contracts/suioutkit/sources/checkout.move](contracts/suioutkit/sources/checkout.move) - settlement logic
       - [contracts/suioutkit/sources/treasury.move](contracts/suioutkit/sources/treasury.move) - treasury management

Use these files as the first stop when implementing or debugging flows; they map directly to the routes and helpers the SDK expects.

For step-by-step API and environment details, see the **[docs](docs/README.md)**.

## Quick start

### Merchants (production)

```bash
npm install suioutkit
```

```ts
import { SuiOutKit } from "suioutkit";

const sdk = new SuiOutKit({ merchantAddress: "0xYOUR_MERCHANT_SUI_ADDRESS" });
const session = await sdk.initCheckout({ amount: 45000, currency: "NGN" });
sdk.openModal(session);
```

Hosted API: **https://api.suioutkit.xyz** · routes: **`/v1/checkout/*`** · [Hosted API](docs/hosted-api.md)

### Contributors (local stack)

**Prerequisites:** Node 18+, Docker Compose, optional `sui` CLI for Move tests.

```bash
cp backend/.env.example backend/.env
# Fill provider keys, contract IDs, operator keys
docker compose up --build
```

SDK override: `backendUrl: "http://localhost:5000"` (same `/v1/*` paths).

### Demo

With the stack running, open [`demo/demo.html`](demo/demo.html). Health: `http://localhost:5000/health`

An extended flow is in [`demo/demo-e2e.html`](demo/demo-e2e.html).

Full SDK reference: **[sdk/README.md](sdk/README.md)**.

## Repository layout

```text
suioutkit/
├── backend/           # Express + TypeScript API
├── sdk/               # Browser SDK (npm: suioutkit)
├── contracts/suioutkit/  # Move package
├── demo/              # HTML integration examples
├── docs/              # Developer guide and docs index
└── .github/workflows/ # CI (build + Move tests)
```



## Documentation

| Document | Description |
|----------|-------------|
| [Documentation](docs/README.md) | All docs (single source in `docs/`) |
| [Project website](website/) | Renders `docs/` at `/docs/*` (`cd website && npm run dev`) |
| [Hosted API](docs/hosted-api.md) | `api.suioutkit.xyz`, `/v1` routes, deploy checklist |
| [Developer Guide](docs/developer-guide.md) | Contributors: architecture, env vars, CI |
| [SDK README](sdk/README.md) | Merchant integration, API reference, custom UI |

### Source map (for contributors)

| Topic | Location |
|-------|----------|
| HTTP entry | [`backend/src/index.ts`](backend/src/index.ts) |
| Checkout routes | [`backend/src/routes/checkout.ts`](backend/src/routes/checkout.ts) |
| Sui settlement | [`backend/src/services/sui.ts`](backend/src/services/sui.ts) |
| Move settlement | [`contracts/suioutkit/sources/checkout.move`](contracts/suioutkit/sources/checkout.move) |
| SDK entry | [`sdk/src/index.ts`](sdk/src/index.ts) |
| Checkout modal | [`sdk/src/components/modal.ts`](sdk/src/components/modal.ts) |

## Testing and CI

- **TypeScript** - `npm run build` in `backend/` and `sdk/` (no separate test suite by default).
- **Move** - `sui move test` in `contracts/suioutkit/`.
- **CI** - [`.github/workflows/ci.yml`](.github/workflows/ci.yml) builds both packages and runs Move tests when `sui` is on the runner.

## Security

High-level security guidance is summarized here; see the linked documents for full operator and reporting procedures:

- [SECURITY.md](SECURITY.md) — how to report vulnerabilities and the preferred private contact.
- [docs/guides/security.md](/docs/guides/security.md) — production security practices and operator hardening checklist.

## Contributing

1. Fork and branch from `main`.
2. Keep changes focused; run `npm run build` in affected packages.
3. Update docs when behavior or public API changes.
4. Open a PR with a clear description and green CI.

## Authors

- [@The3rdWebLabs](https://github.com/the3rdweblabs)
- [@CYBWithFlourish](https://github.com/CYBWithFlourish/)

## License

[GPL-3.0](LICENSE)
