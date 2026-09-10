/**
 * Automated test suite for the Coupon Engine CLI.
 * Run with:  npm test
 *
 * Requires a running PostgreSQL instance (docker compose up -d)
 * with migrations applied (npm run db:migrate).
 *
 * All test coupons use the prefix T_ so the cleanup queries are scoped
 * and will never touch production/seed data.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createCoupon } from '../src/commands/createCoupon.js';
import { applyCoupon }  from '../src/commands/applyCoupon.js';
import { getCoupon }    from '../src/commands/getCoupon.js';
import { cancelOrder }  from '../src/commands/cancelOrder.js';
import pool             from '../src/db.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const FUTURE = '2030-01-01T00:00:00Z';
const PAST   = '2000-01-01T00:00:00Z';

async function cleanup() {
  // Delete in FK order: order_coupons → orders → coupons
  await pool.query(`
    DELETE FROM order_coupons
    WHERE order_id IN (
      SELECT id FROM orders WHERE coupon_code LIKE 'T!_%' ESCAPE '!'
    )
  `);
  await pool.query("DELETE FROM orders WHERE coupon_code LIKE 'T!_%' ESCAPE '!'");
  await pool.query("DELETE FROM coupons WHERE code LIKE 'T!_%' ESCAPE '!'");
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('Coupon Engine', () => {

  before(async () => {
    await cleanup();
    // Create the shared coupons used across multiple tests
    await createCoupon('T_PCT',  'percent', 15, 20, FUTURE, 50);   // 15%, min $20
    await createCoupon('T_FLAT', 'flat',     5,  0, FUTURE, 100);  // $5 off, no min
    await createCoupon('T_EXP',  'percent', 10,  0, PAST,   100);  // already expired
  });

  after(async () => {
    await cleanup();
    await pool.end();
  });

  // ── 1. create + get ────────────────────────────────────────────────────────

  it('1. getCoupon returns correct fields and timesUsed = 0 after creation', async () => {
    const c = await getCoupon('T_PCT');
    assert.equal(c.code,          'T_PCT');
    assert.equal(c.discountType,  'percent');
    assert.equal(c.discountValue, 15);
    assert.equal(c.minSpend,      20);
    assert.equal(c.usageLimit,    50);
    assert.equal(c.timesUsed,     0);
    assert.ok(c.expiresAt instanceof Date || typeof c.expiresAt === 'string',
      'expiresAt should be present');
  });

  // ── 2. percent coupon math ─────────────────────────────────────────────────

  it('2. percent coupon: discount = cartTotal × rate × 0.98, rounded to 2 dp', async () => {
    // 100 × 15% × 0.98 = 14.70
    const { orderId, discountAmount, finalTotal } = await applyCoupon(100, 'T_PCT');
    assert.equal(discountAmount, 14.7,  'discountAmount should be 14.70');
    assert.equal(finalTotal,     85.3,  'finalTotal should be 85.30');
    assert.ok(typeof orderId === 'string' && orderId.length > 0, 'orderId should be a UUID string');
    await cancelOrder(orderId); // release usage for later tests
  });

  // ── 3. flat coupon ─────────────────────────────────────────────────────────

  it('3. flat coupon: discount = fixed amount, finalTotal = cartTotal - discount', async () => {
    const { orderId, discountAmount, finalTotal } = await applyCoupon(50, 'T_FLAT');
    assert.equal(discountAmount, 5,  'discountAmount should be 5');
    assert.equal(finalTotal,    45,  'finalTotal should be 45');
    await cancelOrder(orderId);
  });

  // ── 4. below min_spend ─────────────────────────────────────────────────────

  it('4. rejects cart total below min_spend', async () => {
    // T_PCT requires min_spend = 20; cart = 10
    await assert.rejects(
      () => applyCoupon(10, 'T_PCT'),
      /minimum spend/i
    );
  });

  // ── 5. expired coupon ──────────────────────────────────────────────────────

  it('5. rejects expired coupon', async () => {
    await assert.rejects(
      () => applyCoupon(100, 'T_EXP'),
      /expired/i
    );
  });

  // ── 6. usage limit ─────────────────────────────────────────────────────────

  it('6. rejects coupon that has reached its usage_limit', async () => {
    await createCoupon('T_ONCE', 'flat', 1, 0, FUTURE, 1); // limit = 1
    const { orderId } = await applyCoupon(50, 'T_ONCE');   // uses the one slot
    await assert.rejects(
      () => applyCoupon(50, 'T_ONCE'),                     // should be rejected
      /usage limit/i
    );
    await cancelOrder(orderId); // tidy up
  });

  // ── 7. unknown coupon ──────────────────────────────────────────────────────

  it('7. rejects an unknown coupon code with a clear error', async () => {
    await assert.rejects(
      () => applyCoupon(100, 'T_DOESNOTEXIST'),
      /not found/i
    );
  });

  // ── 8. cancel releases usage ───────────────────────────────────────────────

  it('8. cancelling an order decrements timesUsed back to its pre-apply value', async () => {
    const { orderId } = await applyCoupon(100, 'T_PCT');

    const beforeCancel = await getCoupon('T_PCT');
    await cancelOrder(orderId);
    const afterCancel = await getCoupon('T_PCT');

    assert.equal(
      Number(afterCancel.timesUsed),
      Number(beforeCancel.timesUsed) - 1,
      'timesUsed should decrease by exactly 1 after cancellation'
    );
  });

  // ── edge: discount exceeds cart total ──────────────────────────────────────

  it('E1. discount is clamped so finalTotal is never negative', async () => {
    await createCoupon('T_BIG', 'flat', 9999, 0, FUTURE, 10);
    const { orderId, discountAmount, finalTotal } = await applyCoupon(5, 'T_BIG');
    assert.equal(discountAmount, 5, 'discount should be clamped to cartTotal');
    assert.equal(finalTotal,     0, 'finalTotal should be 0, not negative');
    await cancelOrder(orderId);
  });

  // ── edge: double cancellation ──────────────────────────────────────────────

  it('E2. cancelling an already-cancelled order is rejected', async () => {
    await createCoupon('T_DBL', 'flat', 1, 0, FUTURE, 5);
    const { orderId } = await applyCoupon(50, 'T_DBL');
    await cancelOrder(orderId);
    await assert.rejects(
      () => cancelOrder(orderId),
      /already cancelled/i
    );
  });

  // ── edge: unknown order id ─────────────────────────────────────────────────

  it('E3. cancelling an unknown order ID is rejected', async () => {
    await assert.rejects(
      () => cancelOrder('00000000-0000-0000-0000-000000000000'),
      /not found/i
    );
  });

  // ── edge: decimal cart total ───────────────────────────────────────────────

  it('E4. decimal cart total produces clean 2-dp currency values', async () => {
    // 33.33 × 15% × 0.98 = 4.899...  → rounds to 4.9
    const { orderId, discountAmount, finalTotal } = await applyCoupon(33.33, 'T_PCT');
    assert.ok(Number.isFinite(discountAmount), 'discountAmount should be a finite number');
    assert.ok(Number.isFinite(finalTotal),     'finalTotal should be a finite number');
    // Verify exactly 2 decimal places (no floating-point garbage)
    assert.equal(
      discountAmount,
      parseFloat(discountAmount.toFixed(2)),
      'discountAmount must be rounded to 2 dp'
    );
    assert.equal(
      finalTotal,
      parseFloat(finalTotal.toFixed(2)),
      'finalTotal must be rounded to 2 dp'
    );
    await cancelOrder(orderId);
  });

  // ── validation: createCoupon inputs ───────────────────────────────────────

  it('V1. createCoupon rejects invalid discount type', async () => {
    await assert.rejects(
      () => createCoupon('T_V1', 'invalid', 10, 0, FUTURE, 5),
      /discount_type/i
    );
  });

  it('V2. createCoupon rejects percent discount > 100', async () => {
    await assert.rejects(
      () => createCoupon('T_V2', 'percent', 150, 0, FUTURE, 5),
      /cannot exceed 100/i
    );
  });

  it('V3. createCoupon rejects negative discountValue', async () => {
    await assert.rejects(
      () => createCoupon('T_V3', 'flat', -5, 0, FUTURE, 5),
      /positive/i
    );
  });

  it('V4. createCoupon rejects non-integer usageLimit', async () => {
    await assert.rejects(
      () => createCoupon('T_V4', 'flat', 5, 0, FUTURE, 2.5),
      /positive integer/i
    );
  });

  it('V5. createCoupon rejects empty coupon code', async () => {
    await assert.rejects(
      () => createCoupon('', 'flat', 5, 0, FUTURE, 5),
      /non-empty/i
    );
  });

  it('V6. getCoupon rejects unknown code with a specific error', async () => {
    await assert.rejects(
      () => getCoupon('T_GHOST'),
      /not found/i
    );
  });

});
