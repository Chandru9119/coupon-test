import pool from '../db.js';

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateDiscount(coupon, cartTotal) {
  let discountAmount = coupon.discount_type === 'percent'
    ? cartTotal * (Number(coupon.discount_value) / 100) * 0.98
    : Number(coupon.discount_value);

  if (coupon.discount_type === 'percent' && coupon.max_discount_amount !== null) {
    discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
  }
  return roundCurrency(Math.min(discountAmount, cartTotal));
}

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
  if (!Number.isFinite(cartTotal) || cartTotal < 0) {
    throw new Error('cart_total must be a non-negative number');
  }
  if (!Array.isArray(codes) || codes.length < 1 || codes.length > 2) {
    throw new Error('Apply one or two coupon codes');
  }
  if (userId !== null && (typeof userId !== 'string' || userId.trim() === '')) {
    throw new Error('user_id must be a non-empty string when provided');
  }

  const normalizedCodes = codes.map((code) => {
    if (typeof code !== 'string' || code.trim() === '') {
      throw new Error('Coupon codes must be non-empty strings');
    }
    return code.trim();
  });
  if (new Set(normalizedCodes).size !== normalizedCodes.length) {
    throw new Error('A coupon code can only be applied once per order');
  }

  const normalizedUserId = userId === null ? null : userId.trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const couponResult = await client.query(
      `SELECT * FROM coupons
       WHERE code = ANY($1::text[])
       ORDER BY code
       FOR UPDATE`,
      [normalizedCodes]
    );
    if (couponResult.rows.length !== normalizedCodes.length) {
      const foundCodes = new Set(couponResult.rows.map(({ code }) => code));
      const missingCode = normalizedCodes.find((code) => !foundCodes.has(code));
      throw new Error(`Coupon '${missingCode}' not found`);
    }

    const coupons = couponResult.rows;
    if (new Set(coupons.map(({ discount_type: type }) => type)).size !== coupons.length) {
      throw new Error('Only one percent coupon and one flat coupon can be stacked');
    }

    for (const coupon of coupons) {
      if (cartTotal < Number(coupon.min_spend)) {
        throw new Error(`Cart total ${cartTotal} is below the minimum spend of ${coupon.min_spend} required for coupon '${coupon.code}'`);
      }
      if (new Date() >= new Date(coupon.expires_at)) {
        throw new Error(`Coupon '${coupon.code}' has expired`);
      }
      if (coupon.times_used >= coupon.usage_limit) {
        throw new Error(`Coupon '${coupon.code}' has reached its usage limit`);
      }
      if (coupon.usage_limit_per_user !== null) {
        if (normalizedUserId === null) {
          throw new Error(`Coupon '${coupon.code}' requires a user ID (it has a per-user usage limit)`);
        }
        const usageResult = await client.query(
          `SELECT COUNT(DISTINCT orders.id) AS count
           FROM orders
           LEFT JOIN order_coupons ON order_coupons.order_id = orders.id
           WHERE orders.status <> 'cancelled'
             AND orders.user_id = $1
             AND (order_coupons.code = $2
                  OR (order_coupons.order_id IS NULL AND orders.coupon_code = $2))`,
          [normalizedUserId, coupon.code]
        );
        if (Number(usageResult.rows[0].count) >= coupon.usage_limit_per_user) {
          throw new Error(`You have reached the per-user usage limit for coupon '${coupon.code}'`);
        }
      }
    }

    // Percentage coupons are applied before flat coupons.
    const orderedCoupons = [...coupons].sort((left, right) => (
      left.discount_type === 'percent' ? -1 : right.discount_type === 'percent' ? 1 : 0
    ));
    let finalTotal = roundCurrency(cartTotal);
    const appliedCoupons = orderedCoupons.map((coupon) => {
      const discountAmount = calculateDiscount(coupon, finalTotal);
      finalTotal = roundCurrency(finalTotal - discountAmount);
      return { code: coupon.code, discountAmount };
    });
    const discountAmount = roundCurrency(cartTotal - finalTotal);

    const orderResult = await client.query(
      `INSERT INTO orders (cart_total, discount_amount, final_total, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [cartTotal, discountAmount, finalTotal, normalizedUserId]
    );
    const orderId = orderResult.rows[0].id;
    for (const coupon of appliedCoupons) {
      await client.query(
        `INSERT INTO order_coupons (order_id, code, discount_amount) VALUES ($1, $2, $3)`,
        [orderId, coupon.code, coupon.discountAmount]
      );
      await client.query(`UPDATE coupons SET times_used = times_used + 1 WHERE code = $1`, [coupon.code]);
    }

    await client.query('COMMIT');
    return {
      orderId,
      discountAmount,
      finalTotal,
      appliedCodes: appliedCoupons.map(({ code }) => code),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
