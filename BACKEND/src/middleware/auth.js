import jwt from 'jsonwebtoken';
import { db } from '../database/db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }

    // Attach current user record
    const profile = await db.prepare('SELECT id, email, full_name, role, community, district, phone_number, avatar_url, auth_provider FROM profiles WHERE id = ?').get(user.id);
    if (!profile) {
      return res.status(401).json({ success: false, error: 'User profile no longer exists' });
    }

    req.user = profile;
    next();
  });
}

// Optional auth - populates req.user if token is present, continues otherwise
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, async (err, user) => {
      if (!err && user) {
        const profile = await db.prepare('SELECT id, email, full_name, role, community, district, phone_number, avatar_url, auth_provider FROM profiles WHERE id = ?').get(user.id);
        if (profile) req.user = profile;
      }
      next();
    });
  } else {
    next();
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: Administrator privileges required' });
  }
  next();
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
