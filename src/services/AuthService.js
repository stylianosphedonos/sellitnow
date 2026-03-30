const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool, withTransaction } = require('../database/db');
const config = require('../config');
const EmailService = require('./EmailService');

class AuthService {
  async register({ email, password, first_name, last_name, phone }) {
    if (!email || !password || !first_name || !last_name) {
      throw new Error('Email, password, first name, and last name are required');
    }
    if (password.length < config.app.passwordMinLength) {
      throw new Error(`Password must be at least ${config.app.passwordMinLength} characters`);
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) throw new Error('Email already registered');

    const password_hash = await bcrypt.hash(password, 12);
    const email_verification_token = uuidv4();

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verification_token)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, phone, email_verified, role, created_at`,
      [email.toLowerCase(), password_hash, first_name, last_name, phone || null, email_verification_token]
    );

    const user = result.rows[0];
    const verificationUrl = `${config.apiBaseUrl}/api/v1/auth/verify-email?token=${email_verification_token}`;
    await EmailService.sendVerification(user, verificationUrl);
    await EmailService.sendWelcome(user);

    return { user: this.sanitizeUser(user), token: this.createToken(user), requiresVerification: true };
  }

  async verifyEmail(token) {
    const result = await pool.query(
      'UPDATE users SET email_verified = true, email_verification_token = NULL WHERE email_verification_token = $1 RETURNING *',
      [token]
    );
    if (!result.rows.length) throw new Error('Invalid or expired verification token');
    return this.sanitizeUser(result.rows[0]);
  }

  async login(email, password) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) throw new Error('Invalid email or password');
    if (user.is_active === 0) throw new Error('Account is disabled. Contact support.');

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new Error(`Account locked. Try again after ${user.locked_until}`);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await this.incrementFailedAttempts(user.id);
      throw new Error('Invalid email or password');
    }

    await pool.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [user.id]
    );

    return { user: this.sanitizeUser(user), token: this.createToken(user) };
  }

  async incrementFailedAttempts(userId) {
    const r = await pool.query(
      `UPDATE users SET failed_login_attempts = failed_login_attempts + 1
       WHERE id = $1
       RETURNING failed_login_attempts`,
      [userId]
    );
    const attempts = r.rows[0]?.failed_login_attempts || 0;
    if (attempts >= config.app.maxLoginAttempts) {
      const lockedUntil = new Date(Date.now() + config.app.lockoutMinutes * 60 * 1000).toISOString();
      await pool.query('UPDATE users SET locked_until = $1 WHERE id = $2', [lockedUntil, userId]);
      throw new Error(`Account locked for ${config.app.lockoutMinutes} minutes due to too many failed attempts`);
    }
  }

  async forgotPassword(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return { success: true }; // Don't reveal if email exists

    const token = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expires]
    );

    const resetUrl = `${config.apiBaseUrl}/api/v1/auth/reset-password?token=${token}`;
    await EmailService.sendPasswordReset(user, resetUrl);
    return { success: true };
  }

  async resetPassword(token, newPassword) {
    if (newPassword.length < config.app.passwordMinLength) {
      throw new Error(`Password must be at least ${config.app.passwordMinLength} characters`);
    }

    const r = await pool.query(
      `SELECT u.* FROM users u
       JOIN password_reset_tokens prt ON prt.user_id = u.id
       WHERE prt.token = $1 AND prt.expires_at > NOW() AND prt.used = false`,
      [token]
    );
    const user = r.rows[0];
    if (!user) throw new Error('Invalid or expired reset token');

    const password_hash = await bcrypt.hash(newPassword, 12);
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, user.id]);
      await client.query('UPDATE password_reset_tokens SET used = true WHERE token = $1', [token]);
    });

    return { success: true };
  }

  createToken(user) {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'customer' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  sanitizeUser(user) {
    const u = { ...user };
    delete u.password_hash;
    delete u.email_verification_token;
    return u;
  }

  async getProfile(userId) {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, phone, email_verified, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (!result.rows.length) throw new Error('User not found');
    return result.rows[0];
  }

  async updateProfile(userId, { first_name, last_name, phone }) {
    const result = await pool.query(
      `UPDATE users SET first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name), phone = COALESCE($4, phone)
       WHERE id = $1 RETURNING id, email, first_name, last_name, phone, email_verified, created_at`,
      [userId, first_name, last_name, phone]
    );
    if (!result.rows.length) throw new Error('User not found');
    return result.rows[0];
  }

  async deleteAccount(userId) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    return { success: true };
  }
}

module.exports = new AuthService();
