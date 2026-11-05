# Cloudflare Pages staging

This branch is the rollback-based Neon staging build. Cloudflare Pages serves the static frontend from `dist/public`; the PostgreSQL-backed Express API remains a separate migration step until an edge-compatible Pages Functions adapter is deployed. No production domain or Manus deployment is changed by this branch.

The Pages build command is `pnpm build:static`; Cloudflare installs dependencies before running it.
