import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export type DashboardData = {
  month: string;
  bills: { total: number; paid: number; unpaid: number; highest: number };
  rent: { due: number; collected: number; overdue: number };
  prevMonth: {
    bills: { total: number; paid: number };
    rent: { collected: number };
  };
  billsHistory: Array<{ month: string; total: number; unpaid: number }>;
  rentHistory: Array<{ month: string; due_monthly: number; collected_monthly: number }>;
  sponsorships: {
    totalContractValue: number;
    collected: number;
    pending: number;
    overdue: number;
    activeCount: number;
  };
  commissions: { total: number; count: number };
  expiringSponsors: Array<{
    partner_id: number;
    company_name: string;
    end_date: string;
    expected_amount: number;
    payment_frequency: string;
    total_paid: number;
    days_remaining: number;
    status: string;
  }>;
  priorityPayments: Array<{
    entry_id: number; amount: number; status: string; particulars: string; due_day: number | null;
    category_name: string; category_color: string; category_icon: string; priority_rank: number;
  }>;
  actionCounts: { overdueRentCount: number; expiringContractsCount: number; pendingArchiveCount: number; unpaidBillsCount: number };
  chequesDue: { id: number; cheque_date: string; amount: number | null; pdc_number: number; tenant_id: number; tenant_name: string }[];
  topBalances: { id: number; name: string; total_balance: number }[];
  rentByBuilding: Array<{
    building_id: number; building_name: string; unit_count: number; expected: number; collected: number;
  }>;
  expiringLeases: Array<{
    id: number; tenant_id: number; end_date: string; monthly_rent: number;
    tenant_name: string; unit_no: string; building_name: string;
  }>;
  buildingOccupancy: Array<{
    building_id: number; building_name: string; type: string;
    total_units: number; occupied: number; vacant: number;
  }>;
};

export function useDashboard(month: string) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', month],
    queryFn: () => api.get(`/api/dashboard?month=${month}`),
    staleTime: 30_000,
  });
}
