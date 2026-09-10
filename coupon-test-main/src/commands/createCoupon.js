import pool from '../db.js';

/**
 * Create a new coupon.
 * @param {string} code
 * @param {'percent'|'flat'} discountType
 * @param {number} discountValue
 * @param {number} minSpend
 * @param {string} expiresAt - ISO date string
 * @param {number} usageLimit
 * @param {number|null} [maxDiscountAmount] - bonus 1: cap on computed discount for percent coupons
 * @param {number|null} [usageLimitPerUser] - bonus 2: per-user redemption cap
 * @returns {Promise<string>} a result message
 * @throws {Error} on invalid input or duplicate code
 */
export async function createCoupon(
  code,
  discountType,
  discountValue,
  minSpend,
  expiresAt,
  usageLimit,
  maxDiscountAmount = null,
  usageLimitPerUser = null
) {
  if (!code || typeof code !== 'string' || code.trim() === '') {
    throw new Error('Coupon code must be a non-empty string');
  }
  if (discountType !== 'percent' && discountType !== 'flat') {
    throw new Error("discount_type must be 'percent' or 'flat'");
  }
  if (typeof discountValue !== 'number' || !isFinite(discountValue) || discountValue <= 0) {
    throw new Error('discount_value must be a positive number');
  }
  if (discountType === 'percent' && discountValue > 100) {
    throw new Error('percent discount_value cannot exceed 100');
  }
  if (typeof minSpend !== 'number' || !isFinite(minSpend) || minSpend < 0) {
    throw new Error('min_spend must be a non-negative number');
  }
  if (!expiresAt || isNaN(Date.parse(expiresAt))) {
    throw new Error('expires_at must be a valid ISO date string');
  }
  if (!Number.isInteger(usageLimit) || usageLimit <= 0) {
    throw new Error('usage_limit must be a positive integer');
  }
  if (maxDiscountAmount !== null) {
    if (typeof maxDiscountAmount !== 'number' || !isFinite(maxDiscountAmount) || maxDiscountAmount <= 0) {
      throw new Error('max_discount_amount must be a positive number');
    }
  }
  if (usageLimitPerUser !== null) {
    if (!Number.isInteger(usageLimitPerUser) || usageLimitPerUser <= 0) {
      throw new Error('usage_limit_per_user must be a positive integer');
    }
  }

  const trimmedCode = code.trim();

  await pool.query(
    `INSERT INTO coupons
       (code, discount_type, discount_value, min_spend, expires_at, usage_limit,
        max_discount_amount, usage_limit_per_user)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [trimmedCode, discountType, discountValue, minSpend, expiresAt, usageLimit,
     maxDiscountAmount, usageLimitPerUser]
  );

  return `Coupon '${trimmedCode}' created successfully.`;
}
