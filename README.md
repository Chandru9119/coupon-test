# Coupon Engine CLI

A Node.js and PostgreSQL command-line application for creating coupons,
applying them to orders, inspecting their state, and cancelling orders.

The project implements the base requirements in [PROBLEM.md](./PROBLEM.md),
including validation, safe currency calculations, transactional updates, and
concurrency protection. It also includes the optional capped-discount,
per-user-limit, and coupon-stacking features.

## Requirements

- Node.js 20 or later
- Docker Desktop (or PostgreSQL reachable through `DATABASE_URL`)

## Setup

```
docker compose up -d
npm install
cp .env.example .env
npm run db:migrate
```

In PowerShell, create the local environment file with:

```powershell
Copy-Item .env.example .env
```

To add sample coupons for manual testing, run `npm run db:seed`.

The local `.env` file is ignored by Git and must not be committed.

## Commands

Run commands with `node src/cli.js <command> ...`.

### Create a coupon

```sh
node src/cli.js create-coupon WELCOME percent 15 20 2027-01-01T00:00:00Z 50
```

Arguments are `code`, `type`, `discountValue`, `minSpend`, `expiresAt`, and
`usageLimit`. The optional seventh argument caps a percentage discount; the
optional eighth argument sets a per-user usage limit.

### Apply one coupon

```sh
node src/cli.js apply-coupon 100 WELCOME
node src/cli.js apply-coupon 100 WELCOME user-42
```

This validates the coupon, creates an order, records the discount and final
total, and consumes one usage atomically.

### Look up a coupon

```sh
node src/cli.js get-coupon WELCOME
```

### Cancel an order

```sh
node src/cli.js cancel-order <order-id>
```

Cancelling an order releases all coupon usages associated with that order.

### Apply stacked coupons (optional bonus)

```sh
node src/cli.js apply-coupons 100 WELCOME,FLAT5 user-42
```

One or two coupon codes are accepted. A pair may contain at most one percent
coupon and one flat coupon. Percentage discounts are applied first, followed
by flat discounts. Validation and redemption occur in one transaction: if one
coupon is invalid, no order is created and neither coupon is consumed.

## Test

With PostgreSQL running and migrations applied, run:

```
npm test
```

The repository includes 18 integration tests covering the base assignment:
creation and lookup, percentage and flat discounts, minimum spend, expiry,
global usage limits, cancellation, rounding, cart-total clamping, unknown
records, and input validation.

The suite was run successfully against the Docker PostgreSQL service:

```text
tests 18
pass 18
fail 0
```

## Implementation notes

- Coupon usage is protected with PostgreSQL row locks and transactions, so
  concurrent requests cannot exceed a coupon's global usage limit.
- Orders and coupon usage changes are committed together or rolled back
  together.
- Currency outputs are rounded to two decimal places and discounts are capped
  at the cart total, so a final total can never be negative.
- Stack redemptions are stored in `order_coupons`; cancellation releases each
  recorded usage.

## Assumptions

- Coupon codes are trimmed before storage and lookup.
- A coupon whose expiry time is the current instant is treated as expired.
- Percentage discounts above 100 are rejected; flat discounts may exceed the
  cart total because the final discount is clamped.
- A coupon with a per-user limit requires a non-empty user ID.
- Capped percentage discounts are capped before the final cart-total clamp.
