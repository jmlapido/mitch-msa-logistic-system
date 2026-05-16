import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

type Settings = { company_name: string; logo_url: string; currency: string };

export function useSettings() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/api/settings/public'),
    staleTime: 5 * 60 * 1000,
  });
  return { settings };
}
