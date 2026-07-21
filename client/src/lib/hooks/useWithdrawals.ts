import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type Withdrawal = {
  id: number;
  withdrawn_by: string;
  amount: number;
  withdrawn_date: string;
  payment_method: 'cash' | 'cheque';
  cheque_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type WithdrawalInput = {
  withdrawn_by: string;
  amount: number;
  withdrawn_date: string;
  payment_method: 'cash' | 'cheque';
  cheque_number?: string;
  notes?: string;
};

export function useWithdrawals(month: string) {
  return useQuery<{ rows: Withdrawal[]; total: number; cash_on_hand: number }>({
    queryKey: ['withdrawals', month],
    queryFn: () => api.get(`/api/withdrawals?month=${month}`),
  });
}

export function useWithdrawalMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['withdrawals'] });

  return {
    createWithdrawal: useMutation({
      mutationFn: (d: WithdrawalInput) => api.post<Withdrawal>('/api/withdrawals', d),
      onSuccess: invalidate,
    }),
    updateWithdrawal: useMutation({
      mutationFn: ({ id, ...d }: WithdrawalInput & { id: number }) =>
        api.put<Withdrawal>(`/api/withdrawals/${id}`, d),
      onSuccess: invalidate,
    }),
    deleteWithdrawal: useMutation({
      mutationFn: (id: number) => api.del(`/api/withdrawals/${id}`),
      onSuccess: invalidate,
    }),
  };
}
