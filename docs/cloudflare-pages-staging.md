# Cloudflare Pages Staging

This project deploys only to the existing Cloudflare Pages project `elbarzily-neon-staging` and its stable Staging branch `rollback-neon-staging`. The stable URL is `https://elbarzily-neon-staging.pages.dev/`. Do not target a separate Production project, custom production domain, or the Pages preview branch named `staging`.

The React/Vite frontend is built into `dist/public` with `pnpm build:static`. When deploying from the project root, Cloudflare Pages also packages the existing `functions/` directory:

- `functions/api/[[path]].ts` forwards `/api/*` requests to the existing `elbarzily-api-staging` Worker.
- `functions/manus-storage/[[path]].ts` forwards file reads through that Worker so the Worker can validate the Staging app session and authorize private Storage objects.

The Staging API remains the existing Cloudflare Worker, backed by the current Neon Hyperdrive binding. Do not change its Hyperdrive ID, Worker name, Pages project, public route, or provider settings as part of a normal deploy. The safe deployment shape is `pnpm exec wrangler deploy` for the configured Staging Worker, followed by `pnpm exec wrangler pages deploy dist/public --project-name elbarzily-neon-staging --branch rollback-neon-staging` from the project root after all required checks pass.

This build uses the existing Cloudflare/Supabase secrets through their saved Staging bindings; no secret belongs in source, build artifacts, or Git. The Staging branch may be labelled as the Pages project's production branch in the Cloudflare UI; that label refers only to the separate Pages project named `elbarzily-neon-staging`, not to the application's Production environment.
