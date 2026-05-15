const { pool } = require('../database/db');

class OrderEmailLogService {
  /**
   * @param {{
   *   orderId: number,
   *   emailType: string,
   *   label: string,
   *   recipientTo: string,
   *   subject?: string | null,
   *   success: boolean,
   *   errorMessage?: string | null,
   *   source?: string,
   * }} entry
   */
  async append(entry) {
    const orderId = Number(entry.orderId);
    if (!Number.isInteger(orderId) || orderId < 1) return;

    await pool.query(
      `INSERT INTO order_email_logs
        (order_id, email_type, label, recipient_to, subject, success, error_message, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        orderId,
        String(entry.emailType || 'unknown').slice(0, 64),
        String(entry.label || 'Email').slice(0, 128),
        String(entry.recipientTo || '').slice(0, 320),
        entry.subject != null ? String(entry.subject).slice(0, 512) : null,
        entry.success ? 1 : 0,
        entry.errorMessage != null ? String(entry.errorMessage).slice(0, 2000) : null,
        String(entry.source || 'system').slice(0, 64),
      ]
    );
  }

  async listForOrder(orderId, limit = 100) {
    const id = parseInt(orderId, 10);
    if (!Number.isInteger(id) || id < 1) return [];

    const result = await pool.query(
      `SELECT id, order_id, email_type, label, recipient_to, subject, success, error_message, source, created_at
       FROM order_email_logs
       WHERE order_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [id, Math.min(Math.max(limit, 1), 200)]
    );

    return result.rows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      email_type: row.email_type,
      label: row.label,
      recipient_to: row.recipient_to,
      subject: row.subject,
      success: row.success === true || row.success === 1,
      error_message: row.error_message,
      source: row.source,
      created_at: row.created_at,
    }));
  }
}

module.exports = new OrderEmailLogService();
