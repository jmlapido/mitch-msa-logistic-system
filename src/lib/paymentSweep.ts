export type OutstandingRow = {
  id: number;
  expectedRent: number;
  amountPaid: number;
};

export type SweepPlan = {
  ownAmount: number;
  swept: Array<{ rentPaymentId: number; amount: number }>;
  leftover: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function applyExcessToCandidate(
  excess: number,
  expectedRent: number,
  amountPaid: number,
): { applied: number; remainingExcess: number } {
  const remainingDue = Math.max(0, round2(expectedRent - amountPaid));
  const applied = Math.min(excess, remainingDue);
  return { applied, remainingExcess: round2(excess - applied) };
}

/**
 * otherOutstanding must already be sorted oldest-first (month ASC, id ASC) by the caller —
 * this function applies excess in the order given, it does not re-sort.
 */
export function planOverpaymentSweep(
  enteredAmount: number,
  targetExpectedRent: number,
  targetAmountPaid: number,
  otherOutstanding: OutstandingRow[],
): SweepPlan {
  const remainingDueTarget = Math.max(0, round2(targetExpectedRent - targetAmountPaid));
  const ownAmount = Math.min(enteredAmount, remainingDueTarget);
  let excess = round2(enteredAmount - ownAmount);

  const swept: Array<{ rentPaymentId: number; amount: number }> = [];

  for (const row of otherOutstanding) {
    if (excess <= 0) break;
    const { applied, remainingExcess } = applyExcessToCandidate(excess, row.expectedRent, row.amountPaid);
    if (applied > 0) swept.push({ rentPaymentId: row.id, amount: applied });
    excess = remainingExcess;
  }

  return { ownAmount, swept, leftover: excess };
}

/** '2026-07' -> '2026-08'; correctly rolls over the year ('2025-12' -> '2026-01'). */
export function addMonthToYyyyMm(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(year, m); // m is already 1-indexed (e.g. 7 = July); passing it as the month index (0-indexed) yields the next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type CreditSource = { id: number; month: string; credit: number };
export type CreditDue = { id: number; month: string; due: number };
export type CreditApplication = { fromId: number; fromMonth: string; toId: number; toMonth: string; amount: number };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Walk credits into dues in the given order, moving min(credit, due) each step. */
export function planCreditTransfer(sources: CreditSource[], dues: CreditDue[]): CreditApplication[] {
  const apps: CreditApplication[] = [];
  let si = 0, di = 0;
  let credit = 0, due = 0;
  while (true) {
    while (credit <= 0) { if (si >= sources.length) return apps; credit = r2(sources[si]!.credit); if (credit <= 0) si++; else break; }
    while (due <= 0) { if (di >= dues.length) return apps; due = r2(dues[di]!.due); if (due <= 0) di++; else break; }
    const amount = r2(Math.min(credit, due));
    apps.push({ fromId: sources[si]!.id, fromMonth: sources[si]!.month, toId: dues[di]!.id, toMonth: dues[di]!.month, amount });
    credit = r2(credit - amount); due = r2(due - amount);
    if (credit <= 0) si++;
    if (due <= 0) di++;
  }
}
