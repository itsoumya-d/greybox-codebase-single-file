# Greybox Brand

Proprietary brand source for Greybox Studio.

Run:

```bash
pnpm install
pnpm build
```

The build emits CSS, Tailwind, Figma, Unity, and Unreal token targets plus
deterministic logo raster assets.

Brand clearance and ownership execution packets:

- `BRAND_SPRINT.md` - week-one trademark, domain, and GitHub organization sprint.
- `docs/brand/naming-memo.md` - canonical naming decision and fallback order.
- `docs/brand/trademark-filing-packet.md` - counsel-facing filing packet.
- `docs/brand/domain-github-readiness.md` - registrar and GitHub org checklist.

Distribution packets live in `docs/distribution/` and are validated by:

```bash
pnpm validate:distribution
```
