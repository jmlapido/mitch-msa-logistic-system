import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type BillEntry = {
  entry_id: number;
  bill_id: number;
  month: string;
  amount: number;
  status: 'paid' | 'unpaid';
  computed_status: 'paid' | 'unpaid' | 'due_soon' | 'overdue';
  paid_date: string | null;
  invoice_no: string | null;
  entry_notes: string | null;
  updated_at: string;
  particulars: string;
  account_no: string | null;
  due_day: number | null;
  is_recurring: number;
  category_id: number;
  category_name: string;
  category_color: string;
  category_icon: string;
  building_id: number | null;
  building_name: string | null;
  attachment_count: number;
};

export type BillTemplate = {
  id: number;
  category_id: number;
  particulars: string;
  account_no: string | null;
  due_day: number | null;
  is_recurring: number;
  notes: string | null;
  category_name: string;
  category_color: string;
  category_icon: string;
  building_id?: number | null;
  building_name?: string | null;
  entry_id?: number | null;
  amount?: number;
};

export type BillCreateInput = {
  category_id: number;
  particulars: string;
  account_no: string | null;
  due_day: number | null;
  is_recurring: number;
  notes: string | null;
  building_id?: number | null;
  amount: number;
  month: string;
};

export type BillMonthlySummary = {
  month: string;
  total: number;
  paid: number;
  unpaid: number;
};

export function useBillEntries(month: string) {
  return useQuery<BillEntry[]>({
    queryKey: ['bill-entries', month],
    queryFn: () => api.get(`/api/bill-entries?month=${month}`),
  });
}

export function useBillsYearlySummary(year: string) {
  return useQuery<BillMonthlySummary[]>({
    queryKey: ['bill-entries-yearly', year],
    queryFn: () => api.get(`/api/bill-entries/yearly-summary?year=${year}`),
  });
}

export function useBillTemplates() {
  return useQuery<BillTemplate[]>({
    queryKey: ['bills'],
    queryFn: () => api.get('/api/bills'),
  });
}

export function useBillMutations(month: string) {
  const qc = useQueryClient();
  const invalidateEntries = () => qc.invalidateQueries({ queryKey: ['bill-entries', month] });
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['bills'] });
    qc.invalidateQueries({ queryKey: ['bill-entries'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  return {
    createTemplate: useMutation({
      mutationFn: ({ month, ...d }: BillCreateInput) =>
        api.post<BillTemplate & { entry_id: number | null }>(`/api/bills?month=${month}`, d),
      onSuccess: invalidateAll,
    }),
    updateTemplate: useMutation({
      mutationFn: ({ id, ...d }: Partial<BillTemplate> & { id: number }) =>
        api.put<BillTemplate>(`/api/bills/${id}`, d),
      onSuccess: invalidateAll,
    }),
    deleteTemplate: useMutation({
      mutationFn: (id: number) => api.del(`/api/bills/${id}`),
      onSuccess: invalidateAll,
    }),
    updateEntry: useMutation({
      mutationFn: ({ id, ...d }: { id: number; amount?: number; status?: string; paid_date?: string | null; invoice_no?: string | null; notes?: string | null }) =>
        api.put(`/api/bill-entries/${id}`, d),
      onSuccess: invalidateEntries,
    }),
  };
}
