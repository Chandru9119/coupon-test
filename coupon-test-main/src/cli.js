#!/usr/bin/env node
import { createCoupon } from './commands/createCoupon.js';
import { applyCoupon } from './commands/applyCoupon.js';
import { applyCoupons } from './commands/applyCoupons.js';
import { cancelOrder } from './commands/cancelOrder.js';
import { getCoupon } from './commands/getCoupon.js';
import pool from './db.js';

const [, , cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case 'create-coupon': {
      const [
        code, discountType, discountValue, minSpend, expiresAt, usageLimit,
        maxDiscountAmount, usageLimitPerUser,
      ] = args;
      console.log(await createCoupon(
        code, discountType, Number(discountValue), Number(minSpend), expiresAt, Number(usageLimit),
        maxDiscountAmount ? Number(maxDiscountAmount) : null,
        usageLimitPerUser ? Number(usageLimitPerUser) : null
      ));
      break;
    }
    case 'apply-coupon': {
      const [cartTotal, code, userId] = args;
      console.log(await applyCoupon(Number(cartTotal), code, userId ?? null));
      break;
    }
    case 'apply-coupons': {
      // usage: apply-coupons <cartTotal> <code1>,<code2> [userId]
      const [cartTotal, codes, userId] = args;
      console.log(await applyCoupons(Number(cartTotal), codes.split(','), userId ?? null));
      break;
    }
    case 'cancel-order': {
      const [orderId] = args;
      console.log(await cancelOrder(orderId));
      break;
    }
    case 'get-coupon': {
      const [code] = args;
      console.log(await getCoupon(code));
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Usage: coupon <create-coupon|apply-coupon|apply-coupons|cancel-order|get-coupon> [args]');
      process.exitCode = 1;
  }
}

try {
  await main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
