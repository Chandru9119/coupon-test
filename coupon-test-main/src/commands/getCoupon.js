import pool from '../db.js';

/**
 * @param {string} code
 * @returns {Promise<{code: string, discountType: string, discountValue: number,
 *   minSpend: number, expiresAt: Date, usageLimit: number, timesUsed: number,
 *   maxDiscountAmount: number|null, usageLimitPerUser: number|null}>}
 * @throws {Error} if the coupon doesn't exist
 */
export async function getCoupon(code) {
  if (!code || typeof code !== 'string' || code.trim() === '') {
    throw new Error('Coupon code must be a non-empty string');
  }

  const result = await pool.query(
    `SELECT * FROM coupons WHERE code = $1`,
    [code.trim()]
  );

  if (result.rows.length === 0) {
    throw new Error(`Coupon '${code.trim()}' not found`);
  }

  const c = result.rows[0];

  return {
    code: c.code,
    discountType: c.discount_type,
    discountValue: parseFloat(c.discount_value),
    minSpend: parseFloat(c.min_spend),
    expiresAt: c.expires_at,
    usageLimit: c.usage_limit,
    timesUsed: c.times_used,
    maxDiscountAmount: c.max_discount_amount !== null ? parseFloat(c.max_discount_amount) : null,
    usageLimitPerUser: c.usage_limit_per_user,
  };
}
