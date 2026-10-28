import { db, hashPassword } from '../database/db.js';
import { generateToken } from '../middleware/auth.js';
import crypto from 'node:crypto';

export class AuthController {
  static async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password required' });
      }

      const passHash = hashPassword(password);
      const user = await db.prepare(`
        SELECT id, email, full_name, role, phone_number, community, district, created_at
        FROM profiles 
        WHERE email = ? AND password_hash = ?
      `).get(email.toLowerCase().trim(), passHash);

      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      const token = generateToken(user);

      return res.json({
        success: true,
        message: 'Authentication successful',
        token,
        user
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  static async register(req, res) {
    try {
      const { email, password, full_name, phone_number, community, district } = req.body;

      if (!email || !password || !full_name) {
        return res.status(400).json({ success: false, error: 'Email, password and full name are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      const existing = await db.prepare('SELECT id FROM profiles WHERE email = ?').get(email.toLowerCase().trim());
      if (existing) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }

      const newId = 'usr-' + crypto.randomUUID().slice(0, 8);
      const passHash = hashPassword(password);

      // Customer role by default (never allow self-assignment of admin role)
      await db.prepare(`
        INSERT INTO profiles (id, email, password_hash, full_name, role, phone_number, community, district)
        VALUES (?, ?, ?, ?, 'customer', ?, ?, ?)
      `).run(newId, email.toLowerCase().trim(), passHash, full_name.trim(), phone_number || null, community || null, district || 'Lusaka');

      const user = await db.prepare('SELECT id, email, full_name, role, phone_number, community, district, created_at FROM profiles WHERE id = ?').get(newId);
      const token = generateToken(user);

      return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  static getProfile(req, res) {
    return res.json({ success: true, user: req.user });
  }
}
