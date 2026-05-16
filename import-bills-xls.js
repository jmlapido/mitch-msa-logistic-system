// Comprehensive bills.xls → bill_entries SQL generator
// Uses Bill paying checklist (amounts) + BILLS MONTHLY (paid dates/invoices)
const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('bills.xls');

// ── Helper: Excel serial date → YYYY-MM-DD ───────────────────────────────────
function excelDate(serial) {
  if (!serial || typeof serial === 'string') return null;
  return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}
function getMonth(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : null;
}

// ── Parse BILLS MONTHLY (Jan-May 2026 actual payments) ──────────────────────
const monthly = wb.Sheets['BILLS  MONTHLY'];
const monthlyRows = XLSX.utils.sheet_to_json(monthly, { header: 1, defval: null });

// Sections: [month, colStart] for DATE,PARTICULARS,INVOICE,AMOUNT
const SECTIONS = [
  { month: '2026-01', col: 1 },
  { month: '2026-02', col: 6 },
  { month: '2026-03', col: 11 },
  { month: '2026-04', col: 16 },
  { month: '2026-05', col: 21 },
];

// Build flat list of all actual payments
const payments = [];
for (const sec of SECTIONS) {
  for (const row of monthlyRows.slice(2)) {
    const dateRaw = row[sec.col];
    const part    = row[sec.col + 1];
    const inv     = row[sec.col + 2];
    const amt     = row[sec.col + 3];
    if (!dateRaw || !part || !amt) continue;
    const dateStr = excelDate(dateRaw);
    if (!dateStr) continue;
    payments.push({ month: sec.month, date: dateStr, part: String(part).trim().toUpperCase(), inv: String(inv ?? '').trim(), amt: Number(amt) });
  }
}

// Find a payment by partial name match and amount (returns first match)
function findPayment(month, namePart, amount) {
  return payments.find(p =>
    p.month === month &&
    p.part.includes(namePart.toUpperCase()) &&
    Math.abs(p.amt - amount) < 0.01
  ) || null;
}
// Find payment by name only (any amount) for a given month
function findPaymentByName(month, namePart) {
  return payments.filter(p =>
    p.month === month && p.part.includes(namePart.toUpperCase())
  );
}

// ── Parse Bill paying checklist (budget amounts Jan-Dec 2026) ───────────────
const checklist = wb.Sheets['Bill paying checklist'];
const clRows = XLSX.utils.sheet_to_json(checklist, { header: 1, defval: null });

