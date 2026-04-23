import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { readToken } from "../utils/auth.js";

export async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ message: "Missing auth token." });
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    const result = await pool.query(
      "select id, name, email, role, approved, is_active, created_at from users where id = $1",
      [payload.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: "Invalid user." });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized." });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required." });
  next();
}

export function requireBidder(req, res, next) {
  if (req.user.role !== "bidder") return res.status(403).json({ message: "Bidder access required." });
  if (!req.user.approved) return res.status(403).json({ message: "Your account is not approved yet." });
  if (!req.user.is_active) return res.status(403).json({ message: "Your account is deactivated." });
  next();
}
