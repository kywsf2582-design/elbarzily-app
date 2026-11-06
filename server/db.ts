import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { InsertUser, users } from "../drizzle/schema.pg";
import * as schema from "../drizzle/schema.pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { ENV } from "./_core/env";

let _pool: Pool | null = null;
type Database = NodePgDatabase<typeof schema>;
let _db: Database | null = null;

type WorkerDatabaseScope = {
  connectionString: string;
  client?: Client;
  db?: Database;
  failed?: boolean;
};

const workerDatabaseScope = new AsyncLocalStorage<WorkerDatabaseScope>();

/**
 * Run one Worker request with a request-scoped pg Client. Hyperdrive owns the
 * reusable remote pool; pg clients must not be kept alive across Worker requests.
 */
export async function withWorkerDatabase<T>(
  connectionString: string,
  callback: () => Promise<T>,
): Promise<T> {
  const scope: WorkerDatabaseScope = { connectionString };
  return workerDatabaseScope.run(scope, async () => {
    try {
      return await callback();
    } finally {
      if (scope.client) {
        await scope.client.end().catch(() => undefined);
      }
    }
  });
}

export async function getDb(): Promise<Database | null> {
  const workerScope = workerDatabaseScope.getStore();
  if (workerScope) {
    if (workerScope.failed || !workerScope.connectionString) return null;
    if (!workerScope.db) {
      const client = new Client({ connectionString: workerScope.connectionString });
      workerScope.client = client;
      try {
        await client.connect();
        workerScope.db = drizzle(client, { schema });
      } catch (error) {
        workerScope.failed = true;
        workerScope.client = undefined;
        await client.end().catch(() => undefined);
        console.warn("[Database] Worker request connection failed:", error instanceof Error ? error.message : "unknown error");
        return null;
      }
    }
    return workerScope.db;
  }

  // Existing long-lived Node deployment path.
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(_pool, { schema });
    } catch (error) {
      console.warn("[Database] Failed to initialize pool:", error instanceof Error ? error.message : "unknown error");
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  // OAuth sync never changes an already assigned application role. The legacy owner
  // allow-list is retained only for backwards compatibility and is not client-controlled.
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
