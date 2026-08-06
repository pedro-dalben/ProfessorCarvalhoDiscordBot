import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema.js";

/* eslint-disable no-console */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrações aplicadas com sucesso.");
  await pool.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar migrações:", error);
  process.exit(1);
});
