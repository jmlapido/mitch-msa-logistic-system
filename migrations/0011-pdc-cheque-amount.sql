-- Add per-cheque amount to PDC schedule (nullable so existing rows are unaffected)
ALTER TABLE pdc_cheques ADD COLUMN amount REAL;
