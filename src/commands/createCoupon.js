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
  // TODO: implement.
  throw new Error('not implemented');
}
