export type OutstandingRow = {
  id: number;
  expectedRent: number;
  amountPaid: number;
};

export type SweepPlan = {
  targetAmount: number;
  swept: Array<{ rentPaymentId: number; amount: number }>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  let targetAmount = Math.min(enteredAmount, remainingDueTarget);
  let excess = round2(enteredAmount - targetAmount);

  const swept: Array<{ rentPaymentId: number; amount: number }> = [];

  for (const row of otherOutstanding) {
    if (excess <= 0) break;
    const remainingDue = Math.max(0, round2(row.expectedRent - row.amountPaid));
    if (remainingDue <= 0) continue;
    const applyAmount = Math.min(excess, remainingDue);
    swept.push({ rentPaymentId: row.id, amount: applyAmount });
    excess = round2(excess - applyAmount);
  }

  if (excess > 0) {
    targetAmount = round2(targetAmount + excess);
  }

  return { targetAmount, swept };
}
