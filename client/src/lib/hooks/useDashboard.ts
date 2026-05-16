import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export type DashboardData = {
  month: string;
  bills: { total: number; paid: number; unpaid: number; highest: number };
  rent: { due: number; collected: number; overdue: number };
  priorityPayments: Array<{
    entry_id: number; amount: number; status: string; particulars: string; due_day: number | null;
    category_name: string; category_color: string; category_icon: string; property_name: string | null; priority_rank: number;
  }>;
  upcomingBills: Array<{
    entry_id: number; amount: number; particulars: string; due_day: number | null;
    category_name: string; category_color: string; category_icon: string; property_name: string | null;
  }>;
  rentByBuilding: Array<{
    building_id: number; building_name: string; unit_count: number; expected: number; collected: number;
  }>;
  expiringLeases: Array<{
    id: number; end_date: string; monthly_rent: number;
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
