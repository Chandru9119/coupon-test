# Coupon Engine CLI

A command-line coupon engine backed by Node.js and PostgreSQL. Coupons discount a cart total by a percentage or flat amount, with minimum spend thresholds, expiry dates, and usage limits enforced concurrently across all sessions.

---

## Table of Contents

- [Stack](#stack)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [CLI Usage](#cli-usage)
- [Running Tests](#running-tests)
- [How It Works](#how-it-works)
- [Concurrency Design](#concurrency-design)
- [Bonus Features](#bonus-features)
- [Assumptions](#assumptions)

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM, `async/await`) |
| Database | PostgreSQL 16 |
| DB client | `pg` (node-postgres) |
| Container | Docker / Docker Compose |
| Test runner | Node.js built-in `node:test` |

---

## Project Structure

```
.
├── db/
│   ├── schema.sql        # Table definitions (coupons, orders, order_coupons)
│   ├── migrate.js        # Applies schema.sql to the database
│   └── seed.js           # Inserts sample coupons for manual testing
├── src/
│   ├── db.js             # pg connection pool (reads DATABASE_URL from .env)
│   ├── cli.js            # CLI entry point — maps commands to functions
│   └── commands/
│       ├── createCoupon.js   # Create a new coupon
│       ├── applyCoupon.js    # Validate + apply a coupon, create an order
│       ├── getCoupon.js      # Look up a coupon by code
│       ├── cancelOrder.js    # Cancel an order and release coupon usage
│       └── applyCoupons.js   # Bonus 3: stackable coupons (not implemented)
├── test/
│   └── coupon.test.js    # Automated test suite (18 tests, all passing)
├── docker-compose.yml
├── package.json
└── .env                  # DATABASE_URL (copy from .env.example)
```

---

## Setup

**Prerequisites:** Docker Desktop running, Node.js ≥ 20.

```sh
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Create the .env file
cp .env.example .env

# 4. Create the tables
npm run db:migrate

# 5. Seed sample data (optional)
npm run db:seed
```

The seed inserts three ready-to-use coupons:

| Code | Type | Value | Min Spend | Limit |
|---|---|---|---|---|
| `SAVE10` | percent | 10% | $50 | 100 |
| `FLAT5` | flat | $5 | none | 100 |
| `LASTONE` | percent | 20% | none | 1 |

---

## CLI Usage

```sh
node src/cli.js <command> [args]
```

### create-coupon

```sh
node src/cli.js create-coupon <code> <type> <value> <minSpend> <expiresAt> <usageLimit> [maxDiscountAmount] [usageLimitPerUser]
```

| Argument | Description |
|---|---|
| `code` | Unique coupon code (e.g. `SUMMER20`) |
| `type` | `percent` or `flat` |
| `value` | Discount value — percentage or fixed amount |
| `minSpend` | Minimum cart total required to use this coupon |
| `expiresAt` | Expiry date in ISO 8601 format |
| `usageLimit` | Maximum total redemptions across all users |
| `maxDiscountAmount` | *(optional)* Cap on the computed discount for percent coupons |
| `usageLimitPerUser` | *(optional)* Maximum redemptions per individual user |

**Examples:**

```sh
# 15% off, min spend $20, expires 2027, up to 50 uses
node src/cli.js create-coupon WELCOME percent 15 20 2027-01-01T00:00:00Z 50

# $5 flat off, no minimum, 100 uses
node src/cli.js create-coupon FLAT5 flat 5 0 2027-01-01T00:00:00Z 100

# 20% off, capped at $30 discount, max 2 uses per user
node src/cli.js create-coupon VIP percent 20 0 2027-01-01T00:00:00Z 200 30 2
```

---

### apply-coupon

```sh
node src/cli.js apply-coupon <cartTotal> <code> [userId]
```

Validates the coupon, computes the discount, creates an order, and increments the coupon usage count. Returns the order ID, discount amount, and final total.

```sh
node src/cli.js apply-coupon 100 WELCOME
# { orderId: 'uuid...', discountAmount: 14.7, finalTotal: 85.3 }

node src/cli.js apply-coupon 100 WELCOME user-42
# with per-user tracking
```

---

### get-coupon

```sh
node src/cli.js get-coupon <code>
```

Returns the coupon's current state, including `timesUsed`.

```sh
node src/cli.js get-coupon WELCOME
# { code: 'WELCOME', discountType: 'percent', discountValue: 15,
#   minSpend: 20, usageLimit: 50, timesUsed: 1, expiresAt: ... }
```

---

### cancel-order

```sh
node src/cli.js cancel-order <orderId>
```

Marks the order as cancelled. If the order used a coupon, decrements `timesUsed` so the slot is available again.

```sh
node src/cli.js cancel-order 4b3e2a1d-...
# Order '4b3e2a1d-...' has been cancelled. Coupon 'WELCOME' usage released.
```

---

## Running Tests

With the database running and migrated:

```sh
npm test
```

Expected output:

```
▶ Coupon Engine
  ✔ 1. getCoupon returns correct fields and timesUsed = 0 after creation
  ✔ 2. percent coupon: discount = cartTotal × rate × 0.98, rounded to 2 dp
  ✔ 3. flat coupon: discount = fixed amount, finalTotal = cartTotal - discount
  ✔ 4. rejects cart total below min_spend
  ✔ 5. rejects expired coupon
  ✔ 6. rejects coupon that has reached its usage_limit
  ✔ 7. rejects an unknown coupon code with a clear error
  ✔ 8. cancelling an order decrements timesUsed back to its pre-apply value
  ✔ E1. discount is clamped so finalTotal is never negative
  ✔ E2. cancelling an already-cancelled order is rejected
  ✔ E3. cancelling an unknown order ID is rejected
  ✔ E4. decimal cart total produces clean 2-dp currency values
  ✔ V1. createCoupon rejects invalid discount type
  ✔ V2. createCoupon rejects percent discount > 100
  ✔ V3. createCoupon rejects negative discountValue
  ✔ V4. createCoupon rejects non-integer usageLimit
  ✔ V5. createCoupon rejects empty coupon code
  ✔ V6. getCoupon rejects unknown code with a specific error
✔ Coupon Engine
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

The test suite creates its own isolated data (all coupon codes prefixed `T_`) and cleans up before and after every run, so it is safe to run against a database that already has seed or production data.

---

## How It Works

### Discount calculation

| Type | Formula |
|---|---|
| `percent` | `cartTotal × (value / 100) × 0.98` |
| `flat` | `value` |

The `× 0.98` factor is a payment-gateway processing adjustment applied to all percentage discounts. Both types are rounded to exactly 2 decimal places. The final total is clamped to a minimum of `0` — a coupon can never make a cart total negative.

### Validation rules enforced on `applyCoupon`

1. Coupon code must exist.
2. Cart total must be ≥ `min_spend`.
3. Current time must be before `expires_at`.
4. `times_used` must be < `usage_limit`.
5. *(If bonus per-user limit is set)* User's active redemption count must be < `usage_limit_per_user`.

### Error messages

Every rejection produces a specific, human-readable error:

| Situation | Error |
|---|---|
| Unknown coupon | `Coupon 'X' not found` |
| Below min spend | `Cart total N is below the minimum spend of M required for coupon 'X'` |
| Expired | `Coupon 'X' has expired` |
| Usage limit reached | `Coupon 'X' has reached its usage limit` |
| Per-user limit reached | `You have reached the per-user usage limit for coupon 'X'` |
| Unknown order | `Order 'X' not found` |
| Already cancelled | `Order 'X' is already cancelled` |
| Invalid input | Specific message per field (e.g. `usage_limit must be a positive integer`) |

---

## Concurrency Design

The engine is safe when multiple sessions redeem or cancel the same coupon simultaneously. The invariant:

```
coupons.times_used = count of active (non-cancelled) redemptions
```

is always maintained, even under concurrent load.

### applyCoupon

```
BEGIN
  SELECT * FROM coupons WHERE code = $1 FOR UPDATE  ← exclusive row lock
  -- validate: existence, min_spend, expiry, usage_limit, per-user limit
  INSERT INTO orders ...
  UPDATE coupons SET times_used = times_used + 1 ...
COMMIT / ROLLBACK
```

The `SELECT … FOR UPDATE` means that if two sessions try to redeem the same coupon at the same time, the second one blocks until the first either commits (and then sees the updated `times_used`) or rolls back. This guarantees `times_used` never exceeds `usage_limit`, even with a limit of 1.

### cancelOrder

```
BEGIN
  SELECT * FROM orders WHERE id = $1 FOR UPDATE  ← exclusive row lock
  -- validate: existence, status = 'pending'
  UPDATE orders SET status = 'cancelled' ...
  UPDATE coupons SET times_used = GREATEST(times_used - 1, 0) ...
COMMIT / ROLLBACK
```

The order row lock prevents two concurrent cancellations of the same order from both decrementing the coupon count. The `UPDATE` on the coupon row will block if a concurrent `applyCoupon` holds a `FOR UPDATE` lock on that coupon, so increment and decrement operations are properly serialised. There is no deadlock risk: `applyCoupon` only ever locks the coupon row (and inserts a brand-new order row); `cancelOrder` locks the order row first and then the coupon via `UPDATE` — there is no cycle.

---

## Bonus Features

| Bonus | Status |
|---|---|
| **Bonus 1 — Capped percent discount** (`max_discount_amount`) | ✅ Implemented |
| **Bonus 2 — Per-user usage limit** (`usage_limit_per_user`, `user_id`) | ✅ Implemented |
| **Bonus 3 — Stackable coupons** (`applyCoupons`) | ❌ Not implemented |

### Bonus 1: capped percent discount

Pass `maxDiscountAmount` as the 7th argument to `create-coupon`. The computed percent discount is capped at this value before the cart-total clamp is applied.

```sh
# 50% off but never more than $30
node src/cli.js create-coupon HALFOFF percent 50 0 2027-01-01T00:00:00Z 100 30
node src/cli.js apply-coupon 200 HALFOFF
# discount = min(200 × 50% × 0.98, 30) = min(98, 30) = 30
```

### Bonus 2: per-user usage limit

Pass `usageLimitPerUser` as the 8th argument to `create-coupon`, and `userId` as the 3rd argument to `apply-coupon`.

```sh
node src/cli.js create-coupon ONCEPP flat 5 0 2027-01-01T00:00:00Z 1000 null 1
node src/cli.js apply-coupon 50 ONCEPP alice   # succeeds
node src/cli.js apply-coupon 50 ONCEPP alice   # rejected: per-user limit reached
node src/cli.js apply-coupon 50 ONCEPP bob     # succeeds (different user)
```

---

## Assumptions

The spec left several edge cases unspecified. These are the decisions made:

| Topic | Decision |
|---|---|
| Percent discount adjustment | Per `AGENTS.md`: the raw percentage is multiplied by **0.98** (payment-gateway adjustment) before rounding. |
| Expiry date at creation | Not required to be in the future — any valid ISO date string is accepted. A coupon with a past expiry is stored but immediately rejected on use. |
| `usage_limit_per_user` with no `userId` | Throws a clear error rather than silently skipping the check. Prevents misuse of limit-enforced coupons. |
| `percent` discount value > 100 | Rejected — a percentage above 100% is nonsensical. |
| `flat` discount value > 100 | Allowed — a flat amount can legally exceed 100 (it will be clamped by the cart total). |
| Final total below zero | Clamped: discount is reduced so `finalTotal` is at minimum `0`. |
| Double cancellation | Throws `Order 'X' is already cancelled` — not silently ignored. |
| `times_used` floor on release | `GREATEST(times_used - 1, 0)` is used as a safety floor against any unforeseen data inconsistency. |
| Bonus 3 (stacking) | Not implemented — base assignment is fully correct and tested first, as instructed. |
