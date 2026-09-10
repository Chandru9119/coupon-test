CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'flat')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  min_spend NUMERIC NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  usage_limit INTEGER NOT NULL CHECK (usage_limit > 0),
  times_used INTEGER NOT NULL DEFAULT 0,
  -- bonus 1 (capped percent discount): NULL means no cap
  max_discount_amount NUMERIC,
  -- bonus 2 (per-user usage limit): NULL means no per-user limit
  usage_limit_per_user INTEGER
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_total NUMERIC NOT NULL CHECK (cart_total >= 0),
  coupon_code TEXT REFERENCES coupons(code),
  discount_amount NUMERIC,
  final_total NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- bonus 2 (per-user usage limit): NULL if caller didn't pass a user
  user_id TEXT
);

-- bonus 3 (stackable coupons): one row per coupon applied to an order.
-- Base (non-bonus) applyCoupon may populate this too (one row) or rely
-- solely on orders.coupon_code — either is fine for base credit.
CREATE TABLE IF NOT EXISTS order_coupons (
  order_id UUID NOT NULL REFERENCES orders(id),
  code TEXT NOT NULL REFERENCES coupons(code),
  discount_amount NUMERIC NOT NULL,
  PRIMARY KEY (order_id, code)
);
