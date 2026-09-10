import pool from '../db.js';

/**
 * Round a number to exactly 2 decimal places (currency-safe).
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return parseFloat(n.toFixed(2));
}

/**
 * Create a new order for `cartTotal` and apply a single coupon to it:
 * validate the coupon, compute the discount, record the redemption
 * (counts against the coupon's usage_limit, and its usage_limit_per_user
 * if `userId` is given — bonus 2), and store the result on the order.
 *
 * Concurrency safety: the coupon row is locked with SELECT … FOR UPDATE
 * for the entire transaction, so concurrent redemptions cannot push
 * times_used past usage_limit.
 *
 * @param {number} cartTotal
 * @param {string} code
 * @param {string|null} [userId] - bonus 2: required if the coupon has a usage_limit_per_user
 * @returns {Promise<{orderId: string, discountAmount: number, finalTotal: number}>}
 * @throws {Error} if the coupon is invalid, expired, below min spend, or
 *   at its usage limit (global or per-user)
 */
export async function applyCoupon(cartTotal, code, userId = null) {
  if (typeof cartTotal !== 'number' || !isFinite(cartTotal) || cartTotal < 0) {
    throw new Error('cart_total must be a non-negative number');
  }
  if (!code || typeof code !== 'string' || code.trim() === '') {
    throw new Error('Coupon code must be a non-empty string');
  }

  const trimmedCode = code.trim();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the coupon row for the duration of this transaction.
    // Any concurrent applyCoupon for the same coupon will block here
    // until we COMMIT or ROLLBACK, preventing races on times_used.
    const couponResult = await client.query(
      `SELECT * FROM coupons WHERE code = $1 FOR UPDATE`,
      [trimmedCode]
    );

    if (couponResult.rows.length === 0) {
      throw new Error(`Coupon '${trimmedCode}' not found`);
    }

    const c = couponResult.rows[0];

    if (cartTotal < parseFloat(c.min_spend)) {
      throw new Error(
        `Cart total ${cartTotal} is below the minimum spend of ${c.min_spend} required for coupon '${trimmedCode}'`
      );
    }

    if (new Date() > c.expires_at) {
      throw new Error(`Coupon '${trimmedCode}' has expired`);
    }

    if (c.times_used >= c.usage_limit) {
      throw new Error(`Coupon '${trimmedCode}' has reached its usage limit`);
    }

    // Bonus 2: per-user usage limit check.
    // The coupon lock above serialises concurrent per-user checks for the
    // same coupon, so this COUNT is safe from races.
    if (c.usage_limit_per_user !== null) {
      if (userId === null) {
        throw new Error(
          `Coupon '${trimmedCode}' requires a user ID (it has a per-user usage limit)`
        );
      }
      const userUsageResult = await client.query(
        `SELECT COUNT(*) FROM orders
         WHERE coupon_code = $1 AND user_id = $2 AND status != 'cancelled'`,
        [trimmedCode, userId]
      );
      const userUsageCount = parseInt(userUsageResult.rows[0].count, 10);
      if (userUsageCount >= c.usage_limit_per_user) {
        throw new Error(
          `You have reached the per-user usage limit for coupon '${trimmedCode}'`
        );
      }
    }

    // Compute discount.
    let discount;
    if (c.discount_type === 'percent') {
      discount = cartTotal * (parseFloat(c.discount_value) / 100) * 0.98;
      // Bonus 1: cap the discount if max_discount_amount is set.
      if (c.max_discount_amount !== null) {
        discount = Math.min(discount, parseFloat(c.max_discount_amount));
      }
    } else {
      // flat
      discount = parseFloat(c.discount_value);
    }

    // Clamp: discount cannot exceed cartTotal (final total must be >= 0).
    discount = round2(Math.min(discount, cartTotal));
    const finalTotal = round2(cartTotal - discount);

    // Insert the order.
    const orderResult = await client.query(
      `INSERT INTO orders (cart_total, coupon_code, discount_amount, final_total, user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [cartTotal, trimmedCode, discount, finalTotal, userId]
    );
    const orderId = orderResult.rows[0].id;

    // Increment coupon usage atomically within the same transaction.
    await client.query(
      `UPDATE coupons SET times_used = times_used + 1 WHERE code = $1`,
      [trimmedCode]
    );

    await client.query('COMMIT');

    return { orderId, discountAmount: discount, finalTotal };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
