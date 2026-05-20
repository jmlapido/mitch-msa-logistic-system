import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Partner = {
  id: number;
  company_name: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at: string;
  contract_id?: number;
  contract_end?: string;
  expected_amount?: number;
  payment_frequency?: 'monthly' | 'quarterly' | 'annual' | 'one-time';
  total_paid: number;
  status: 'paid' | 'partial' | 'overdue' | 'pending' | 'no_contract';
};

export type PartnerContact = {
  id: number;
  partner_id: number;
  name: string;
  position?: string;
  phone?: string;
};

export type PartnerContract = {
  id: number;
  partner_id: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  payment_frequency: 'monthly' | 'quarterly' | 'annual' | 'one-time';
  notes?: string;
  status: 'active' | 'expired' | 'terminated';
  total_paid: number;
  payment_status: 'paid' | 'partial' | 'overdue' | 'pending';
  created_at: string;
};

export type PartnerPayment = {
  id: number;
  partner_id: number;
  contract_id: number;
  amount: number;
  paid_date: string;
  payment_method: 'cash' | 'cheque';
  receipt_no?: string;
  notes?: string;
  created_at: string;
  contract_start: string;
  contract_end: string;
  expected_amount: number;
  attachments: PartnerPaymentAttachment[];
};

export type PartnerPaymentAttachment = {
  id: number;
  payment_id: number;
  file_name: string;
  file_type: string;
};

export type PartnerDocument = {
  id: number;
  partner_id: number;
  doc_type: 'contract' | 'agreement' | 'other';
  file_name: string;
  file_type: string;
  uploaded_at: string;
};

export type PaymentsTabRow = {
  partner_id: number;
  partner_name: string;
  contract_id: number;
  start_date: string;
  end_date: string;
  expected_amount: number;
  payment_frequency: string;
  total_paid: number;
  status: 'paid' | 'partial' | 'overdue' | 'pending';
};

export type PaymentsTabStats = {
  totalPartners: number;
  totalExpected: number;
  totalCollected: number;
  overdue: number;
  partial: number;
};

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export function usePartners() {
  return useQuery<Partner[]>({
    queryKey: ['partners'],
    queryFn: () => api.get('/api/partners'),
  });
}

export function usePartnerContacts(partnerId: number, enabled = true) {
  return useQuery<PartnerContact[]>({
    queryKey: ['partner-contacts', partnerId],
    queryFn: () => api.get(`/api/partners/${partnerId}/contacts`),
    enabled,
  });
}

export function usePartnerContracts(partnerId: number, enabled = true) {
  return useQuery<PartnerContract[]>({
    queryKey: ['partner-contracts', partnerId],
    queryFn: () => api.get(`/api/partners/${partnerId}/contracts`),
    enabled,
  });
}

export function usePartnerPaymentsByPartner(partnerId: number, enabled = true) {
  return useQuery<PartnerPayment[]>({
    queryKey: ['partner-payments-by-partner', partnerId],
    queryFn: () => api.get(`/api/partner-payments/by-partner/${partnerId}`),
    enabled,
  });
}

export function usePartnerDocuments(partnerId: number, enabled = true) {
  return useQuery<PartnerDocument[]>({
    queryKey: ['partner-documents', partnerId],
    queryFn: () => api.get(`/api/partners/${partnerId}/documents`),
    enabled,
  });
}

export function usePartnerPaymentsTab(params: {
  partnerId?: number;
  from?: string;
  to?: string;
  status?: string;
}) {
  const { partnerId, from, to, status } = params;
  const searchParams = new URLSearchParams();
  if (partnerId !== undefined) searchParams.set('partner_id', String(partnerId));
  if (from) searchParams.set('from', from);
  if (to) searchParams.set('to', to);
  if (status) searchParams.set('status', status);
  const qs = searchParams.toString();

  return useQuery<{ rows: PaymentsTabRow[]; stats: PaymentsTabStats }>({
    queryKey: ['partner-payments-tab', params],
    queryFn: () => api.get(`/api/partner-payments${qs ? `?${qs}` : ''}`),
  });
}

// ─── Mutations Hook ───────────────────────────────────────────────────────────

