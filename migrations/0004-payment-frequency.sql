-- migrations/0004-payment-frequency.sql
ALTER TABLE contracts ADD COLUMN payment_frequency TEXT NOT NULL DEFAULT 'monthly'
  CHECK(payment_frequency IN ('monthly', 'annual'));
