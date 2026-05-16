// Generates UPDATE statements to fix zero-amount entries and wrong paid statuses
const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('bills.xls');

function excelDate(serial) {
  if (!serial || typeof serial === 'string') return null;
  return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

// ── Same ROW_TO_BILL and MONTH_COLS as import script ────────────────────────
const ROW_TO_BILL = {
  4:  { id: 1 },  5:  { id: 2 },  6:  { id: 3 },  7:  { id: 4 },
  8:  { id: 5 },  9:  { id: 6 },  10: { id: 7 },  11: { id: 8 },
  12: { id: 9 },  13: { id: 10 }, 14: { id: 11 }, 15: { id: 12 },
  16: { id: 13 }, 18: { id: 14 }, 20: { id: 15 }, 22: { id: 16 },
  23: { id: 17 }, 24: { id: 18 }, 25: { id: 19 }, 26: { id: 20 },
  27: { id: 21 }, 28: { id: 22 }, 29: { id: 23 }, 30: { id: 24 },
  31: { id: 25 }, 32: { id: 26 }, 33: { id: 38 }, 34: { id: 39 },
  35: { id: 27 }, 36: { id: 28 }, 37: { id: 29 }, 38: { id: 30 },
  40: { id: 31 }, 41: { id: 32 }, 42: { id: 33 }, 44: { id: 34 },
  45: { id: 35 }, 46: { id: 36 }, 47: { id: 37 }, 53: { id: 40 },
};

const MONTH_COLS = [
  ['2026-01', 5], ['2026-02', 6], ['2026-03', 7], ['2026-04', 8],
  ['2026-05', 9], ['2026-06', 10], ['2026-07', 11], ['2026-08', 12],
  ['2026-09', 13], ['2026-10', 14], ['2026-11', 15], ['2026-12', 16],
];

// ── Paid entries with real amounts, dates, invoice numbers ──────────────────
const DIRECT_MATCHES = [
  // Jan 2026
  [6,  '2026-01', 656.46,  '2026-01-14', '50499'],
  [7,  '2026-01', 636.97,  '2026-01-14', '50865'],
  [15, '2026-01', 319.73,  '2026-01-14', '51503'],
  [22, '2026-01', 550.00,  '2026-01-23', '659'],
  [25, '2026-01', 373.58,  '2026-01-01', null],
  [35, '2026-01', 2880.00, '2026-01-28', '434'],
  [36, '2026-01', 100.00,  '2026-01-25', '45311'],
  [27, '2026-01', 84.00,   '2026-01-30', '3'],
  [28, '2026-01', 1550.00, '2026-01-26', '226000038'],
  [30, '2026-01', 655.00,  '2026-01-01', '127727'],
  [31, '2026-01', 1000.00, '2026-01-27', '661'],
  [32, '2026-01', 141.70,  '2026-01-14', '51179'],
  [34, '2026-01', 1000.00, '2026-01-27', '660'],
  [38, '2026-01', 3000.00, '2026-01-28', '662'],
  [40, '2026-01', 2580.00, '2025-10-31', '3056'],
  // Feb 2026
  [22, '2026-02', 550.00,  '2026-02-22', '670'],
  [23, '2026-02', 342.90,  '2026-02-04', '55253'],
  [26, '2026-02', 550.00,  '2026-02-02', '66234'],
  [32, '2026-02', 63.27,   '2026-02-16', '62901'],
  [7,  '2026-02', 498.06,  '2026-02-16', '64848'],
  [9,  '2026-02', 571.12,  '2026-02-16', '56031'],
  [15, '2026-02', 170.08,  '2026-02-16', '67341'],
  // Mar 2026
  [6,  '2026-03', 202.52,  '2026-03-19', '78545'],
  [7,  '2026-03', 682.84,  '2026-03-19', '36099'],
  [9,  '2026-03', 658.59,  '2026-03-19', '77916'],
  [15, '2026-03', 188.31,  '2026-03-19', '55242'],
  [22, '2026-03', 550.00,  '2026-03-25', '678'],
  [23, '2026-03', 318.63,  '2026-03-02', '71062'],
  [25, '2026-03', 330.15,  '2026-03-01', null],
  [26, '2026-03', 550.00,  '2026-03-03', null],
  [32, '2026-03', 79.17,   '2026-03-19', '57663'],
  [38, '2026-03', 4000.00, '2026-03-10', '674'],
  // Apr 2026
  [7,  '2026-04', 240.00,  '2026-04-01', '99849'],
  [9,  '2026-04', 500.00,  '2026-04-17', '38191'],
  [22, '2026-04', 550.00,  '2026-04-10', '682'],
  [23, '2026-04', 324.51,  '2026-04-01', '80125'],
  [25, '2026-04', 324.60,  '2026-04-01', '78406'],
  [26, '2026-04', 550.00,  '2026-04-01', null],
  [37, '2026-04', 300.00,  '2026-04-07', '5714'],
  // May 2026
  [23, '2026-05', 319.71,  '2026-04-29', null],
  [26, '2026-05', 550.00,  '2026-05-02', '667'],
  [31, '2026-05', 2000.00, '2026-05-06', '52796'],
];

const lines = [
  '-- Fix bill entries: update amounts, paid status, dates from bills.xls',
  '-- Generated ' + new Date().toISOString(),
  '',
  '-- 1. Fix logo settings',
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('company_logo_key', 'branding/logo.png');",
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('company_logo_url', '/api/settings/logo/file');",
  '',
  '-- 2. Update paid entries (real amounts + dates + invoice numbers)',
];

// Group DIRECT_MATCHES by (bill_id, month), summing amounts where duplicated
const paid = {};
for (const [billId, month, amount, paidDate, invoiceNo] of DIRECT_MATCHES) {
  const key = `${billId}:${month}`;
  if (!paid[key]) paid[key] = { billId, month, totalAmt: 0, paidDate, invoiceNo };
  paid[key].totalAmt += amount;
  if (paidDate && (!paid[key].paidDate || paidDate > paid[key].paidDate))
    paid[key].paidDate = paidDate;
}

for (const e of Object.values(paid)) {
  const inv = e.invoiceNo ? `'${String(e.invoiceNo).replace(/'/g, "''")}'` : 'NULL';
  lines.push(
    `UPDATE bill_entries SET amount=${e.totalAmt.toFixed(2)}, status='paid', ` +
    `paid_date='${e.paidDate}', invoice_no=${inv} ` +
    `WHERE bill_id=${e.billId} AND month='${e.month}';`
  );
}

// 3. Update checklist budget amounts for entries still at amount=0
const checklist = wb.Sheets['Bill paying checklist'];
const clRows = XLSX.utils.sheet_to_json(checklist, { header: 1, defval: null });

lines.push('');
lines.push('-- 3. Update budget amounts from checklist (replaces auto-generated 0 amounts)');

const paidKeys = new Set(Object.keys(paid));
let budgetCount = 0;
for (const [rowIdxStr, bill] of Object.entries(ROW_TO_BILL)) {
  const rowIdx = Number(rowIdxStr);
  const row = clRows[rowIdx];
  if (!row) continue;
  for (const [month, col] of MONTH_COLS) {
    const amount = row[col];
    if (!amount || Number(amount) <= 0) continue;
    if (paidKeys.has(`${bill.id}:${month}`)) continue; // already paid, skip
    lines.push(
      `UPDATE bill_entries SET amount=${Number(amount).toFixed(2)} ` +
      `WHERE bill_id=${bill.id} AND month='${month}' AND amount=0;`
    );
    budgetCount++;
  }
}

lines.push('');
const sql = lines.join('\n');
fs.writeFileSync('fix-bills-data.sql', sql);
console.log(`Generated ${Object.values(paid).length} paid UPDATEs + ${budgetCount} budget UPDATEs + logo fix → fix-bills-data.sql`);
