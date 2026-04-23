import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/dashboard", async (_req, res) => {
  const cards = await pool.query(`
    select
      (select count(*)::int from applies) as total_applies,
      (select count(*)::int from applies where created_at >= date_trunc('day', now())) as applies_today,
      (select count(*)::int from interviews where due_date >= current_date and due_date < current_date + interval '7 days') as interviews_this_week,
      (select count(*)::int from users u where u.role = 'bidder' and exists (
        select 1 from work_sessions ws where ws.user_id = u.id and ws.end_time is null
      )) as online_bidders
  `);

  const profileStats = await pool.query(`
    select
      p.id as profile_id,
      p.name as profile_name,
      count(a.id)::int as total_applies,
      count(case when a.created_at >= date_trunc('day', now()) then 1 end)::int as today_applies
    from profiles p
    left join applies a on a.profile_id = p.id
    group by p.id, p.name
    order by p.name asc
  `);

  const bidders = await pool.query(`
    select
      u.id, u.name, u.email,
      exists (select 1 from work_sessions ws where ws.user_id = u.id and ws.end_time is null) as online
    from users u
    where u.role = 'bidder'
    order by u.name asc
  `);

  res.json({
    cards: cards.rows[0],
    profile_stats: profileStats.rows,
    bidders: bidders.rows
  });
});

router.get("/bidders", async (_req, res) => {
  const result = await pool.query(`
    select
      u.*,
      exists (select 1 from work_sessions ws where ws.user_id = u.id and ws.end_time is null) as online
    from users u
    where role = 'bidder'
    order by created_at desc
  `);
  res.json({ bidders: result.rows });
});

router.put("/bidders/:id/approval", async (req, res) => {
  const approved = Boolean(req.body.approved);
  const result = await pool.query("update users set approved = $1 where id = $2 returning *", [approved, req.params.id]);
  res.json({ bidder: result.rows[0] });
});

router.put("/bidders/:id/active", async (req, res) => {
  const isActive = Boolean(req.body.is_active);
  const result = await pool.query("update users set is_active = $1 where id = $2 returning *", [isActive, req.params.id]);
  res.json({ bidder: result.rows[0] });
});

router.get("/profiles", async (_req, res) => {
  const result = await pool.query(`
    select
      p.*,
      u.name as assigned_user_name
    from profiles p
    left join users u on u.id = p.assigned_user_id
    order by p.created_at desc
  `);
  res.json({ profiles: result.rows });
});

router.post("/profiles", async (req, res) => {
  const { name, email, linkedin_url, birthday, location, phone_number, assigned_user_id } = req.body;
  const result = await pool.query(`
    insert into profiles (name, email, linkedin_url, birthday, location, phone_number, assigned_user_id)
    values ($1, $2, $3, $4, $5, $6, $7)
    returning *
  `, [name, email || null, linkedin_url || null, birthday || null, location || null, phone_number || null, assigned_user_id || null]);
  res.status(201).json({ profile: result.rows[0] });
});

router.put("/profiles/:id", async (req, res) => {
  const { name, email, linkedin_url, birthday, location, phone_number, assigned_user_id } = req.body;
  const result = await pool.query(`
    update profiles
    set name = $1, email = $2, linkedin_url = $3, birthday = $4, location = $5, phone_number = $6, assigned_user_id = $7
    where id = $8
    returning *
  `, [name, email || null, linkedin_url || null, birthday || null, location || null, phone_number || null, assigned_user_id || null, req.params.id]);
  res.json({ profile: result.rows[0] });
});

router.delete("/profiles/:id", async (req, res) => {
  await pool.query("delete from profiles where id = $1", [req.params.id]);
  res.json({ ok: true });
});

router.get("/applies/profiles-summary", async (_req, res) => {
  const result = await pool.query(`
    select
      p.id as profile_id,
      p.name as profile_name,
      count(a.id)::int as total_applies,
      count(case when a.created_at >= date_trunc('day', now()) then 1 end)::int as today_applies
    from profiles p
    left join applies a on a.profile_id = p.id
    group by p.id, p.name
    order by p.name asc
  `);
  res.json({ rows: result.rows });
});

router.get("/interviews", async (_req, res) => {
  const result = await pool.query(`
    select
      i.*,
      p.name as profile_name,
      u.name as assigned_user_name
    from interviews i
    join profiles p on p.id = i.profile_id
    left join users u on u.id = p.assigned_user_id
    order by i.due_date nulls last, i.created_at desc
  `);
  res.json({ interviews: result.rows });
});

router.post("/interviews", async (req, res) => {
  const { profile_id, company, tech_stacks, processes, current_step, additional_info, due_date } = req.body;
  const result = await pool.query(`
    insert into interviews (profile_id, company, tech_stacks, processes, current_step, additional_info, due_date)
    values ($1, $2, $3, $4, $5, $6, $7)
    returning *
  `, [profile_id, company, tech_stacks || [], processes || [], current_step || null, additional_info || null, due_date || null]);
  res.status(201).json({ interview: result.rows[0] });
});

router.put("/interviews/:id", async (req, res) => {
  const { profile_id, company, tech_stacks, processes, current_step, additional_info, due_date } = req.body;
  const result = await pool.query(`
    update interviews
    set profile_id = $1, company = $2, tech_stacks = $3, processes = $4, current_step = $5, additional_info = $6, due_date = $7
    where id = $8
    returning *
  `, [profile_id, company, tech_stacks || [], processes || [], current_step || null, additional_info || null, due_date || null, req.params.id]);
  res.json({ interview: result.rows[0] });
});

router.delete("/interviews/:id", async (req, res) => {
  await pool.query("delete from interviews where id = $1", [req.params.id]);
  res.json({ ok: true });
});

export default router;
