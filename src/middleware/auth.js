const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../database/db');

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = req.cookies?.[config.auth.cookieName] || null;
  return { bearer, cookieToken };
}

async function resolveUserFromToken(token) {
  const decoded = jwt.verify(token, config.jwt.secret);
  const result = await pool.query(
    'SELECT id, email, role, is_active FROM users WHERE id = $1',
    [decoded.userId]
  );
  const user = result.rows[0];
  if (!user || user.is_active === 0) return null;
  return { id: user.id, email: user.email, role: user.role };
}

/**
 * Verify JWT and attach user to request
 */
async function authenticate(req, res, next) {
  const { bearer, cookieToken } = getTokenFromRequest(req);
  const token = bearer || cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    let user = null;
    try {
      if (bearer) user = await resolveUserFromToken(bearer);
    } catch {
      user = null;
    }
    if (!user && cookieToken) {
      user = await resolveUserFromToken(cookieToken);
    }
    if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth - attach user if token present, don't fail if not
 */
async function optionalAuth(req, res, next) {
  const { bearer, cookieToken } = getTokenFromRequest(req);
  if (!bearer && !cookieToken) {
    req.user = null;
    return next();
  }

  try {
    let user = null;
    try {
      if (bearer) user = await resolveUserFromToken(bearer);
    } catch {
      user = null;
    }
    if (!user && cookieToken) {
      try {
        user = await resolveUserFromToken(cookieToken);
      } catch {
        user = null;
      }
    }
    req.user = user;
  } catch {
    req.user = null;
  }
  next();
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, optionalAuth, requireAdmin };
