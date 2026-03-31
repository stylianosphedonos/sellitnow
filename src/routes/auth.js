const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const config = require('../config');
const AuthService = require('../services/AuthService');
const AddressService = require('../services/AddressService');
const CartService = require('../services/CartService');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
});

function authCookieOptions() {
  const sameSiteRaw = String(config.auth.cookieSameSite || 'lax').toLowerCase();
  const sameSite = sameSiteRaw === 'none' ? 'none' : sameSiteRaw === 'strict' ? 'strict' : 'lax';
  return {
    httpOnly: true,
    secure: Boolean(config.auth.cookieSecure),
    sameSite,
    path: '/',
  };
}

function csrfCookieOptions() {
  return {
    ...authCookieOptions(),
    httpOnly: false,
  };
}

function issueSessionCookies(res, token) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie(config.auth.cookieName, token, authCookieOptions());
  res.cookie(config.auth.csrfCookieName, csrfToken, csrfCookieOptions());
  return csrfToken;
}

function clearSessionCookies(res) {
  res.clearCookie(config.auth.cookieName, { path: '/' });
  res.clearCookie(config.auth.csrfCookieName, { path: '/' });
}

// POST /api/v1/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body;
    const result = await AuthService.register({ email, password, first_name, last_name, phone });
    issueSessionCookies(res, result.token);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/v1/auth/verify-email?token=xxx
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    const user = await AuthService.verifyEmail(token);
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/v1/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await AuthService.login(email, password);
    issueSessionCookies(res, result.token);

    const sessionId = req.headers['x-cart-session'];
    if (sessionId) {
      try {
        await CartService.mergeCarts(result.user.id, sessionId);
      } catch (mergeErr) {
        console.warn('Cart merge failed on login:', mergeErr.message);
      }
    }

    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// POST /api/v1/auth/logout (client clears token; optional server-side)
router.post('/logout', authenticate, (req, res) => {
  clearSessionCookies(res);
  res.json({ success: true });
});

router.get('/csrf', (req, res) => {
  const csrfToken = req.cookies?.[config.auth.csrfCookieName] || crypto.randomBytes(32).toString('hex');
  res.cookie(config.auth.csrfCookieName, csrfToken, csrfCookieOptions());
  res.json({ csrfToken });
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    await AuthService.forgotPassword(email);
    res.json({ success: true, message: 'If the email exists, a reset link was sent' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    await AuthService.resetPassword(token, password);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// User profile (requires auth)
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await AuthService.getProfile(req.user.id);
    res.json({ user });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.patch('/me', authenticate, async (req, res) => {
  try {
    const { first_name, last_name, phone } = req.body;
    const user = await AuthService.updateProfile(req.user.id, { first_name, last_name, phone });
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/me', authenticate, async (req, res) => {
  try {
    await AuthService.deleteAccount(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Addresses
router.get('/addresses', authenticate, async (req, res) => {
  try {
    const addresses = await AddressService.list(req.user.id);
    res.json({ addresses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/addresses', authenticate, async (req, res) => {
  try {
    const address = await AddressService.create(req.user.id, req.body);
    res.status(201).json({ address });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/addresses/:id', authenticate, async (req, res) => {
  try {
    const address = await AddressService.update(parseInt(req.params.id, 10), req.user.id, req.body);
    res.json({ address });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/addresses/:id', authenticate, async (req, res) => {
  try {
    await AddressService.delete(parseInt(req.params.id, 10), req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
