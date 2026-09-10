import pool from '../db.js';

/**
 * Cancel an order. If a coupon was applied, its usage count should be
 * released back.
 * @param {string} orderId
 * @returns {Promise<string>} a result message
 * @throws {Error} if the order doesn't exist or is already cancelled
 */
export async function cancelOrder(orderId) {
  if (typeof orderId !== 'string' || orderId.trim() === '') {
    throw new Error('Order ID must be a non-empty string');
  }

  const normalizedOrderId = orderId.trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT id, coupon_code, status FROM orders WHERE id = $1 FOR UPDATE`,
      [normalizedOrderId]
    );
    if (orderResult.rows.length === 0) {
      throw new Error(`Order '${normalizedOrderId}' not found`);
    }

    const order = orderResult.rows[0];
    if (order.status === 'cancelled') {
      throw new Error(`Order '${normalizedOrderId}' is already cancelled`);
    }

    const appliedResult = await client.query(
      `SELECT code FROM order_coupons WHERE order_id = $1 ORDER BY code`,
      [normalizedOrderId]
    );
    const appliedCodes = appliedResult.rows.map(({ code }) => code);
    if (appliedCodes.length === 0 && order.coupon_code !== null) {
      appliedCodes.push(order.coupon_code);
    }

    await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [normalizedOrderId]);
    for (const code of appliedCodes) {
      await client.query(
        `UPDATE coupons SET times_used = times_used - 1 WHERE code = $1`,
        [code]
      );
    }

    await client.query('COMMIT');
    const couponNote = appliedCodes.length > 0
      ? ` Coupon usage released for ${appliedCodes.join(', ')}.`
      : '';
    return `Order '${normalizedOrderId}' has been cancelled.${couponNote}`;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
