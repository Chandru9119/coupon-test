import pool from '../db.js';

/**
 * Cancel an order. If a coupon was applied, its usage count is decremented
 * so the slot becomes available again.
 *
 * Concurrency safety:
 *   - The order row is locked with SELECT … FOR UPDATE, preventing two
 *     concurrent cancellations of the same order from both decrementing the
 *     coupon count.
 *   - The subsequent UPDATE on the coupon row will block if a concurrent
 *     applyCoupon holds a SELECT FOR UPDATE on that coupon, ensuring the
 *     increment and decrement are properly serialised.
 *
 * @param {string} orderId
 * @returns {Promise<string>} a result message
 * @throws {Error} if the order doesn't exist or is already cancelled
 */
export async function cancelOrder(orderId) {
  if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
    throw new Error('Order ID must be a non-empty string');
  }

  const trimmedId = orderId.trim();

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(trimmedId)) {
    throw new Error(`'${trimmedId}' is not a valid order ID`);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the order row so that concurrent cancellations of the same order
    // are serialised — only the first one proceeds, the second sees 'cancelled'.
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [trimmedId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error(`Order '${trimmedId}' not found`);
    }

    const order = orderResult.rows[0];

    if (order.status === 'cancelled') {
      throw new Error(`Order '${trimmedId}' is already cancelled`);
    }

    // Mark the order cancelled.
    await client.query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1`,
      [trimmedId]
    );

    const appliedCouponsResult = await client.query(
      `SELECT code FROM order_coupons WHERE order_id = $1 ORDER BY code`,
      [trimmedId]
    );
    const appliedCodes = appliedCouponsResult.rows.map(({ code }) => code);
    if (appliedCodes.length === 0 && order.coupon_code !== null) {
      appliedCodes.push(order.coupon_code);
    }

    // Release all coupon usages. A base order has one code on orders; a stacked
    // order has one row per code in order_coupons.
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
    return `Order '${trimmedId}' has been cancelled.${couponNote}`;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
