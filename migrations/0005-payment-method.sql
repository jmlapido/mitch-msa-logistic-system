-- migrations/0005-payment-method.sql
ALTER TABLE rent_payments ADD COLUMN payment_method TEXT
  CHECK(payment_method IN ('cash', 'cheque'));
