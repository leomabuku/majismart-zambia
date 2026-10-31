import { db, hashPassword } from '../database/db.js';
import { generateToken } from '../middleware/auth.js';
import { verifyGoogleIdToken, GoogleAuthError } from '../services/googleAuthService.js';
import crypto from 'node:crypto';

// Columns that are safe to return to a client (never password_hash / google_sub).
const PUBLIC_PROFILE_COLUMNS = `
  id, email, full_name, role, phone_number, community, district,
  avatar_url, auth_provider, created_at
`;

export class AuthController {
  static async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password required' });
      }

      const passHash = hashPassword(password);
      const user = await db.prepare(`
        SELECT ${PUBLIC_PROFILE_COLUMNS}
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
        INSERT INTO profiles (id, email, password_hash, full_name, role, phone_number, community, district, auth_provider)
        VALUES (?, ?, ?, ?, 'customer', ?, ?, ?, 'password')
      `).run(newId, email.toLowerCase().trim(), passHash, full_name.trim(), phone_number || null, community || null, district || 'Lusaka');

      const user = await db.prepare(`SELECT ${PUBLIC_PROFILE_COLUMNS} FROM profiles WHERE id = ?`).get(newId);
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

  /**
   * Exchange a Google ID token for a MajiSmart session.
   *
   * Works for the web dashboard (Google Identity Services) and the Android app
   * (GoogleSignIn requestIdToken) - both send the same signed `credential`.
   *
   * Existing seeded accounts are linked, not replaced: signing in with the
   * admin Google account keeps the admin role and password login still works.
   */
  static async googleLogin(req, res) {
    let identity;
    try {
      const credential = req.body?.credential || req.body?.id_token || req.body?.idToken;
      if (!credential) {
        return res.status(400).json({ success: false, error: 'Google credential is required' });
      }
      identity = await verifyGoogleIdToken(credential);
    } catch (err) {
      if (err instanceof GoogleAuthError) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      console.error('[auth] Google sign-in failed:', err.message);
      return res.status(500).json({ success: false, error: 'Google sign-in failed' });
    }

    if (!identity.emailVerified) {
      return res.status(403).json({
        success: false,
        error: 'This Google account has no verified email address'
      });
    }

    try {
      const existing = await db.prepare(`
        SELECT ${PUBLIC_PROFILE_COLUMNS}, password_hash, google_sub
        FROM profiles WHERE email = ?
      `).get(identity.email);

      let profile = existing;

      if (existing) {
        if (existing.google_sub && identity.sub && existing.google_sub !== identity.sub) {
          return res.status(409).json({
            success: false,
            error: 'This email is already linked to a different Google account'
          });
        }

        // Link the Google identity on first Google sign-in and refresh the avatar.
        if (!existing.google_sub || existing.avatar_url !== identity.picture) {
          await db.prepare(`
            UPDATE profiles
            SET google_sub = ?, avatar_url = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(identity.sub, identity.picture, existing.id);
        }
      } else {
        // No account yet: create a customer profile. password_hash must stay
        // NOT NULL, so store an unguessable sentinel that no password can equal.
        const newId = 'usr-' + crypto.randomUUID().slice(0, 8);
        await db.prepare(`
          INSERT INTO profiles
            (id, email, password_hash, full_name, role, district, google_sub, avatar_url, auth_provider)
          VALUES (?, ?, ?, ?, 'customer', 'Lusaka', ?, ?, 'google')
        `).run(
          newId,
          identity.email,
          'google-oauth:' + crypto.randomUUID() + crypto.randomUUID(),
          identity.name,
          identity.sub,
          identity.picture
        );
        profile = await db.prepare(`SELECT ${PUBLIC_PROFILE_COLUMNS} FROM profiles WHERE id = ?`).get(newId);
      }

      const user = await db.prepare(`SELECT ${PUBLIC_PROFILE_COLUMNS} FROM profiles WHERE id = ?`).get(profile.id);
      const token = generateToken(user);

      return res.json({
        success: true,
        message: 'Signed in with Google',
        token,
        user
      });
    } catch (err) {
      console.error('[auth] Google account provisioning failed:', err.message);
      return res.status(500).json({ success: false, error: 'Could not complete Google sign-in' });
    }
  }

  /**
   * Sessions are stateless JWTs, so logging out is a client-side token drop.
   * The endpoint exists so web and mobile can share one code path and so the
   * action is visible in server logs / future token-revocation work.
   */
  static async logout(req, res) {
    return res.json({ success: true, message: 'Signed out' });
  }

  static getProfile(req, res) {
    return res.json({ success: true, user: req.user });
  }
}
