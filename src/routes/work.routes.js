import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireBidder } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireBidder);

router.post("/start", async (req, res) => {
  const active = await pool.query("select id from work_sessions where user_id = $1 and end_time is null", [req.user.id]);
  if (active.rows[0]) return res.status(400).json({ message: "You already have an active work session." });
  const result = await pool.query("insert into work_sessions (user_id, start_time) values ($1, now()) returning *", [req.user.id]);
  res.status(201).json({ session: result.rows[0] });
});

router.post("/stop", async (req, res) => {
  const active = await pool.query(`
    select * from work_sessions
    where user_id = $1 and end_time is null
    order by start_time desc
    limit 1
  `, [req.user.id]);
  const session = active.rows[0];
  if (!session) return res.status(400).json({ message: "No active work session found." });

  const result = await pool.query(`
    update work_sessions
    set end_time = now(),
        duration_seconds = greatest(0, floor(extract(epoch from (now() - start_time)))::int)
    where id = $1
    returning *
  `, [session.id]);

  res.json({ session: result.rows[0] });
});

export default router;
