import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { signToken } from "../utils/auth.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !email || password.length < 6) {
    return res.status(400).json({ message: "Name, email, and password (min 6 chars) are required." });
  }
  const exists = await pool.query("select id from users where email = $1", [email]);
  if (exists.rows[0]) return res.status(400).json({ message: "Email already registered." });

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "insert into users (name, email, password_hash, role, approved, is_active) values ($1, $2, $3, 'bidder', false, true)",
    [name, email, hash]
  );
  res.status(201).json({ message: "Registration successful. Wait for admin approval before login." });
});

router.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const result = await pool.query("select * from users where email = $1", [email]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ message: "Invalid email or password." });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid email or password." });

  if (user.role === "bidder" && !user.approved) {
    return res.status(403).json({ message: "Your account is not approved yet." });
  }
  if (!user.is_active) {
    return res.status(403).json({ message: "Your account is deactivated." });
  }

  res.json({ token: signToken(user.id) });
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
