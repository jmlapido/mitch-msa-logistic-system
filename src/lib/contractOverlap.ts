// Two ISO YYYY-MM-DD ranges overlap when each starts on or before the other ends.
// ISO date strings compare correctly as plain strings.
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export type OverlapConflict = { id: number; contract_no: string; tenant_name: string };

// SQL mirror of rangesOverlap: finds any other contract already covering this
// unit during [startDate, endDate].
export async function findOverlappingContract(
  db: D1Database,
  unitId: number,
  startDate: string,
  endDate: string,
  excludeContractId?: number,
): Promise<OverlapConflict | null> {
  const row = await db.prepare(`
    SELECT c.id, c.contract_no, t.name as tenant_name
    FROM contracts c
    JOIN tenants t ON c.tenant_id = t.id
    WHERE c.unit_id = ?
      AND c.id != ?
      AND date(c.start_date) <= date(?)
      AND date(c.end_date) >= date(?)
    LIMIT 1
  `).bind(unitId, excludeContractId ?? -1, endDate, startDate).first<OverlapConflict>();
  return row ?? null;
}