// Row → bill_id mapping
const ROW_TO_BILL = {
  4:  { id: 1,  name: 'FEWA',     match: 'VILLA 1' },
  5:  { id: 2,  name: 'Sewerage', match: 'VILLA 1 SEWER' },
  6:  { id: 3,  name: 'FEWA',     match: 'VILLA 2 FEWA' },
  7:  { id: 4,  name: 'Sewerage', match: 'VILLA 2 SEWER' },
  8:  { id: 5,  name: 'FEWA',     match: 'OFFICE FEWA' },
  9:  { id: 6,  name: 'Sewerage', match: 'OFFICE ELECT' },
  10: { id: 7,  name: 'FEWA',     match: 'SAEED PLAZA ELECT' },
  11: { id: 8,  name: 'Sewerage', match: 'SAEED SEWER' },
  12: { id: 9,  name: 'FEWA',     match: 'MARYAM PLAZA ELECT' },
  13: { id: 10, name: 'Sewerage', match: 'MARYAM SEWER' },
  14: { id: 11, name: 'FEWA',     match: 'ALSADA 1 FEWA' },
  15: { id: 12, name: 'Sewerage', match: 'ALSADA 1 SEWER' },
  16: { id: 13, name: 'FEWA',     match: 'ALSADA 8 FEWA' },
  18: { id: 14, name: 'FEWA',     match: 'ALSADA 9 FEWA' },
  20: { id: 15, name: 'FEWA',     match: 'AHMED FLAT' },
  22: { id: 16, name: 'FEWA',     match: 'MANAMA FEWA' },
  23: { id: 17, name: 'Sewerage', match: 'MANAMA SEWER' },
  24: { id: 18, name: 'FEWA',     match: 'INFUSION FEWA' },
  25: { id: 19, name: 'Sewerage', match: 'INFUSION SEWER' },
  26: { id: 20, name: 'FEWA',     match: 'GYM FEWA' },
  27: { id: 21, name: 'Sewerage', match: 'GYM SEWER' },
  28: { id: 22, name: 'Internet', match: 'OFFICE NET' },
  29: { id: 23, name: 'Boss DU',  match: 'BOSS DU' },
  30: { id: 24, name: 'Boss Office', match: 'BOSS OFFICE' },
  31: { id: 25, name: 'Mohamed DU', match: 'UD-MOHMD' },
  32: { id: 26, name: 'Ahmed Etisalat', match: 'AHMED' },
  33: { id: 38, name: 'MSA',      match: 'AHMED VACATION' },
  34: { id: 39, name: 'Office Staff', match: 'OFFICE STAFF' },
  35: { id: 27, name: 'Maint Saeed', match: 'HYPER SMOOTH' },
  36: { id: 28, name: 'Maint Maryam', match: 'JUNAID' },
  37: { id: 29, name: 'Others Maint', match: 'OTHERS MAINT' },
  38: { id: 30, name: 'Jabal Sina', match: 'JABAL SINA' },
  40: { id: 31, name: 'Charity Others', match: 'CHARITY' },
  41: { id: 32, name: 'Alsada FEWA', match: 'S-202 ELECT' },
  42: { id: 33, name: 'Alsada Sewer', match: 'ALSADA SEWER' },
  44: { id: 34, name: 'Alsada Others', match: 'SHAIKA' },
  45: { id: 35, name: 'Car Insurance', match: 'CAR INSURANCE' },
  46: { id: 36, name: 'Gas',      match: 'ADNOC' },
  47: { id: 37, name: 'Salik',    match: 'SALIK' },
  53: { id: 40, name: 'Boss Villa', match: 'BOSS VILLA' },
};

const MONTH_COLS = [
  ['2026-01', 5], ['2026-02', 6], ['2026-03', 7], ['2026-04', 8],
  ['2026-05', 9], ['2026-06', 10], ['2026-07', 11], ['2026-08', 12],
  ['2026-09', 13], ['2026-10', 14], ['2026-11', 15], ['2026-12', 16],
];

// ── Direct payment matches (from BILLS MONTHLY analysis) ────────────────────
// Format: [bill_id, month, amount, paid_date, invoice_no]
const DIRECT_MATCHES = [
  // Jan 2026 — from BILLS MONTHLY
  [6,  '2026-01', 656.46, '2026-01-14', '50499'],
  [7,  '2026-01', 636.97, '2026-01-14', '50865'],
  [15, '2026-01', 319.73, '2026-01-14', '51503'],
  [22, '2026-01', 550.00, '2026-01-23', '659'],
  [25, '2026-01', 373.58, '2026-01-01', null],
  [35, '2026-01', 2880.00,'2026-01-28', '434'],
  [36, '2026-01', 100.00, '2026-01-25', '45311'],
  [27, '2026-01', 84.00,  '2026-01-30', '3'],
  [28, '2026-01', 1550.00,'2026-01-26', '226000038'],
  [30, '2026-01', 330.00, '2025-12-01', '127727'],
  [30, '2026-01', 325.00, '2026-01-01', '130817'],  // split into 2 (total 655)
  [31, '2026-01', 1000.00,'2026-01-27', '661'],
  [32, '2026-01', 141.70, '2026-01-14', '51179'],
  [34, '2026-01', 1000.00,'2026-01-27', '660'],
  [38, '2026-01', 3000.00,'2026-01-28', '662'],
  [40, '2026-01', 2580.00,'2025-10-31', '3056'],

  // Feb 2026
  [22, '2026-02', 550.00, '2026-02-22', '670'],
  [23, '2026-02', 342.90, '2026-02-04', '55253'],
  [25, '2026-02', null,   null,         null],     // no Feb payment recorded
  [26, '2026-02', 550.00, '2026-02-02', '66234'],
  [32, '2026-02', 63.27,  '2026-02-16', '62901'],
  [7,  '2026-02', 498.06, '2026-02-16', '64848'],
  [9,  '2026-02', 571.12, '2026-02-16', '56031'],
  [15, '2026-02', 170.08, '2026-02-16', '67341'],

  // Mar 2026
  [6,  '2026-03', 202.52, '2026-03-19', '78545'],
  [7,  '2026-03', 682.84, '2026-03-19', '36099'],
  [9,  '2026-03', 658.59, '2026-03-19', '77916'],
  [15, '2026-03', 188.31, '2026-03-19', '55242'],
  [22, '2026-03', 550.00, '2026-03-25', '678'],
  [23, '2026-03', 318.63, '2026-03-02', '71062'],
  [25, '2026-03', 330.15, '2026-03-01', null],
  [26, '2026-03', 550.00, '2026-03-03', null],
  [32, '2026-03', 79.17,  '2026-03-19', '57663'],
  [38, '2026-03', 4000.00,'2026-03-10', '674'],   // Mohmd Kutty visa renew

  // Apr 2026
  [7,  '2026-04', 240.00, '2026-04-01', '99849'],
  [9,  '2026-04', 500.00, '2026-04-17', '38191'],
  [15, '2026-04', null,   null,         null],
  [22, '2026-04', 550.00, '2026-04-10', '682'],
  [23, '2026-04', 324.51, '2026-04-01', '80125'],
  [25, '2026-04', 324.60, '2026-04-01', '78406'],
  [26, '2026-04', 550.00, '2026-04-01', null],
  [37, '2026-04', 300.00, '2026-04-07', '5714'],

  // May 2026
  [23, '2026-05', 319.71, '2026-04-29', null],
  [26, '2026-05', 550.00, '2026-05-02', '667'],
  [31, '2026-05', 2000.00,'2026-05-06', '52796'],
];

