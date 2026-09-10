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

## Test

No test suite is provided. Verify your implementation against the
behavior described in `PROBLEM.md` yourself — writing your own tests
under `test/` (`npm test` will pick them up) is encouraged but optional.

## Where to work

Implement the logic in `src/commands/*.js` — one function per file, each
stubbed with a `not implemented` error and a doc comment describing its
contract. `src/cli.js` and `src/db.js` are wired up already.
