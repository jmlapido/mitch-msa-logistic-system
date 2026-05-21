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
  sponsorships: {
    totalContractValue: number;
    collected: number;
    pending: number;
    overdue: number;
    activeCount: number;
  };
  activeSponsors: Array<{
    partner_id: number;
    company_name: string;
    contract_id: number;
    expected_amount: number;
    total_paid: number;
    payment_frequency: string;
    contract_end: string;
    status: string;
  }>;
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
  upcomingBills: Array<{
    entry_id: number; amount: number; particulars: string; due_day: number | null;
    category_name: string; category_color: string; category_icon: string;
  }>;
  rentByBuilding: Array<{
    building_id: number; building_name: string; unit_count: number; expected: number; collected: number;
  }>;
  expiringLeases: Array<{
    id: number; tenant_id: number; end_date: string; monthly_rent: number;
    tenant_name: string; unit_no: string; building_name: string;
  }>;
};

export function useDashboard(month: string) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', month],
    queryFn: () => api.get(`/api/dashboard?month=${month}`),
    staleTime: 30_000,
  });
}