// ── Build SQL ────────────────────────────────────────────────────────────────
const lines = ['-- Bill entries from bills.xls (Jan–May 2026)', '-- Generated ' + new Date().toISOString(), ''];
const seen = new Set(); // track (bill_id, month) to avoid dupes

function addEntry(billId, month, amount, status, paidDate, invoiceNo) {
  if (amount === null || amount === undefined) return;
  const key = `${billId}:${month}`;
  if (seen.has(key)) return; // skip if already added (first wins)
  seen.add(key);
  const paid = paidDate ? `'${paidDate}'` : 'NULL';
  const inv  = invoiceNo ? `'${String(invoiceNo).replace(/'/g, "''")}'` : 'NULL';
  lines.push(
    `INSERT OR IGNORE INTO bill_entries (bill_id, month, amount, status, paid_date, invoice_no) ` +
    `VALUES (${billId}, '${month}', ${Number(amount).toFixed(2)}, '${status}', ${paid}, ${inv});`
  );
}

// Process direct matches (paid entries from BILLS MONTHLY)
// For bills that appear twice in same month (Jabal Sina Jan = 2 payments), add amounts
const paidEntries = {};
for (const [billId, month, amount, paidDate, invoiceNo] of DIRECT_MATCHES) {
  if (amount === null) continue;
  const key = `${billId}:${month}`;
  if (!paidEntries[key]) {
    paidEntries[key] = { billId, month, totalAmt: 0, paidDate, invoiceNo };
  }
  paidEntries[key].totalAmt += amount;
  // Use the later date
  if (paidDate && (!paidEntries[key].paidDate || paidDate > paidEntries[key].paidDate)) {
    paidEntries[key].paidDate = paidDate;
  }
}
for (const e of Object.values(paidEntries)) {
  addEntry(e.billId, e.month, e.totalAmt, 'paid', e.paidDate, e.invoiceNo);
}

// Process checklist (unpaid entries for months not already covered)
for (const [rowIdxStr, bill] of Object.entries(ROW_TO_BILL)) {
  const rowIdx = Number(rowIdxStr);
  const row = clRows[rowIdx];
  if (!row) continue;
  for (const [month, col] of MONTH_COLS) {
    const amount = row[col];
    if (!amount) continue;
    addEntry(bill.id, month, amount, 'unpaid', null, null);
  }
}

lines.push('');
const sql = lines.join('\n');
fs.writeFileSync('bill-entries-import.sql', sql);

const paidCount = Object.values(paidEntries).length;
const totalCount = [...seen].length;
console.log(`Generated ${totalCount} entries (${paidCount} paid, ${totalCount - paidCount} unpaid) → bill-entries-import.sql`);
