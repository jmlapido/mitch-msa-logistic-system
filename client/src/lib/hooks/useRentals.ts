import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export type Building = { id: number; name: string; type: string; address?: string; notes?: string; unit_count: number; occupied_count: number };
export type Unit = { id: number; building_id: number; unit_no: string; type: string; floor?: string; notes?: string; building_name: string; occupancy_status: 'occupied' | 'vacant' | 'expiring'; tenant_name?: string; monthly_rent?: number; lease_end?: string; lease_id?: number };
export type Tenant = { id: number; name: string; phone?: string; email?: string; id_number?: string; notes?: string; unit_id?: number; lease_id?: number; unit_no?: string; building_name?: string; lease_status?: string; end_date?: string; monthly_rent?: number };
export type Lease = { id: number; unit_id: number; tenant_id: number; start_date: string; end_date: string; monthly_rent: number; deposit: number; status: string; notes?: string; tenant_name: string; unit_no: string; building_name: string };
export type RentPayment = { id: number; lease_id: number; month: string; amount: number; status: string; paid_date?: string; receipt_no?: string; notes?: string; tenant_name: string; unit_no: string; building_name: string; building_id: number; expected_rent: number; tenant_overdue: number; tenant_balance: number };
export type RentalDoc = { id: number; entity_type: string; entity_id: number; doc_type: string; file_name: string; uploaded_at: string };
export type Contract = { id: number; tenant_id: number; contract_no: string; start_date: string; end_date: string; annual_rent: number; no_of_pdc: number; notes?: string; status: 'valid' | 'expired'; created_at: string };

export function useBuildings() {
  return useQuery<Building[]>({ queryKey: ['buildings'], queryFn: () => api.get('/api/buildings') });
}
export function useUnits(buildingId?: number) {
  const url = buildingId ? `/api/units?building_id=${buildingId}` : '/api/units';
  return useQuery<Unit[]>({ queryKey: ['units', buildingId], queryFn: () => api.get(url) });
}
export function useTenants() {
  return useQuery<Tenant[]>({ queryKey: ['tenants'], queryFn: () => api.get('/api/tenants') });
}
export function useLeases() {
  return useQuery<Lease[]>({ queryKey: ['leases'], queryFn: () => api.get('/api/leases') });
}
export function useRentPayments(month: string, buildingId?: number) {
  const url = `/api/rent-payments?month=${month}${buildingId ? `&building_id=${buildingId}` : ''}`;
  return useQuery<RentPayment[]>({ queryKey: ['rent-payments', month, buildingId], queryFn: () => api.get(url) });
}
export function useRentalDocs(entityType: string, entityId: number) {
  return useQuery<RentalDoc[]>({
    queryKey: ['rental-docs', entityType, entityId],
    queryFn: () => api.get(`/api/rental-documents?entity_type=${entityType}&entity_id=${entityId}`),
    enabled: !!entityId,
  });
}
export function useContracts(tenantId: number) {
  return useQuery<Contract[]>({
    queryKey: ['contracts', tenantId],
    queryFn: () => api.get(`/api/contracts?tenant_id=${tenantId}`),
    enabled: !!tenantId,
  });
}

export function useExpiringLeases(days = 60) {
  return useQuery<Lease[]>({ queryKey: ['leases', 'expiring', days], queryFn: () => api.get(`/api/leases/expiring?days=${days}`) });
}

export function useRentalMutations() {
  const qc = useQueryClient();
  const inv = (keys: string[][]) => keys.forEach(k => qc.invalidateQueries({ queryKey: k }));
  const invAll = () => inv([['buildings'], ['units'], ['tenants'], ['leases'], ['rent-payments'], ['dashboard']]);
  const invDocs = (type: string, id: number) => qc.invalidateQueries({ queryKey: ['rental-docs', type, id] });

  return {
    createBuilding: useMutation({ mutationFn: (d: Partial<Building>) => api.post<Building>('/api/buildings', d), onSuccess: invAll }),
    updateBuilding: useMutation({ mutationFn: ({ id, ...d }: Partial<Building> & { id: number }) => api.put<Building>(`/api/buildings/${id}`, d), onSuccess: invAll }),
    deleteBuilding: useMutation({ mutationFn: (id: number) => api.del(`/api/buildings/${id}`), onSuccess: invAll }),

    createUnit: useMutation({ mutationFn: (d: Partial<Unit>) => api.post<Unit>('/api/units', d), onSuccess: invAll }),
    updateUnit: useMutation({ mutationFn: ({ id, ...d }: Partial<Unit> & { id: number }) => api.put<Unit>(`/api/units/${id}`, d), onSuccess: invAll }),
    deleteUnit: useMutation({ mutationFn: (id: number) => api.del(`/api/units/${id}`), onSuccess: invAll }),

    createTenant: useMutation({ mutationFn: (d: Partial<Tenant>) => api.post<Tenant>('/api/tenants', d), onSuccess: invAll }),
    updateTenant: useMutation({ mutationFn: ({ id, ...d }: Partial<Tenant> & { id: number }) => api.put<Tenant>(`/api/tenants/${id}`, d), onSuccess: invAll }),
    deleteTenant: useMutation({ mutationFn: (id: number) => api.del(`/api/tenants/${id}`), onSuccess: invAll }),

    createLease: useMutation({ mutationFn: (d: Partial<Lease>) => api.post<Lease>('/api/leases', d), onSuccess: invAll }),
    updateLease: useMutation({ mutationFn: ({ id, ...d }: Partial<Lease> & { id: number }) => api.put<Lease>(`/api/leases/${id}`, d), onSuccess: invAll }),
    deleteLease: useMutation({ mutationFn: (id: number) => api.del(`/api/leases/${id}`), onSuccess: invAll }),

    updateRentPayment: useMutation({
      mutationFn: ({ id, ...d }: { id: number; amount?: number; status?: string; paid_date?: string | null; receipt_no?: string | null; notes?: string | null }) =>
        api.put(`/api/rent-payments/${id}`, d),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['rent-payments'] }),
    }),

    uploadDoc: async (file: File, entityType: string, entityId: number, docType: string) => {
      const fd = new FormData();
      fd.append('file', file); fd.append('entity_type', entityType);
      fd.append('entity_id', String(entityId)); fd.append('doc_type', docType);
      const res = await fetch('/api/rental-documents', { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) throw new Error('Upload failed');
      invDocs(entityType, entityId);
      return res.json();
    },
    deleteDoc: useMutation({
      mutationFn: (id: number) => api.del(`/api/rental-documents/${id}`),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['rental-docs'] }),
    }),

    createContract: useMutation({
      mutationFn: (d: Partial<Contract>) => api.post<Contract>('/api/contracts', d),
      onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['contracts', v.tenant_id] }),
    }),
    updateContract: useMutation({
      mutationFn: ({ id, ...d }: Partial<Contract> & { id: number }) => api.put<Contract>(`/api/contracts/${id}`, d),
      onSuccess: (data) => qc.invalidateQueries({ queryKey: ['contracts', data.tenant_id] }),
    }),
    deleteContract: useMutation({
      mutationFn: ({ id, tenantId }: { id: number; tenantId: number }) => api.del(`/api/contracts/${id}`).then(r => ({ ...r, tenantId })),
      onSuccess: (_: unknown, v: { tenantId: number }) => qc.invalidateQueries({ queryKey: ['contracts', v.tenantId] }),
    }),
  };
}
