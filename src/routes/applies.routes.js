// server/src/routes/applies.routes.js

import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { normalizeUrl } from "../utils/url.js";

const router = Router();

/**
 * Check duplicate apply by profile + normalized URL
 */
router.post("/check-duplicate", requireAuth, async (req, res) => {
  try {
    const profileId = req.body.profile_id || req.body.profileId;
    const rawUrl = req.body.job_site_url || req.body.jobSiteUrl;

    if (!profileId || !rawUrl) {
      return res.status(400).json({
        message: "profile_id and job_site_url are required."
      });
    }

    const normalized = normalizeUrl(rawUrl);

    const exists = await pool.query(
      `
      select id
      from applies
      where profile_id = $1
        and normalized_url = $2
      limit 1
      `,
      [profileId, normalized]
    );

    if (exists.rows[0]) {
      return res.status(409).json({
        message: "This job link was already applied before for this profile."
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to check duplicate apply." });
  }
});

/**
 * Create apply
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { profile_id, company_name, job_title, job_site_url } = req.body;

    if (!profile_id || !company_name || !job_title || !job_site_url) {
      return res.status(400).json({
        message: "profile_id, company_name, job_title and job_site_url are required."
      });
    }

    // bidder can only apply to assigned profile
    if (req.user.role === "bidder") {
      const allowed = await pool.query(
        `
        select id
        from profiles
        where id = $1
          and assigned_user_id = $2
        limit 1
        `,
        [profile_id, req.user.id]
      );

      if (!allowed.rows[0]) {
        return res.status(403).json({
          message: "Profile not assigned to you."
        });
      }
    }

    const normalized = normalizeUrl(job_site_url);

    const exists = await pool.query(
      `
      select id
      from applies
      where profile_id = $1
        and normalized_url = $2
      limit 1
      `,
      [profile_id, normalized]
    );

    if (exists.rows[0]) {
      return res.status(409).json({
        message: "This job link was already applied before for this profile."
      });
    }

    const result = await pool.query(
      `
      insert into applies (
        profile_id,
        company_name,
        job_title,
        job_site_url,
        normalized_url
      )
      values ($1, $2, $3, $4, $5)
      returning *
      `,
      [profile_id, company_name, job_title, normalized, normalized]
    );

    res.status(201).json({ apply: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create apply." });
  }
});

/**
 * Update apply
 */
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name, job_title, job_site_url } = req.body;

    const found = await pool.query(
      `
      select *
      from applies
      where id = $1
      limit 1
      `,
      [id]
    );

    const apply = found.rows[0];

    if (!apply) {
      return res.status(404).json({ message: "Apply not found." });
    }

    if (req.user.role === "bidder") {
      const allowed = await pool.query(
        `
        select id
        from profiles
        where id = $1
          and assigned_user_id = $2
        limit 1
        `,
        [apply.profile_id, req.user.id]
      );

      if (!allowed.rows[0]) {
        return res.status(403).json({
          message: "Profile not assigned to you."
        });
      }
    }

    const normalized = normalizeUrl(job_site_url);

    const duplicate = await pool.query(
      `
      select id
      from applies
      where profile_id = $1
        and normalized_url = $2
        and id <> $3
      limit 1
      `,
      [apply.profile_id, normalized, id]
    );

    if (duplicate.rows[0]) {
      return res.status(409).json({
        message: "Another apply already exists with this job link."
      });
    }

    const result = await pool.query(
      `
      update applies
      set company_name   = $1,
          job_title      = $2,
          job_site_url   = $3,
          normalized_url = $4
      where id = $5
      returning *
      `,
      [company_name, job_title, normalized, normalized, id]
    );

    res.json({ apply: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update apply." });
  }
});

/**
 * Delete apply
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const found = await pool.query(
      `
      select *
      from applies
      where id = $1
      limit 1
      `,
      [id]
    );

    const apply = found.rows[0];

    if (!apply) {
      return res.status(404).json({ message: "Apply not found." });
    }

    if (req.user.role === "bidder") {
      const allowed = await pool.query(
        `
        select id
        from profiles
        where id = $1
          and assigned_user_id = $2
        limit 1
        `,
        [apply.profile_id, req.user.id]
      );

      if (!allowed.rows[0]) {
        return res.status(403).json({
          message: "Profile not assigned to you."
        });
      }
    }

    await pool.query(
      `
      delete from applies
      where id = $1
      `,
      [id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete apply." });
  }
});

/**
 * Get applies by profile
 * Supports:
 * - q=search text
 * - from=YYYY-MM-DD
 * - to=YYYY-MM-DD
 * - page=1
 * - limit=100
 */
router.get("/profile/:profileId", requireAuth, async (req, res) => {
  try {
    const { profileId } = req.params;

    const q = `%${String(req.query.q || "").trim()}%`;
    const from = req.query.from;
    const to = req.query.to;

    const page = Math.max(parseInt(req.query.page || "1"), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "100"), 1),
      100
    );
    const offset = (page - 1) * limit;

    // bidder can only access assigned profile
    if (req.user.role === "bidder") {
      const allowed = await pool.query(
        `
        select id
        from profiles
        where id = $1
          and assigned_user_id = $2
        limit 1
        `,
        [profileId, req.user.id]
      );

      if (!allowed.rows[0]) {
        return res.status(403).json({
          message: "Profile not assigned to you."
        });
      }
    }

    const profileRes = await pool.query(
      `
      select *
      from profiles
      where id = $1
      limit 1
      `,
      [profileId]
    );

    const profile = profileRes.rows[0];

    if (!profile) {
      return res.status(404).json({ message: "Profile not found." });
    }

    /**
     * Build WHERE clause
     */
    let whereSql = `
      from applies
      where profile_id = $1
    `;

    const params = [profileId];
    let idx = 2;

    if (q !== "%%") {
      whereSql += `
        and (
          company_name ilike $${idx}
          or job_title ilike $${idx}
          or job_site_url ilike $${idx}
        )
      `;
      params.push(q);
      idx++;
    }

    if (from) {
      whereSql += ` and created_at >= $${idx}`;
      params.push(from);
      idx++;
    }

    if (to) {
      whereSql += ` and created_at <= $${idx}`;
      params.push(`${to} 23:59:59`);
      idx++;
    }

    /**
     * Total filtered count
     */
    const countRes = await pool.query(
      `
      select count(*)::int as total
      ${whereSql}
      `,
      params
    );

    const totalItems = countRes.rows[0].total;
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

    /**
     * Data query
     */
    const dataParams = [...params, limit, offset];

    const appliesRes = await pool.query(
      `
      select *
      ${whereSql}
      order by created_at desc
      limit $${idx}
      offset $${idx + 1}
      `,
      dataParams
    );

    /**
     * Overall stats (not paginated)
     */
    const statsRes = await pool.query(
      `
      select
        count(*)::int as total,
        count(
          case
            when created_at >= date_trunc('day', now()) then 1
          end
        )::int as today
      from applies
      where profile_id = $1
      `,
      [profileId]
    );

    res.json({
      profile,
      applies: appliesRes.rows,
      stats: statsRes.rows[0],
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load applies." });
  }
});

router.get("/check-company/:profileId", requireAuth, async (req, res) => {
  try {
    const { profileId } = req.params;
    const company = String(req.query.company || "").trim();

    if (!company) {
      return res.status(400).json({
        message: "Company name required."
      });
    }

    // bidder can only access own profile
    if (req.user.role === "bidder") {
      const allowed = await pool.query(
        `
        select id
        from profiles
        where id = $1
        and assigned_user_id = $2
        limit 1
        `,
        [profileId, req.user.id]
      );

      if (!allowed.rows[0]) {
        return res.status(403).json({
          message: "Profile not assigned to you."
        });
      }
    }

    const result = await pool.query(
      `
      select id, company_name, job_title, created_at
      from applies
      where profile_id = $1
      and company_name ilike $2
      order by created_at desc
      limit 10
      `,
      [profileId, `%${company}%`]
    );

    res.json({
      total: result.rows.length,
      items: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to check company."
    });
  }
});

export default router;