import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.log("Database migration skipped: DATABASE_URL is not configured.");
  process.exit(0);
}

const schemaUrl = new URL("../db/schema.sql", import.meta.url);
const schema = await readFile(fileURLToPath(schemaUrl), "utf8");
const hostname = new URL(databaseUrl).hostname;
const local = hostname === "127.0.0.1" || hostname === "localhost";
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: local ? false : "require", connect_timeout: 12 });

try {
  await sql.unsafe(schema);
  console.log("WIVA database schema is ready.");
} catch (error) {
  console.error("WIVA database migration failed:", error instanceof Error ? error.message : "unknown database error");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
