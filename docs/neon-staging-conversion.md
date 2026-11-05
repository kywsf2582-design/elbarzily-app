# Neon staging PostgreSQL conversion

Date: 2026-11-05

This rollback worktree is based on commit `1f97631e72f40fd9503a2439f2c5f01418facae6` and was converted for the isolated Neon staging branch only. Production Manus/MySQL was not changed.

## Completed conversion

- `server/db.ts` uses `drizzle-orm/node-postgres` and `pg.Pool`.
- Runtime imports use `drizzle/schema.pg.ts`.
- Auth user upsert uses PostgreSQL `onConflictDoUpdate` on `users.openId`.
- OTP creation uses `returning({ id: authOtps.id })`; failed email delivery cleans up the returned OTP row.
- Booking creation and booking chat-room creation use PostgreSQL `returning()`.
- Remaining generated-ID inserts in booking, chat, reports, subscriptions, uploads, rewards, pitches, plans, and Smart Stats were converted to `returning()`.
- Booking update checks use PostgreSQL `returning()` rows instead of MySQL `affectedRows`.
- MySQL schema imports, MySQL `alias`, `onDuplicateKeyUpdate`, and `insertId` references were removed from application runtime code.
- Added `pg` and `@types/pg`.

## Neon Staging data

- Project: `brzly-staging` (`frosty-rice-15874793`)
- Branch: `cloudflare-staging` (`br-sparkling-night-b41h7gd1`)
- Generated and applied the PostgreSQL schema: 50 application tables and 34 enum types.
- Converted and imported the authorized `managed-live-2026-10-31.sql` snapshot into this branch.
- Verified counts: 6 users, 7 OTP rows, 1 pitch, 2 pitch fields, 3 schedules, 1 booking, 7 chat rooms, 7 chat messages, and 16 notifications.

## Validation

- `pnpm install`: PASS.
- `pnpm exec tsc --noEmit`: PASS.
- `pnpm test`: PASS, 15 files and 70 tests.
- `pnpm build`: PASS; Vite, admin dashboard, and server bundle built.
- Local production server using Neon Staging: PASS.
- `GET /api/health`: HTTP 200 with `{"status":"ok"}`.
- `GET /api/platform/config.js`: HTTP 200.
- `dist/public/manus-routes.json`: valid, 26 routes.

## Remaining external-runtime work

The PostgreSQL-backed Express server works locally against Neon Staging. Cloudflare Pages currently serves the static frontend; the Express API still needs an edge-compatible Cloudflare Workers/Pages Functions adapter before the API can be declared live on Cloudflare. Do not claim the external deployment is complete until the API adapter is deployed and the Auth/OTP/booking smoke tests pass through the public staging URL.

SMTP delivery was not triggered as part of automated validation; the SMTP secrets remain runtime-only and were not committed.
