# Website assets

Place downloadable brand files here. UI icons (menu, theme, arrows) come from **lucide-react** in code — you do not need icon packs for those.

## Required / recommended downloads

| File | Save as | Source | Used for |
|------|---------|--------|----------|
| GitHub mark (SVG, light + dark) | `logos/github.svg` | [GitHub Logos](https://github.com/logos) → `github-mark.svg` or `github-mark-white.svg` | Header/footer social link (optional; lucide `Github` icon used by default) |
| Sui logo | `logos/sui.svg` | [Sui Brand](https://sui.io/brand) or Mysten press kit | Footer, “Built on Sui”, docs |
| npm logo | `logos/npm.svg` | [npm Docs – brand](https://docs.npmjs.com/policies/logos) | Install CTA / docs (optional; lucide `Package` used by default) |

## Payment rails (optional — homepage / docs)

Used if you add a “Supported methods” row with real brand marks (modal already uses backend `/assets` for checkout UI).

| File | Save as | Source |
|------|---------|--------|
| Flutterwave | `logos/flutterwave.svg` or `.png` | Flutterwave brand / press |
| Stripe | `logos/stripe.svg` | [Stripe Newsroom – brand assets](https://stripe.com/newsroom/brand-assets) |
| OPay | `logos/opay.png` | OPay brand guidelines |

## Project branding

| File | Save as | Notes |
|------|---------|--------|
| SuiOutKit wordmark | `logo.svg` | Primary header logo (replace placeholder `logo.svg` when ready) |
| Favicon | `../favicon.svg` | Already in `public/` — update to match wordmark |

## Folder layout

```text
public/assets/
├── README.md          ← this file
├── logo.svg           ← site wordmark (header)
└── logos/
    ├── github.svg
    ├── sui.svg
    ├── npm.svg
    ├── flutterwave.svg
    ├── stripe.svg
    └── opay.png
```

## License

Only use logos according to each brand’s trademark / brand guidelines. Do not modify payment marks beyond allowed clear space and sizing.
