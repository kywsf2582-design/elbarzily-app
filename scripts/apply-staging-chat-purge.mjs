import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedStagingDbHost = "ep-nameless-river-b48jp20a-pooler.c-6.us-east-2.aws.neon.tech";
const baseTag = "0000_cold_meggan";
const purgeTag = "0001_purge_non_support_chat_staging";

if (!process.argv.includes("--confirm-staging")) {
  console.error("Refusing to purge chat data without --confirm-staging.");
  process.exit(2);
}

const connectionString = process.env.ELBARZILY_STAGING_DATABASE_URL;
if (!connectionString) {
  console.error("ELBARZILY_STAGING_DATABASE_URL is not available; no database was changed.");
  process.exit(2);
}

let databaseUrl;
try {
  databaseUrl = new URL(connectionString);
} catch {
  console.error("Refusing purge: the configured Staging database URL is invalid.");
  process.exit(2);
}
if (databaseUrl.hostname !== expectedStagingDbHost) {
  console.error("Refusing purge: database host does not match the verified Staging Neon host.");
  process.exit(2);
}

const journal = JSON.parse(await readFile(path.join(projectRoot, "drizzle/pg-migrations/meta/_journal.json"), "utf8"));
const baseEntry = journal.entries.find(entry => entry.tag === baseTag);
const purgeEntry = journal.entries.find(entry => entry.tag === purgeTag);
if (!baseEntry || !purgeEntry || journal.entries.some(entry => ![baseTag, purgeTag].includes(entry.tag))) {
  console.error("Refusing purge: PostgreSQL migration journal differs from the reviewed Staging-only set.");
  process.exit(2);
}

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 15_000,
  application_name: "elbarzily-staging-chat-purge-preflight",
});
try {
  await client.connect();
  const result = await client.query('SELECT "created_at" FROM "drizzle"."__drizzle_migrations" ORDER BY "created_at"');
  const appliedTimes = result.rows.map(row => Number(row.created_at));
  if (!appliedTimes.includes(Number(baseEntry.when))) {
    console.error("Refusing purge: the reviewed base migration is not recorded in this database.");
    process.exitCode = 2;
  } else if (appliedTimes.includes(Number(purgeEntry.when))) {
    console.log("The Staging-only chat cleanup migration is already applied; nothing was changed.");
  } else if (appliedTimes.some(when => ![Number(baseEntry.when), Number(purgeEntry.when)].includes(when))) {
    console.error("Refusing purge: the database migration history contains an unreviewed entry.");
    process.exitCode = 2;
  } else {
    await client.end();
    const mediaCleanup = spawnSync(process.execPath, [path.join(projectRoot, "scripts/purge-staging-chat-media.mjs"), "--confirm-staging"], {
      cwd: projectRoot,
      env: { ...process.env, ELBARZILY_STAGING_DATABASE_URL: connectionString },
      stdio: "inherit",
    });
    if (mediaCleanup.error) throw mediaCleanup.error;
    if (mediaCleanup.status !== 0) {
      process.exitCode = mediaCleanup.status || 1;
    } else {
      const result = spawnSync("pnpm", ["exec", "drizzle-kit", "migrate", "--config=drizzle.pg.config.ts"], {
        cwd: projectRoot,
        env: { ...process.env, DATABASE_URL: connectionString },
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exitCode = result.status || 1;
    }
  }
} catch (error) {
  console.error(`Staging chat cleanup preflight failed; no cleanup was started: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
