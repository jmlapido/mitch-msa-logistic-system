-- Fix bill entries: update amounts, paid status, dates from bills.xls
-- Generated 2026-05-16T08:44:03.493Z

-- 1. Fix logo settings
INSERT OR REPLACE INTO settings (key, value) VALUES ('company_logo_key', 'branding/logo.png');
INSERT OR REPLACE INTO settings (key, value) VALUES ('company_logo_url', '/api/settings/logo/file');

-- 2. Update paid entries (real amounts + dates + invoice numbers)
UPDATE bill_entries SET amount=656.46, status='paid', paid_date='2026-01-14', invoice_no='50499' WHERE bill_id=6 AND month='2026-01';
UPDATE bill_entries SET amount=636.97, status='paid', paid_date='2026-01-14', invoice_no='50865' WHERE bill_id=7 AND month='2026-01';
UPDATE bill_entries SET amount=319.73, status='paid', paid_date='2026-01-14', invoice_no='51503' WHERE bill_id=15 AND month='2026-01';
UPDATE bill_entries SET amount=550.00, status='paid', paid_date='2026-01-23', invoice_no='659' WHERE bill_id=22 AND month='2026-01';
UPDATE bill_entries SET amount=373.58, status='paid', paid_date='2026-01-01', invoice_no=NULL WHERE bill_id=25 AND month='2026-01';
UPDATE bill_entries SET amount=2880.00, status='paid', paid_date='2026-01-28', invoice_no='434' WHERE bill_id=35 AND month='2026-01';
UPDATE bill_entries SET amount=100.00, status='paid', paid_date='2026-01-25', invoice_no='45311' WHERE bill_id=36 AND month='2026-01';
UPDATE bill_entries SET amount=84.00, status='paid', paid_date='2026-01-30', invoice_no='3' WHERE bill_id=27 AND month='2026-01';
UPDATE bill_entries SET amount=1550.00, status='paid', paid_date='2026-01-26', invoice_no='226000038' WHERE bill_id=28 AND month='2026-01';
UPDATE bill_entries SET amount=655.00, status='paid', paid_date='2026-01-01', invoice_no='127727' WHERE bill_id=30 AND month='2026-01';
UPDATE bill_entries SET amount=1000.00, status='paid', paid_date='2026-01-27', invoice_no='661' WHERE bill_id=31 AND month='2026-01';
UPDATE bill_entries SET amount=141.70, status='paid', paid_date='2026-01-14', invoice_no='51179' WHERE bill_id=32 AND month='2026-01';
UPDATE bill_entries SET amount=1000.00, status='paid', paid_date='2026-01-27', invoice_no='660' WHERE bill_id=34 AND month='2026-01';
UPDATE bill_entries SET amount=3000.00, status='paid', paid_date='2026-01-28', invoice_no='662' WHERE bill_id=38 AND month='2026-01';
UPDATE bill_entries SET amount=2580.00, status='paid', paid_date='2025-10-31', invoice_no='3056' WHERE bill_id=40 AND month='2026-01';
UPDATE bill_entries SET amount=550.00, status='paid', paid_date='2026-02-22', invoice_no='670' WHERE bill_id=22 AND month='2026-02';
UPDATE bill_entries SET amount=342.90, status='paid', paid_date='2026-02-04', invoice_no='55253' WHERE bill_id=23 AND month='2026-02';
UPDATE bill_entries SET amount=550.00, status='paid', paid_date='2026-02-02', invoice_no='66234' WHERE bill_id=26 AND month='2026-02';
UPDATE bill_entries SET amount=63.27, status='paid', paid_date='2026-02-16', invoice_no='62901' WHERE bill_id=32 AND month='2026-02';
UPDATE bill_entries SET amount=498.06, status='paid', paid_date='2026-02-16', invoice_no='64848' WHERE bill_id=7 AND month='2026-02';
UPDATE bill_entries SET amount=571.12, status='paid', paid_date='2026-02-16', invoice_no='56031' WHERE bill_id=9 AND month='2026-02';
UPDATE bill_entries SET amount=170.08, status='paid', paid_date='2026-02-16', invoice_no='67341' WHERE bill_id=15 AND month='2026-02';
UPDATE bill_entries SET amount=202.52, status='paid', paid_date='2026-03-19', invoice_no='78545' WHERE bill_id=6 AND month='2026-03';
UPDATE bill_entries SET amount=682.84, status='paid', paid_date='2026-03-19', invoice_no='36099' WHERE bill_id=7 AND month='2026-03';
UPDATE bill_entries SET amount=658.59, status='paid', paid_date='2026-03-19', invoice_no='77916' WHERE bill_id=9 AND month='2026-03';
UPDATE bill_entries SET amount=188.31, status='paid', paid_date='2026-03-19', invoice_no='55242' WHERE bill_id=15 AND month='2026-03';
UPDATE bill_entries SET amount=550.00, status='paid', paid_date='2026-03-25', invoice_no='678' WHERE bill_id=22 AND month='2026-03';
UPDATE bill_entries SET amount=318.63, status='paid', paid_date='2026-03-02', invoice_no='71062' WHERE bill_id=23 AND month='2026-03';
UPDATE bill_entries SET amount=330.15, status='paid', paid_date='2026-03-01', invoice_no=NULL WHERE bill_id=25 AND month='2026-03';
UPDATE bill_entries SET amount=550.00, status='paid', paid_date='2026-03-03', invoice_no=NULL WHERE bill_id=26 AND month='2026-03';
UPDATE bill_entries SET amount=79.17, status='paid', paid_date='2026-03-19', invoice_no='57663' WHERE bill_id=32 AND month='2026-03';
UPDATE bill_entries SET amount=4000.00, status='paid', paid_date='2026-03-10', invoice_no='674' WHERE bill_id=38 AND month='2026-03';
UPDATE bill_entries SET amount=240.00, status='paid', paid_date='2026-04-01', invoice_no='99849' WHERE bill_id=7 AND month='2026-04';
UPDATE bill_entries SET amount=500.00, status='paid', paid_date='2026-04-17', invoice_no='38191' WHERE bill_id=9 AND month='2026-04';
UPDATE bill_entries SET amount=550.00, status='paid', paid_date='2026-04-10', invoice_no='682' WHERE bill_id=22 AND month='2026-04';
UPDATE bill_entries SET amount=324.51, status='paid', paid_date='2026-04-01', invoice_no='80125' WHERE bill_id=23 AND month='2026-04';
UPDATE bill_entries SET amount=324.60, status='paid', paid_date='2026-04-01', invoice_no='78406' WHERE bill_id=25 AND month='2026-04';
UPDATE bill_entries SET amount=550.00, status='paid', paid_date='2026-04-01', invoice_no=NULL WHERE bill_id=26 AND month='2026-04';
UPDATE bill_entries SET amount=300.00, status='paid', paid_date='2026-04-07', invoice_no='5714' WHERE bill_id=37 AND month='2026-04';
UPDATE bill_entries SET amount=319.71, status='paid', paid_date='2026-04-29', invoice_no=NULL WHERE bill_id=23 AND month='2026-05';
UPDATE bill_entries SET amount=550.00, status='paid', paid_date='2026-05-02', invoice_no='667' WHERE bill_id=26 AND month='2026-05';
UPDATE bill_entries SET amount=2000.00, status='paid', paid_date='2026-05-06', invoice_no='52796' WHERE bill_id=31 AND month='2026-05';

-- 3. Update budget amounts from checklist (replaces auto-generated 0 amounts)
UPDATE bill_entries SET amount=1423.02 WHERE bill_id=9 AND month='2026-01' AND amount=0;
UPDATE bill_entries SET amount=571.00 WHERE bill_id=39 AND month='2026-01' AND amount=0;
UPDATE bill_entries SET amount=625.00 WHERE bill_id=29 AND month='2026-01' AND amount=0;
