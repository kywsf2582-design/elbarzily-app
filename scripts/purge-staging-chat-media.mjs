import { Client } from "pg";

const bucket = process.env.SUPABASE_STORAGE_BUCKET || "elbarzily-staging-uploads";
const dbUrl = process.env.ELBARZILY_STAGING_DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const storageKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedStagingDbHost = "ep-nameless-river-b48jp20a-pooler.c-6.us-east-2.aws.neon.tech";
const expectedStagingSupabaseHost = "uxrvwvhgzftgpkndhlkh.supabase.co";

if (!process.argv.includes("--confirm-staging")) {
  console.error("Refusing to run without --confirm-staging.");
  process.exit(2);
}
if (!dbUrl || !supabaseUrl || !storageKey || bucket !== "elbarzily-staging-uploads") {
  console.error("Missing Staging-only database/storage configuration; no files were changed.");
  process.exit(2);
}
try {
  if (new URL(dbUrl).hostname !== expectedStagingDbHost || new URL(supabaseUrl).hostname !== expectedStagingSupabaseHost) throw new Error("Unexpected Staging database or Supabase host");
} catch {
  console.error("Refusing cleanup: database or Supabase URL does not match the verified Staging hosts.");
  process.exit(2);
}

function isLegacyJwt(key) {
  if (key.startsWith("sb_secret_") || key.startsWith("sb_publishable_")) return false;
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some(part => !part || !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const encoded = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const header = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return header?.alg === "HS256" && (header?.typ === undefined || String(header.typ).toUpperCase() === "JWT");
  } catch {
    return false;
  }
}

const baseUrl = supabaseUrl.replace(/\/+$/, "");
const headers = { apikey: storageKey, "content-type": "application/json" };
if (isLegacyJwt(storageKey)) headers.Authorization = `Bearer ${storageKey}`;
const db = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 15_000, application_name: "elbarzily-staging-chat-media-cleanup" });

try {
  await db.connect();
  const supportRows = await db.query(`
    SELECT DISTINCT regexp_replace("mediaUrl", '^/manus-storage/', '') AS key
    FROM "chat_messages" AS m
    JOIN "chat_rooms" AS r ON r."id" = m."roomId"
    WHERE r."roomType" = 'support' AND m."mediaUrl" IS NOT NULL
  `);
  const keep = new Set(supportRows.rows.map(row => row.key));
  const assetRows = await db.query(`
    SELECT DISTINCT candidate AS key FROM (
      SELECT "key" AS candidate FROM "uploaded_assets"
      WHERE "key" LIKE 'chat-media/%' OR "key" LIKE 'chat-voice/%'
      UNION
      SELECT regexp_replace(m."mediaUrl", '^/manus-storage/', '') AS candidate
      FROM "chat_messages" AS m
      JOIN "chat_rooms" AS r ON r."id" = m."roomId"
      WHERE r."roomType" IS DISTINCT FROM 'support' AND m."mediaUrl" IS NOT NULL
      UNION
      SELECT regexp_replace("mediaUrl", '^/manus-storage/', '') AS candidate
      FROM "admin_chat_messages" WHERE "mediaUrl" IS NOT NULL
    ) AS old_chat_assets
    WHERE candidate IS NOT NULL AND candidate <> ''
  `);
  const candidates = assetRows.rows.map(row => row.key).filter(key => key && !key.startsWith("http:") && !key.startsWith("https:") && !keep.has(key));

  let deletedObjects = 0;
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ prefixes: candidates.slice(offset, offset + 100) }),
    });
    if (!response.ok) {
      throw new Error(`Storage deletion stopped with HTTP ${response.status}; database records were not changed.`);
    }
    deletedObjects += Math.min(100, candidates.length - offset);
  }

  if (candidates.length) {
    await db.query("BEGIN");
    try {
      await db.query(`DELETE FROM "uploaded_assets" WHERE "key" = ANY($1::text[])`, [candidates]);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }
  console.log(`Removed ${deletedObjects} non-support chat media objects from the configured Staging bucket; support media was preserved.`);
} catch (error) {
  console.error(`Staging chat-media cleanup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
}
