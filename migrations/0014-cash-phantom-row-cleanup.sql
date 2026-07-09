-- PRODUCTION: this migration must be applied to the remote D1 database exactly
-- once, after this branch has merged and deployed, via:
--   npx wrangler d1 execute mitch-app-db --remote --file=migrations/0014-cash-phantom-row-cleanup.sql
-- Only run this with explicit human confirmation -- never automatically.

-- migrations/0014-cash-phantom-row-cleanup.sql
-- Removes phantom rent_payments rows created by the pre-fix calendar month-walk
-- for cash contracts that have a dated payment schedule: rows whose month
-- doesn't correspond to any dated pdc_cheques slot, have zero amount paid,
-- and have zero payment_entries ever recorded against them. Rows with any
-- real payment history are never touched, regardless of schedule match.

DELETE FROM rent_payments
WHERE id IN (
  SELECT rp.id FROM rent_payments rp
  JOIN contracts c ON rp.contract_id = c.id
  WHERE c.payment_type = 'cash'
    AND rp.amount_paid = 0
    AND rp.status IN ('pending', 'overdue')
    AND EXISTS (
      SELECT 1 FROM pdc_cheques pc WHERE pc.contract_id = c.id AND pc.cheque_date IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM pdc_cheques pc
      WHERE pc.contract_id = c.id AND strftime('%Y-%m', pc.cheque_date) = rp.month
    )
    AND NOT EXISTS (
      SELECT 1 FROM payment_entries pe WHERE pe.rent_payment_id = rp.id
    )
);
