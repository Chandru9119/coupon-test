import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyCoupon } from '../src/commands/applyCoupon.js';
import { cancelOrder } from '../src/commands/cancelOrder.js';
import { createCoupon } from '../src/commands/createCoupon.js';
import { getCoupon } from '../src/commands/getCoupon.js';
import pool from '../src/db.js';

const FUTURE = '2030-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

async function cleanup() {
  await pool.query(`
    DELETE FROM order_coupons
    WHERE order_id IN (SELECT id FROM orders WHERE coupon_code LIKE 'T!_%' ESCAPE '!')
  `);
  await pool.query("DELETE FROM orders WHERE coupon_code LIKE 'T!_%' ESCAPE '!'");
  await pool.query("DELETE FROM coupons WHERE code LIKE 'T!_%' ESCAPE '!'");
}

describe('Coupon Engine', () => {
  before(async () => {
    await cleanup();
    await createCoupon('T_PCT', 'percent', 15, 20, FUTURE, 50);
    await createCoupon('T_FLAT', 'flat', 5, 0, FUTURE, 100);
    await createCoupon('T_EXP', 'percent', 10, 0, PAST, 100);
  });

  after(async () => {
    await cleanup();
    await pool.end();
  });

  it('creates and gets a coupon with zero uses', async () => {
    const coupon = await getCoupon('T_PCT');
    assert.equal(coupon.code, 'T_PCT');
    assert.equal(coupon.discountType, 'percent');
    assert.equal(coupon.discountValue, 15);
    assert.equal(coupon.minSpend, 20);
    assert.equal(coupon.usageLimit, 50);
    assert.equal(coupon.timesUsed, 0);
  });

  it('calculates a percent discount', async () => {
    const { orderId, discountAmount, finalTotal } = await applyCoupon(100, 'T_PCT');
    assert.equal(discountAmount, 14.7);
    assert.equal(finalTotal, 85.3);
    await cancelOrder(orderId);
  });

  it('calculates a flat discount', async () => {
    const { orderId, discountAmount, finalTotal } = await applyCoupon(50, 'T_FLAT');
    assert.equal(discountAmount, 5);
    assert.equal(finalTotal, 45);
    await cancelOrder(orderId);
  });

  it('rejects a cart below min spend', async () => {
    await assert.rejects(() => applyCoupon(10, 'T_PCT'), /minimum spend/i);
  });

  it('rejects an expired coupon', async () => {
    await assert.rejects(() => applyCoupon(100, 'T_EXP'), /expired/i);
  });

  it('rejects a coupon at its usage limit', async () => {
    await createCoupon('T_ONCE', 'flat', 1, 0, FUTURE, 1);
    const { orderId } = await applyCoupon(50, 'T_ONCE');
    await assert.rejects(() => applyCoupon(50, 'T_ONCE'), /usage limit/i);
    await cancelOrder(orderId);
  });

  it('rejects an unknown coupon', async () => {
    await assert.rejects(() => applyCoupon(100, 'T_DOESNOTEXIST'), /not found/i);
  });

  it('releases coupon usage after cancellation', async () => {
    const { orderId } = await applyCoupon(100, 'T_PCT');
    const beforeCancel = await getCoupon('T_PCT');
    await cancelOrder(orderId);
    const afterCancel = await getCoupon('T_PCT');
    assert.equal(afterCancel.timesUsed, beforeCancel.timesUsed - 1);
  });

  it('never produces a negative final total', async () => {
    await createCoupon('T_BIG', 'flat', 9999, 0, FUTURE, 10);
    const { orderId, discountAmount, finalTotal } = await applyCoupon(5, 'T_BIG');
    assert.equal(discountAmount, 5);
    assert.equal(finalTotal, 0);
    await cancelOrder(orderId);
  });

  it('rejects double cancellation', async () => {
    await createCoupon('T_DBL', 'flat', 1, 0, FUTURE, 5);
    const { orderId } = await applyCoupon(50, 'T_DBL');
    await cancelOrder(orderId);
    await assert.rejects(() => cancelOrder(orderId), /already cancelled/i);
  });

  it('rejects an unknown order', async () => {
    await assert.rejects(
      () => cancelOrder('00000000-0000-0000-0000-000000000000'),
      /not found/i
    );
  });

  it('rounds currency values to two decimals', async () => {
    const { orderId, discountAmount, finalTotal } = await applyCoupon(33.33, 'T_PCT');
    assert.equal(discountAmount, Number(discountAmount.toFixed(2)));
    assert.equal(finalTotal, Number(finalTotal.toFixed(2)));
    await cancelOrder(orderId);
  });

  it('rejects an invalid discount type', async () => {
    await assert.rejects(() => createCoupon('T_V1', 'invalid', 10, 0, FUTURE, 5), /discount_type/i);
  });

  it('rejects a percent discount above 100', async () => {
    await assert.rejects(() => createCoupon('T_V2', 'percent', 150, 0, FUTURE, 5), /cannot exceed 100/i);
  });

  it('rejects a negative discount value', async () => {
    await assert.rejects(() => createCoupon('T_V3', 'flat', -5, 0, FUTURE, 5), /positive/i);
  });

  it('rejects a non-integer usage limit', async () => {
    await assert.rejects(() => createCoupon('T_V4', 'flat', 5, 0, FUTURE, 2.5), /positive integer/i);
  });

  it('rejects an empty coupon code', async () => {
    await assert.rejects(() => createCoupon('', 'flat', 5, 0, FUTURE, 5), /non-empty/i);
  });

  it('rejects an unknown coupon lookup', async () => {
    await assert.rejects(() => getCoupon('T_GHOST'), /not found/i);
  });
});
