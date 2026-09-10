import pool from '../db.js';

/**
 * @param {string} code
 * @returns {Promise<{code: string, timesUsed: number, usageLimit: number, expiresAt: string}>}
 * @throws {Error} if the coupon doesn't exist
 */
export async function getCoupon(code) {
  if (typeof code !== 'string' || code.trim() === '') {
    throw new Error('Coupon code must be a non-empty string');
  }

  const normalizedCode = code.trim();
  const result = await pool.query(
    `SELECT code, discount_type, discount_value, min_spend, expires_at,
            usage_limit, times_used, max_discount_amount, usage_limit_per_user
     FROM coupons
     WHERE code = $1`,
    [normalizedCode]
  );
  if (result.rows.length === 0) {
    throw new Error(`Coupon '${normalizedCode}' not found`);
  }

  const coupon = result.rows[0];
  return {
    code: coupon.code,
    discountType: coupon.discount_type,
    discountValue: Number(coupon.discount_value),
    minSpend: Number(coupon.min_spend),
    expiresAt: coupon.expires_at,
    usageLimit: coupon.usage_limit,
    timesUsed: coupon.times_used,
    maxDiscountAmount: coupon.max_discount_amount === null ? null : Number(coupon.max_discount_amount),
    usageLimitPerUser: coupon.usage_limit_per_user,
  };
}
