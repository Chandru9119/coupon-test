import pool from '../db.js';

/**
 * @param {string} code
 * @returns {Promise<{code: string, timesUsed: number, usageLimit: number, expiresAt: string}>}
 * @throws {Error} if the coupon doesn't exist
 */
export async function getCoupon(code) {
  // TODO: implement.
  throw new Error('not implemented');
}
