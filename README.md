# Coupon Engine CLI — starter

See [`PROBLEM.md`](./PROBLEM.md) for the full spec, test cases, and
acceptance criteria.

## Setup

```
docker compose up -d
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
```

## Run

```
node src/cli.js create-coupon WELCOME percent 15 20 2027-01-01T00:00:00Z 50
node src/cli.js apply-coupon 100 WELCOME
node src/cli.js get-coupon WELCOME
node src/cli.js cancel-order <order-id>
```

### Optional stacking command

```sh
node src/cli.js apply-coupons 100 WELCOME,FLAT5 user-42
```

`apply-coupons` accepts one or two comma-separated codes. It allows at most
one percent coupon and one flat coupon; the percent discount is applied first.
Both coupons are validated and consumed in one transaction, so an invalid
coupon leaves no order and no redemption behind. Cancelling a stacked order
releases every coupon usage recorded for that order.

## Test

An automated test suite is included under `test/`. With
PostgreSQL running and migrations applied, run:

```
npm test
```

## Where to work

The command logic lives in `src/commands/`; `src/cli.js` and `src/db.js`
provide the CLI and database wiring.

## Assumptions and optional features

- Duplicate coupon codes are rejected with a clear error.
- A coupon expiring at the current instant is expired.
- A per-user-limited coupon requires a non-empty user ID.
- A capped percent discount is capped before the cart-total clamp.
- The optional stacking command uses `order_coupons` to preserve each
  redemption and applies percent before flat discounts.
