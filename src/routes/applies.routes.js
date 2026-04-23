import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireBidder } from "../middleware/auth.js";
import { normalizeUrl } from "../utils/url.js";

const router = Router();

router.post("/check-duplicate", requireAuth, async (req, res) => {
  const profileId = req.body.profile_id || req.body.profileId;
  const normalized = normalizeUrl(req.body.job_site_url || req.body.jobSiteUrl);
  const result = await pool.query("select id from applies where profile_id = $1 and normalized_url = $2", [profileId, normalized]);
  if (result.rows[0]) return res.status(409).json({ message: "This job link was already applied before for this profile." });
  res.json({ ok: true });
});

router.post("/", requireAuth, async (req, res) => {
  const { profile_id, company_name, job_title, job_site_url } = req.body;
  const normalized = normalizeUrl(job_site_url);

  if (req.user.role === "bidder") {
    const allowed = await pool.query("select id from profiles where id = $1 and assigned_user_id = $2", [profile_id, req.user.id]);
    if (!allowed.rows[0]) return res.status(403).json({ message: "Profile not assigned to you." });
  }

  const exists = await pool.query("select id from applies where profile_id = $1 and normalized_url = $2", [profile_id, normalized]);
  if (exists.rows[0]) return res.status(409).json({ message: "This job link was already applied before for this profile." });

  const result = await pool.query(`
    insert into applies (profile_id, company_name, job_title, job_site_url, normalized_url)
    values ($1, $2, $3, $4, $5)
    returning *
  `, [profile_id, company_name, job_title, normalized, normalized]);
  res.status(201).json({ apply: result.rows[0] });
});

router.put("/:id", requireAuth, async (req, res) => {
  const row = await pool.query("select * from applies where id = $1", [req.params.id]);
  const apply = row.rows[0];
  if (!apply) return res.status(404).json({ message: "Apply not found." });

  if (req.user.role === "bidder") {
    const allowed = await pool.query("select id from profiles where id = $1 and assigned_user_id = $2", [apply.profile_id, req.user.id]);
    if (!allowed.rows[0]) return res.status(403).json({ message: "Profile not assigned to you." });
  }

  const normalized = normalizeUrl(req.body.job_site_url);
  const result = await pool.query(`
    update applies
    set company_name = $1, job_title = $2, job_site_url = $3, normalized_url = $4
    where id = $5
    returning *
  `, [req.body.company_name, req.body.job_title, normalized, normalized, req.params.id]);
  res.json({ apply: result.rows[0] });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const row = await pool.query("select * from applies where id = $1", [req.params.id]);
  const apply = row.rows[0];
  if (!apply) return res.status(404).json({ message: "Apply not found." });

  if (req.user.role === "bidder") {
    const allowed = await pool.query("select id from profiles where id = $1 and assigned_user_id = $2", [apply.profile_id, req.user.id]);
    if (!allowed.rows[0]) return res.status(403).json({ message: "Profile not assigned to you." });
  }

  await pool.query("delete from applies where id = $1", [req.params.id]);
  res.json({ ok: true });
});

router.get("/profile/:profileId", requireAuth, async (req, res) => {
  const { profileId } = req.params;
  const q = `%${String(req.query.q || "").trim()}%`;

  if (req.user.role === "bidder") {
    const allowed = await pool.query("select id from profiles where id = $1 and assigned_user_id = $2", [profileId, req.user.id]);
    if (!allowed.rows[0]) return res.status(403).json({ message: "Profile not assigned to you." });
  }

  const profile = await pool.query("select * from profiles where id = $1", [profileId]);
  const applies = await pool.query(`
    select * from applies
    where profile_id = $1
      and ($2 = '%%' or company_name ilike $2 or job_title ilike $2 or job_site_url ilike $2)
    order by created_at desc
  `, [profileId, q]);

  const stats = await pool.query(`
    select
      count(*)::int as total,
      count(case when created_at >= date_trunc('day', now()) then 1 end)::int as today
    from applies
    where profile_id = $1
  `, [profileId]);

  res.json({
    profile: profile.rows[0],
    applies: applies.rows,
    stats: stats.rows[0]
  });
});

export default router;
