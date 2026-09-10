# Assignment: Coupon Engine CLI

## Overview

Build a command-line coupon engine backed by PostgreSQL. Coupons discount
an order's cart total (percent or flat amount), have a minimum spend, an
expiry date, and a usage limit shared across everyone who redeems them.

Stack: Node.js + PostgreSQL (already wired up in
this repo — see README for setup).

## What you're building

Implement the logic in these four files. Each is stubbed with a
`not implemented` error and a doc comment stating its contract. Nothing
else in the repo needs to change.

- `src/commands/createCoupon.js` — create a new coupon
- `src/commands/applyCoupon.js` — validate a coupon against a cart total,
  compute the discount, create an order recording the result, and count
  the redemption against the coupon's usage limit
- `src/commands/getCoupon.js` — look up a coupon's current state
- `src/commands/cancelOrder.js` — cancel an order; if it used a coupon,
  that usage should no longer count against the limit

`src/commands/applyCoupons.js` is a fifth stub for bonus task 3 below —
ignore it unless you're attempting that bonus.

## Rules

- `discount_type` is either `percent` (percentage off) or `flat` (fixed
  amount off).
- A coupon can't be applied if the cart total is below `min_spend`.
- A coupon can't be applied once it's past its `expires_at`.
- A coupon can't be applied more times than its `usage_limit` across all
  orders combined.
- Cancelling an order should make its coupon usage available again.
- Round all currency values (discount amount, final total) to 2 decimal
  places.
- A coupon can never bring a cart's final total below 0.

## Basic test cases (must pass)

No test file is provided — these describe expected behavior; verify it
yourself.

1. Create a coupon, then look it up — fields match what was created,
   `times_used` starts at 0.
2. Applying a `percent` coupon computes the correct discount and final
   total.
3. Applying a `flat` coupon computes the correct discount and final total.
4. Applying a coupon below its `min_spend` is rejected.
5. Applying an expired coupon is rejected.
6. Applying a coupon already at its `usage_limit` is rejected.
7. Applying an unknown coupon code is rejected.
8. Cancelling an order that used a coupon releases that usage back —
   `times_used` decreases accordingly.

## Acceptance criteria

- All basic test cases pass.
- `coupons.times_used` is always accurate — never drifts from the true
  count of active (non-cancelled) redemptions, no matter how the commands
  are called or in what order.
- The engine behaves correctly and predictably when the same coupon or
  order is acted on from multiple terminal sessions at the same time.
- Numeric results (discounts, totals) are sensible currency values, not
  raw floating-point artifacts.
- Clear, specific error messages for every rejection case above.
- Code is readable; commit history tells a story (not one giant commit).
- Short note in your PR/README on any assumption you made that the spec
  didn't cover.

## Bonus tasks (optional)

Not required to pass. Attempt these only after the base assignment is
solid — they carry extra weight in review, but a broken base with bonus
work attached scores lower than a clean base alone. The schema already
has the columns/table you need (see `db/schema.sql`) — nothing to add
yourself. Function signatures below are fixed; keep them exact so your
submission can be tested automatically.

1. **Capped percent discount.** `coupons.max_discount_amount` (nullable).
   `createCoupon`'s 7th argument, `maxDiscountAmount`. A percent coupon's
   computed discount should never exceed this cap, even before the
   cart-total clamp already required above. Think through what happens
   when the cap, the min spend, and the cart total all interact on the
   same order.

2. **Per-user usage limit.** `coupons.usage_limit_per_user` (nullable),
   `orders.user_id` (nullable). `createCoupon`'s 8th argument,
   `usageLimitPerUser`; `applyCoupon`'s 3rd argument, `userId`. A coupon
   should enforce both its global `usage_limit` and, independently, how
   many times a single user has redeemed it — correctly, even when a
   burst of requests for the same coupon arrives from several different
   users at once.

3. **Stackable coupons.** Implement `src/commands/applyCoupons.js`
   (already stubbed — `applyCoupons(cartTotal, codes, userId)`, `codes`
   is an array of 1-2 codes). Allow at most one `percent` and one `flat`
   coupon on one order, applied in a well-defined order you choose and
   document (in the same file, as a comment). Reject stacking two of the
   same type. If either coupon in the pair is invalid (expired, over
   limit, etc.), neither should be consumed and no order created — the
   whole apply is all-or-nothing. Record each applied coupon as a row in
   `order_coupons`.

## Submission

Push to your own repo (fork or fresh, your call) and share the link.
Include instructions if you deviated from the provided setup.
