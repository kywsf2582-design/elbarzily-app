# Cloudflare + Neon Staging Migration

## Scope

This branch is an isolated staging experiment. Production `main`, the Manus deployment, and the live MySQL database must remain unchanged until all acceptance checks pass.

## Current compatibility findings

- The application currently uses `drizzle-orm/mysql2`, `mysql2`, and Drizzle `dialect: "mysql"`.
- The server currently boots Express through Node's HTTP server and is packaged with a Node 22 Dockerfile.
- The application includes authentication, OTP email, chat, SSE realtime, Web Push, file storage, downloads, admin routes, and database-backed sessions/data.
- Neon is PostgreSQL, so this requires a deliberate MySQL-to-PostgreSQL schema and migration conversion; changing only `DATABASE_URL` is unsafe.
- Cloudflare Workers/Pages cannot consume the existing Docker deployment unchanged. The server boundary must be adapted and each Node-only dependency must be tested.

## Safe order

1. Authorize Neon and Cloudflare accounts through their official dashboards; do not commit tokens or place them in GitHub.
2. Create a separate Neon staging project and import a sanitized or copied database snapshot; keep production MySQL untouched.
3. Convert Drizzle schema, dialect, migrations, date/enum/JSON/decimal behavior, indexes, and upsert semantics for PostgreSQL.
4. Add a Cloudflare-compatible server entrypoint and bindings for the staging environment. Preserve the existing Node/Manus entrypoint until parity is proven.
5. Configure GitHub Actions or Cloudflare Git integration for the staging branch only.
6. Run TypeScript, tests, build, health, route-manifest, auth/OTP, booking, chat, realtime, Push, media, admin, downloads, and database smoke tests.
7. Compare staging data counts and key integrity against the source database without writing to production.
8. Only after explicit review, consider a production cutover with rollback assets ready.

## Known free-plan constraints

Free tiers are usage-limited and can suspend or throttle workloads. The migration must not promise lifetime availability or zero downtime. Neon Free and Cloudflare Workers/Pages Free limits must be monitored before any production decision.

## Not allowed on this branch

- No production `DATABASE_URL` in GitHub Actions, Cloudflare, or source files.
- No P12 files, signing passwords, runtime secrets, SQL dump, or private backup in Git.
- No destructive overwrite of the current Manus/MySQL database.
- No switch of the production domain or APK/Windows download URLs.

## Current staging resources

- GitHub repository: `kywsf2582-design/elbarzily-app`
- GitHub staging branch: `cloudflare-migration`
- Cloudflare Pages staging project: `elbarzily-staging`
- Neon staging project: `brzly-staging`
- Neon staging branch: `cloudflare-staging`

These identifiers are not credentials. Production remains unchanged.
