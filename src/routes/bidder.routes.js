import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireBidder } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireBidder);

router.get("/dashboard", async (req, res) => {
  const cards = await pool.query(
    `
    select
      (select count(*)::int from profiles where assigned_user_id = $1) as assigned_profiles,
      (select count(*)::int from interviews i join profiles p on p.id = i.profile_id where p.assigned_user_id = $1) as total_interviews,
      (select count(*)::int as interviews_this_week from interviews i join profiles p on p.id = i.profile_id where p.assigned_user_id = $1 and i.due_date >= date_trunc('week', now()) and i.due_date < date_trunc('week', now()) + interval '7 day') as this_week_interviews`,
    [req.user.id],
  );

  const rows = await pool.query(
    `
    select
      p.id as profile_id,
      p.name as profile_name,
      count(i.id)::int as total_interviews,
      count(case when i.due_date >= date_trunc('week', now()) and i.due_date < date_trunc('week', now()) + interval '7 day' then 1 end)::int as this_week_interviews
    from profiles p
    left join interviews i on i.profile_id = p.id
    where p.assigned_user_id = $1
    group by p.id, p.name
    order by p.name asc
  `,
    [req.user.id],
  );

  const active = await pool.query(
    `
    select * from work_sessions
    where user_id = $1 and end_time is null
    order by start_time desc
    limit 1
  `,
    [req.user.id],
  );

  res.json({
    cards: cards.rows[0],
    profile_interviews: rows.rows,
    active_session: active.rows[0] || null,
  });
});

router.get("/profiles", async (req, res) => {
  const result = await pool.query(
    "select * from profiles where assigned_user_id = $1 order by name asc",
    [req.user.id],
  );
  res.json({ profiles: result.rows });
});

router.get("/profiles/:profileId/apply-data", async (req, res) => {
  const { profileId } = req.params;
  const q = `%${String(req.query.q || "").trim()}%`;
  const allowed = await pool.query(
    "select * from profiles where id = $1 and assigned_user_id = $2",
    [profileId, req.user.id],
  );
  const profile = allowed.rows[0];
  if (!profile)
    return res.status(403).json({ message: "Profile not assigned to you." });

  const applies = await pool.query(
    `
    select * from applies
    where profile_id = $1
      and ($2 = '%%' or company_name ilike $2 or job_title ilike $2 or job_site_url ilike $2)
    order by created_at desc
  `,
    [profileId, q],
  );

  const stats = await pool.query(
    `
    select
      count(*)::int as total_applies,
      count(case when created_at >= date_trunc('day', now()) then 1 end)::int as today_applies
    from applies
    where profile_id = $1
  `,
    [profileId],
  );

  const interviews = await pool.query(
    `
    select * from interviews
    where profile_id = $1
      and due_date >= current_date
      and due_date < current_date + interval '7 days'
    order by due_date asc nulls last
  `,
    [profileId],
  );

  res.json({
    profile,
    applies: applies.rows,
    stats: {
      ...stats.rows[0],
      this_week_interviews: interviews.rowCount,
    },
    interviews: interviews.rows,
  });
});

export default router;
