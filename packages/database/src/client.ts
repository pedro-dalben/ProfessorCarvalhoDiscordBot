import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type DatabaseClient = NodePgDatabase<typeof schema>;

export interface DatabaseConnectionOptions {
  connectionString: string;
  poolMax: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
}

export interface DatabaseConnection {
  db: DatabaseClient;
  pool: Pool;
}

export function createDatabaseClient(options: DatabaseConnectionOptions): DatabaseConnection {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.poolMax,
    connectionTimeoutMillis: options.connectionTimeoutMs,
    statement_timeout: options.statementTimeoutMs,
    application_name: "professor-carvalho",
    ssl: options.connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
  });

  pool.on("error", (error) => {
    console.error("Erro inesperado no pool de conexão PostgreSQL:", error.message);
  });

  return { db: drizzle(pool, { schema }), pool };
}

export async function testDatabaseConnection(db: DatabaseClient): Promise<boolean> {
  try {
    await db.execute("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabaseConnection(pool: Pool): Promise<void> {
  await pool.end();
}

export { schema };
