import pool from '../db.js';

/**
 * Cancel an order. If a coupon was applied, its usage count should be
 * released back.
 * @param {string} orderId
 * @returns {Promise<string>} a result message
 * @throws {Error} if the order doesn't exist or is already cancelled
 */
export async function cancelOrder(orderId) {
  // TODO: implement.
  throw new Error('not implemented');
}
