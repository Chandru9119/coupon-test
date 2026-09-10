import pool from '../db.js';

/**
 * BONUS 3 (stackable coupons). Create a new order for `cartTotal` and
 * apply one or two coupons to it in a single request: at most one
 * `percent` and one `flat` coupon, applied in a well-defined order you
 * choose and document. Validation and redemption must be all-or-nothing —
 * if either coupon is invalid, neither is consumed and no order is
 * created.
 * @param {number} cartTotal
 * @param {string[]} codes - 1 or 2 coupon codes
 * @param {string|null} [userId]
 * @returns {Promise<{orderId: string, discountAmount: number, finalTotal: number, appliedCodes: string[]}>}
 * @throws {Error} if codes.length > 2, both codes are the same
 *   discount_type, or any coupon fails validation
 */
export async function applyCoupons(cartTotal, codes, userId = null) {
  // TODO: implement (bonus only — leave throwing if not attempting this).
  throw new Error('not implemented');
}
