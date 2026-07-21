import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type Commission = {
  id: number;
  name: string;
  amount: number;
  paid_date: string;
  payment_method: 'cash' | 'cheque';
  cheque_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type CommissionInput = {
  name: string;
  amount: number;
  paid_date: string;
  payment_method: 'cash' | 'cheque';
  cheque_number?: string;
  notes?: string;
};

export function useCommissions(month: string) {
  return useQuery<{ rows: Commission[]; total: number }>({
    queryKey: ['commissions', month],
    queryFn: () => api.get(`/api/commissions?month=${month}`),
  });
}

export function useCommissionMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['commissions'] });

  return {
    createCommission: useMutation({
      mutationFn: (d: CommissionInput) => api.post<Commission>('/api/commissions', d),
      onSuccess: invalidate,
    }),
    updateCommission: useMutation({
      mutationFn: ({ id, ...d }: CommissionInput & { id: number }) =>
        api.put<Commission>(`/api/commissions/${id}`, d),
      onSuccess: invalidate,
    }),
    deleteCommission: useMutation({
      mutationFn: (id: number) => api.del(`/api/commissions/${id}`),
      onSuccess: invalidate,
    }),
  };
}
