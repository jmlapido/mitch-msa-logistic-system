import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type Category = { id: number; name: string; color: string; icon: string; sort_order: number; links_to_building: number };

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/api/categories'),
  });
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['categories'] });

  const create = useMutation({
    mutationFn: (data: Partial<Category>) => api.post<Category>('/api/categories', data),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<Category> & { id: number }) =>
      api.put<Category>(`/api/categories/${id}`, data),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/categories/${id}`),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
