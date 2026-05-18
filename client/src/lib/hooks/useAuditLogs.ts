import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export type AuditLog = {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  note: string | null;
  created_at: string;
};

export type AuditLogFilters = {
  user_id?: number;
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
};

export type AuditLogResponse = {
  results: AuditLog[];
  total: number;
  page: number;
  limit: number;
};

export type AuditUser = { user_id: number; user_name: string };

export function useAuditLogs(filters: AuditLogFilters = {}) {
  const params = new URLSearchParams();
  if (filters.user_id) params.set('user_id', String(filters.user_id));
  if (filters.action) params.set('action', filters.action);
  if (filters.entity_type) params.set('entity_type', filters.entity_type);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.page) params.set('page', String(filters.page));

  return useQuery<AuditLogResponse>({
    queryKey: ['audit-logs', filters],
    queryFn: () => api.get(`/api/audit-logs?${params.toString()}`),
  });
}

export function useAuditLogUsers() {
  return useQuery<AuditUser[]>({
    queryKey: ['audit-log-users'],
    queryFn: () => api.get('/api/audit-logs/users'),
    staleTime: 5 * 60_000,
  });
}

export function useAuditLogActions() {
  return useQuery<{ action: string }[]>({
    queryKey: ['audit-log-actions'],
    queryFn: () => api.get('/api/audit-logs/actions'),
    staleTime: 5 * 60_000,
  });
}

export function useLastAuditEntry(entityType: string, entityId: number) {
  return useQuery<AuditLog | null>({
    queryKey: ['audit-log-last', entityType, entityId],
    queryFn: async () => {
      const res = await api.get<AuditLogResponse>(
        `/api/audit-logs?entity_type=${entityType}&entity_id=${entityId}&page=1`
      );
      return res.results[0] ?? null;
    },
    enabled: !!entityId,
    staleTime: 60_000,
  });
}
