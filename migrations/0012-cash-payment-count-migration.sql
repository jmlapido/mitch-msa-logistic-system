-- migrations/0012-cash-payment-count-migration.sql
-- Normalizes existing cash contracts onto the new "Number of Payments" model:
-- no_of_pdc becomes the real payment count (previously only meaningful for PDC),
-- and payment_frequency becomes 'monthly' for every cash contract (previously
-- annual/quarterly/semi-annual/monthly/custom).

-- Contracts already on the existing "custom" option (freeform manually-added
-- slots, no predetermined count) get no_of_pdc set to their actual existing
-- pdc_cheques row count.
UPDATE contracts
SET no_of_pdc = (SELECT COUNT(*) FROM pdc_cheques WHERE contract_id = contracts.id)
WHERE payment_type = 'cash' AND payment_frequency = 'custom';

-- Every other cash contract gets the frequency-equivalent count.
UPDATE contracts
SET no_of_pdc = CASE payment_frequency
  WHEN 'annual'      THEN 1
  WHEN 'quarterly'   THEN 4
  WHEN 'semi-annual' THEN 2
  ELSE 12
END
WHERE payment_type = 'cash' AND payment_frequency IN ('annual', 'quarterly', 'semi-annual');

-- Every cash contract now stores 'monthly' internally, regardless of its
-- original frequency choice.
UPDATE contracts
SET payment_frequency = 'monthly'
WHERE payment_type = 'cash';
