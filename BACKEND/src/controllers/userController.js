import { db } from '../database/db.js';

// Roles the system understands. 'technician' exists in the schema and is a
// dispatch role: they can be assigned work but cannot administer the platform.
const ROLES = ['admin', 'technician', 'customer'];

const USER_COLUMNS = `
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.phone_number,
  p.community,
  p.district,
  p.avatar_url,
  p.auth_provider,
  p.created_at
`;

export class UserController {
  /**
   * GET /api/users  (admin only)
   *
   * The people list behind Settings > Team & Roles: who is verified, how they
   * signed in, and how many reports they have filed.
   */
  static async listUsers(req, res) {
    try {
      // One query works on both backends: COUNT(*) returns bigint on Postgres
      // (a string through pg) and integer in SQLite, so it is coerced below.
      const users = await db.prepare(`
        SELECT ${USER_COLUMNS},
          (SELECT COUNT(*) FROM community_reports r WHERE r.reporter_id = p.id) AS report_count
        FROM profiles p
        ORDER BY
          CASE p.role WHEN 'admin' THEN 0 WHEN 'technician' THEN 1 ELSE 2 END,
          p.full_name ASC
      `).all();

      return res.json({
        success: true,
        count: users.length,
        data: users.map((u) => ({
          ...u,
          report_count: Number(u.report_count || 0),
          is_self: u.id === req.user?.id
        })),
        roles: ROLES
      });
    } catch (err) {
      console.error('[UserController] listUsers failed:', err.message);
      return res.status(500).json({ success: false, error: 'Could not load users' });
    }
  }

  /**
   * PATCH /api/users/:id/role  (admin only)
   * Body: { role: 'admin' | 'technician' | 'customer' }
   */
  static async updateRole(req, res) {
    try {
      const { id } = req.params;
      const role = String(req.body?.role || '').trim().toLowerCase();

      if (!ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          error: `Invalid role. Allowed: ${ROLES.join(', ')}`
        });
      }

      const target = await db.prepare('SELECT id, full_name, email, role FROM profiles WHERE id = ?').get(id);
      if (!target) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      if (target.role === role) {
        return res.json({ success: true, message: 'Role unchanged', data: target });
      }

      // Guardrail: never leave the platform without an administrator.
      if (target.role === 'admin' && role !== 'admin') {
        const admins = await db.prepare("SELECT COUNT(*) AS c FROM profiles WHERE role = 'admin'").get();
        const adminCount = Number(admins?.c ?? admins?.count ?? 0);
        if (adminCount <= 1) {
          return res.status(409).json({
            success: false,
            error: 'This is the last administrator. Promote someone else first.'
          });
        }
      }

      await db.prepare(`
        UPDATE profiles SET role = ?, updated_at = datetime('now') WHERE id = ?
      `).run(role, id);

      const updated = await db.prepare(`SELECT ${USER_COLUMNS} FROM profiles p WHERE p.id = ?`).get(id);

      return res.json({
        success: true,
        message: `${updated.full_name || updated.email} is now ${
          role === 'admin' ? 'an administrator' : role === 'technician' ? 'a technician' : 'a customer'
        }`,
        data: { ...updated, is_self: updated.id === req.user?.id }
      });
    } catch (err) {
      console.error('[UserController] updateRole failed:', err.message);
      return res.status(500).json({ success: false, error: 'Could not update role' });
    }
  }
}
