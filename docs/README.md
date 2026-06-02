# SuiOutKit documentation

Welcome to the SuiOutKit documentation. This folder is the canonical source rendered by the [project website](/website/) at `/docs/*`.

Use these guides to integrate the SDK, run a local development stack, or operate a self-hosted deployment.

## Getting started (merchants)

| Doc | Description |
|-----|-------------|
| [Installation](./getting-started/installation.md) | Install the SDK — no backend required for merchants |
| [Quick Start](./getting-started/quick-start.md) | Create a checkout in minutes |
| [How It Works](./getting-started/how-it-works.md) | Checkout flow from the SDK’s perspective |

## Guides

| Doc | Description |
|-----|-------------|
| [Architecture](./guides/architecture.md) | How the SDK fits the hosted platform |
| [SDK Reference](./guides/sdk.md) | `SuiOutKit` API summary (see also [SDK README](/sdk/README.md)) |
| [Backend API](./guides/backend-api.md) | Routes the SDK calls internally |
| [Environment](./guides/environment.md) | Operator env vars (not required for merchants) |
| [Security](./guides/security.md) | Production practices |

## Reference

| Doc | Description |
|-----|-------------|
| [Hosted API](./hosted-api.md) | `api.suioutkit.xyz`, `/v1` routes, deploy checklist |
| [Developer Guide](./developer-guide.md) | Deep dive for contributors and operators |

## Also

| Doc | Description |
|-----|-------------|
| [Root README](/README.md) | Repo overview |
| [SDK README](/sdk/README.md) | npm package reference |

## Website local preview

```bash
cd website
npm install
npm run dev
```

Changes under `docs/` reload on the site after save.

## Contributing

Suggestions, fixes, and clarifications are welcome. Edit the appropriate file under `docs/` and open a pull request; the website will pick up changes from this folder.