export function usePartnerMutations() {
  const qc = useQueryClient();

  const invalidatePartners = () => qc.invalidateQueries({ queryKey: ['partners'] });
  const invalidateContacts = (partnerId: number) =>
    qc.invalidateQueries({ queryKey: ['partner-contacts', partnerId] });
  const invalidateContracts = (partnerId: number) => {
    qc.invalidateQueries({ queryKey: ['partner-contracts', partnerId] });
    qc.invalidateQueries({ queryKey: ['partners'] });
  };
  const invalidatePayments = (partnerId: number) => {
    qc.invalidateQueries({ queryKey: ['partner-payments-by-partner', partnerId] });
    qc.invalidateQueries({ queryKey: ['partner-payments-tab'] });
    qc.invalidateQueries({ queryKey: ['partners'] });
  };
  const invalidateDocuments = (partnerId: number) =>
    qc.invalidateQueries({ queryKey: ['partner-documents', partnerId] });

  // ── Partner CRUD ──

  const createPartner = useMutation({
    mutationFn: (data: Omit<Partner, 'id' | 'created_at' | 'total_paid' | 'status'>) =>
      api.post<Partner>('/api/partners', data),
    onSuccess: invalidatePartners,
  });

  const updatePartner = useMutation({
    mutationFn: ({ id, ...data }: Partial<Partner> & { id: number }) =>
      api.put<Partner>(`/api/partners/${id}`, data),
    onSuccess: invalidatePartners,
  });

  const deletePartner = useMutation({
    mutationFn: (id: number) => api.del(`/api/partners/${id}`),
    onSuccess: invalidatePartners,
  });

  // ── Contact CRUD ──

  const createContact = useMutation({
    mutationFn: ({ partnerId, ...data }: Omit<PartnerContact, 'id'> & { partnerId: number }) =>
      api.post<PartnerContact>(`/api/partners/${partnerId}/contacts`, data),
    onSuccess: (_data, vars) => invalidateContacts(vars.partnerId),
  });

  const updateContact = useMutation({
    mutationFn: ({
      id,
      partnerId,
      ...data
    }: Partial<PartnerContact> & { id: number; partnerId: number }) =>
      api.put<PartnerContact>(`/api/partners/${partnerId}/contacts/${id}`, data),
    onSuccess: (_data, vars) => invalidateContacts(vars.partnerId),
  });

  const deleteContact = useMutation({
    mutationFn: ({ id, partnerId }: { id: number; partnerId: number }) =>
      api.del(`/api/partners/${partnerId}/contacts/${id}`),
    onSuccess: (_data, vars) => invalidateContacts(vars.partnerId),
  });

  // ── Contract CRUD ──

  const createContract = useMutation({
    mutationFn: ({ partnerId, ...data }: Omit<PartnerContract, 'id' | 'created_at' | 'total_paid' | 'payment_status'> & { partnerId: number }) =>
      api.post<PartnerContract>(`/api/partners/${partnerId}/contracts`, data),
    onSuccess: (_data, vars) => invalidateContracts(vars.partnerId),
  });

  const updateContract = useMutation({
    mutationFn: ({
      id,
      partnerId,
      ...data
    }: Partial<PartnerContract> & { id: number; partnerId: number }) =>
      api.put<PartnerContract>(`/api/partners/${partnerId}/contracts/${id}`, data),
    onSuccess: (_data, vars) => invalidateContracts(vars.partnerId),
  });

  const deleteContract = useMutation({
    mutationFn: ({ id, partnerId }: { id: number; partnerId: number }) =>
      api.del(`/api/partners/${partnerId}/contracts/${id}`),
    onSuccess: (_data, vars) => invalidateContracts(vars.partnerId),
  });

  // ── Payment CRUD ──

  const createPayment = useMutation({
    mutationFn: ({
      partnerId: _pid,
      ...data
    }: {
      partnerId: number;
      partner_id: number;
      contract_id: number;
      amount: number;
      paid_date: string;
      payment_method: 'cash' | 'cheque';
      receipt_no?: string;
      notes?: string;
    }) => api.post<PartnerPayment>('/api/partner-payments', data),
    onSuccess: (_data, vars) => invalidatePayments(vars.partnerId),
  });

  const deletePayment = useMutation({
    mutationFn: ({ id, partnerId }: { id: number; partnerId: number }) =>
      api.del(`/api/partner-payments/${id}`),
    onSuccess: (_data, vars) => invalidatePayments(vars.partnerId),
  });

  // ── Payment Attachment ──

  const deletePaymentAttachment = useMutation({
    mutationFn: ({ paymentId, id }: { id: number; partnerId: number; paymentId: number }) =>
      api.del(`/api/partner-payments/${paymentId}/attachments/${id}`),
    onSuccess: (_data, vars) => invalidatePayments(vars.partnerId),
  });

  const uploadPaymentAttachment = async (
    paymentId: number,
    partnerId: number,
    file: File,
  ) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/partner-payments/${paymentId}/attachments`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    invalidatePayments(partnerId);
    return data;
  };

  // ── Document ──

  const deleteDocument = useMutation({
    mutationFn: ({ id, partnerId }: { id: number; partnerId: number }) =>
      api.del(`/api/partners/${partnerId}/documents/${id}`),
    onSuccess: (_data, vars) => invalidateDocuments(vars.partnerId),
  });

  const uploadDocument = async (partnerId: number, file: File, docType: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', docType);
    const res = await fetch(`/api/partners/${partnerId}/documents`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    invalidateDocuments(partnerId);
    return data;
  };

  return {
    createPartner,
    updatePartner,
    deletePartner,
    createContact,
    updateContact,
    deleteContact,
    createContract,
    updateContract,
    deleteContract,
    createPayment,
    deletePayment,
    deletePaymentAttachment,
    uploadPaymentAttachment,
    deleteDocument,
    uploadDocument,
  };
}
