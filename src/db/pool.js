import pg from "pg";
const { Pool } = pg;

const isSslRequired = /supabase|render|railway|neon/i.test(process.env.DATABASE_URL || "");
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSslRequired ? { rejectUnauthorized: false } : false
});
