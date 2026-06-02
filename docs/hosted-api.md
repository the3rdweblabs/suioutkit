---
title: Hosted API
description: api.suioutkit.xyz, v1 routes, deploy checklist, and merchant vs operator roles.
---

SuiOutKit is offered as **SDK + hosted backend**. Merchants integrate with `npm install suioutkit`; settlement runs on infrastructure operated by SuiOutKit, not on each merchant’s server.

## API base URL

| Environment | Origin | Notes |
|-------------|--------|--------|
| **Production** | `https://api.suioutkit.xyz` | Default in the SDK |
| **Staging** (future) | `https://staging.api.suioutkit.xyz` | Override via `backendUrl` |
| **Local** (contributors) | `http://localhost:5000` | `backendUrl` override when running Docker / `npm start` |

All checkout and payment routes are versioned under **`/v1/`**.

Example:

```http
POST https://api.suioutkit.xyz/v1/checkout/session
```

Unversioned paths on the same host (not under `/v1/`):

| Path | Purpose |
|------|---------|
| `GET /health` | Load balancer / ops health check |
| `GET /style.css` | Modal stylesheet (served by API host today) |
| `GET /assets/*` | Payment method icons |
| `GET /sdk/dist/*` | Optional: SDK bundle for HTML demos |

## v1 route map

### Checkout (SDK)

| Method | Path |
|--------|------|
| `POST` | `/v1/checkout/session` |
| `POST` | `/v1/checkout/charge` |
| `GET` | `/v1/checkout/status/:nonce` |
| `GET` | `/v1/checkout/validate/:nonce` |
| `POST` | `/v1/checkout/crypto/intent` |
| `POST` | `/v1/checkout/crypto/confirm` |

### Payments (SDK - SSE)

| Method | Path |
|--------|------|
| `GET` | `/v1/payments/stream/:nonce` |

### Webhooks (providers → SuiOutKit only)

| Method | Path |
|--------|------|
| `POST` | `/v1/checkout/webhook` |
| `POST` | `/v1/checkout/stripe-webhook` |

Configure Flutterwave and Stripe dashboards to these URLs on the **production** host.

## Merchant integration (no codebase required)

```bash
npm install suioutkit
```

```ts
import { SuiOutKit } from "suioutkit";

const sdk = new SuiOutKit({
  merchantAddress: "0xYOUR_MERCHANT_SUI_ADDRESS",
});

const session = await sdk.initCheckout({
  amount: 45000,
  currency: "NGN",
});

sdk.openModal(session);
```

Merchants do **not** need to clone this repo, run Docker, or manage `backend/.env`.

## Implementation notes

- SDK default origin: [`https://api.suioutkit.xyz`](https://api.suioutkit.xyz) - this is the default API host configured in the published SDK for merchants.
- API routes are versioned under `/v1/`. Clients and the SDK should use `/v1/*` for checkout and payment routes.
- The backend mounts routers at `/v1/checkout` and `/v1/payments`. See [`sdk/src/config/api.ts`](/sdk/src/config/api.ts) for the shared path helper.

## Operator deployment checklist

- DNS: point `api.suioutkit.xyz` to your load balancer/ingress
- Obtain and deploy a TLS certificate for the API hostname
- Run the backend and Redis with production-grade secret management (vaults, K8s/Docker secrets)
- Configure and fund the treasury; set contract IDs and operator keys in the environment
- Configure provider webhooks to point to the production host:
  - Flutterwave: `https://api.suioutkit.xyz/v1/checkout/webhook`
  - Stripe: `https://api.suioutkit.xyz/v1/checkout/stripe-webhook`
- Perform a smoke test:

```bash
curl -sS https://api.suioutkit.xyz/health
```

### Self-hosting (operators only)

This repository can be self-hosted by operators. The monorepo backend is intended for operator-managed deployments (not required for merchants using the hosted API).

Quick start (development / testing):

```bash
docker compose up --build
```

## Versioning note

All checkout and payment routes are versioned under `/v1/`. The SDK defaults to `/v1/*`; clients should use the versioned paths. Legacy unversioned paths (for example `/api/checkout/*`) are not supported for merchant integrations and should not be relied upon.

---
