import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type Property = { id: number; name: string; type: string; address?: string };

export function useProperties() {
  return useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: () => api.get('/api/properties'),
  });
}

export function usePropertyMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['properties'] });
  return {
    create: useMutation({ mutationFn: (d: Partial<Property>) => api.post<Property>('/api/properties', d), onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, ...d }: Partial<Property> & { id: number }) => api.put<Property>(`/api/properties/${id}`, d), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/api/properties/${id}`), onSuccess: invalidate }),
  };
}
