import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { pool } from "./db/pool.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import bidderRoutes from "./routes/bidder.routes.js";
import appliesRoutes from "./routes/applies.routes.js";
import workRoutes from "./routes/work.routes.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const CLIENT_URL = process.env.CLIENT_URL || "http://127.0.0.1:5173";

app.use(cors({
  origin(origin, callback) {
    const allowed = [CLIENT_URL, "http://127.0.0.1:5173", "http://localhost:5173"];
    if (!origin || allowed.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json());

async function ensureAdminUser() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!email || !password) return;

  const existing = await pool.query("select id from users where email = $1", [email]);
  if (existing.rows[0]) return;

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "insert into users (name, email, password_hash, role, approved, is_active) values ($1, $2, $3, 'admin', true, true)",
    ["Admin", email, hash]
  );
  console.log(`Admin created: ${email}`);
}

app.get("/api/health", async (_req, res) => {
  const db = await pool.query("select now()");
  res.json({ ok: true, db_time: db.rows[0].now });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bidder", bidderRoutes);
app.use("/api/applies", appliesRoutes);
app.use("/api/work", workRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error." });
});

async function start() {
  await pool.query("select 1");
  await ensureAdminUser();
  app.listen(PORT, () => {
    console.log(`API listening on http://127.0.0.1:${PORT}`);
  });
}

start().catch((err) => {
  console.error("STARTUP ERROR:", err);
  process.exit(1);
});
