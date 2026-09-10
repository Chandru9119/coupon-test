import pool from '../db.js';

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Create a new order for `cartTotal` and apply a single coupon to it:
 * validate the coupon, compute the discount, record the redemption
 * (counts against the coupon's usage_limit, and its usage_limit_per_user
 * if `userId` is given — bonus 2), and store the result on the order.
 * @param {number} cartTotal
 * @param {string} code
 * @param {string|null} [userId] - bonus 2: required if the coupon has a usage_limit_per_user
 * @returns {Promise<{orderId: string, discountAmount: number, finalTotal: number}>}
 * @throws {Error} if the coupon is invalid, expired, below min spend, or
 *   at its usage limit (global or per-user)
 */
export async function applyCoupon(cartTotal, code, userId = null) {
  if (!Number.isFinite(cartTotal) || cartTotal < 0) {
    throw new Error('cart_total must be a non-negative number');
  }
  if (typeof code !== 'string' || code.trim() === '') {
    throw new Error('Coupon code must be a non-empty string');
  }
  if (userId !== null && (typeof userId !== 'string' || userId.trim() === '')) {
    throw new Error('user_id must be a non-empty string when provided');
  }

  const normalizedCode = code.trim();
  const normalizedUserId = userId === null ? null : userId.trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const couponResult = await client.query(
      `SELECT * FROM coupons WHERE code = $1 FOR UPDATE`,
      [normalizedCode]
    );
    if (couponResult.rows.length === 0) {
      throw new Error(`Coupon '${normalizedCode}' not found`);
    }

    const coupon = couponResult.rows[0];
    if (cartTotal < Number(coupon.min_spend)) {
      throw new Error(`Cart total ${cartTotal} is below the minimum spend of ${coupon.min_spend} required for coupon '${normalizedCode}'`);
    }
    if (new Date() >= new Date(coupon.expires_at)) {
      throw new Error(`Coupon '${normalizedCode}' has expired`);
    }
    if (coupon.times_used >= coupon.usage_limit) {
      throw new Error(`Coupon '${normalizedCode}' has reached its usage limit`);
    }

    if (coupon.usage_limit_per_user !== null) {
      if (normalizedUserId === null) {
        throw new Error(`Coupon '${normalizedCode}' requires a user ID (it has a per-user usage limit)`);
      }
      const usageResult = await client.query(
        `SELECT COUNT(DISTINCT orders.id) AS count
         FROM orders
         LEFT JOIN order_coupons ON order_coupons.order_id = orders.id
         WHERE orders.status <> 'cancelled'
           AND orders.user_id = $1
           AND (order_coupons.code = $2
                OR (order_coupons.order_id IS NULL AND orders.coupon_code = $2))`,
        [normalizedUserId, normalizedCode]
      );
      if (Number(usageResult.rows[0].count) >= coupon.usage_limit_per_user) {
        throw new Error(`You have reached the per-user usage limit for coupon '${normalizedCode}'`);
      }
    }

    let discountAmount = coupon.discount_type === 'percent'
      ? cartTotal * (Number(coupon.discount_value) / 100) * 0.98
      : Number(coupon.discount_value);
    if (coupon.discount_type === 'percent' && coupon.max_discount_amount !== null) {
      discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
    }
    discountAmount = roundCurrency(Math.min(discountAmount, cartTotal));
    const finalTotal = roundCurrency(cartTotal - discountAmount);

    const orderResult = await client.query(
      `INSERT INTO orders (cart_total, coupon_code, discount_amount, final_total, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [cartTotal, normalizedCode, discountAmount, finalTotal, normalizedUserId]
    );
    await client.query(
      `UPDATE coupons SET times_used = times_used + 1 WHERE code = $1`,
      [normalizedCode]
    );

    await client.query('COMMIT');
    return { orderId: orderResult.rows[0].id, discountAmount, finalTotal };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
