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

    // Release the coupon usage if one was applied.
    // GREATEST guards against underflow in the event of any data inconsistency.
    let couponNote = '';
    if (order.coupon_code !== null) {
      await client.query(
        `UPDATE coupons SET times_used = GREATEST(times_used - 1, 0) WHERE code = $1`,
        [order.coupon_code]
      );
      couponNote = ` Coupon '${order.coupon_code}' usage released.`;
    }

    await client.query('COMMIT');

    return `Order '${trimmedId}' has been cancelled.${couponNote}`;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
