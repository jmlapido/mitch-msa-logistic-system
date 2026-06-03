import { useState, useRef } from 'react';
import { DateInput } from '@/components/ui/DateInput';
import { ChevronDown, ChevronRight, Upload, Eye, Trash2, CalendarDays, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/hooks/useAuth';

type PdcRow = {
  id: number;
  contract_id: number;
  pdc_number: number;
  cheque_date: string | null;
  amount: number | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  updated_at: string;
};

const INTERVAL_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  'semi-annual': 6,
  annual: 12,
};

const SLOT_COUNTS: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  'semi-annual': 2,
  annual: 1,
};

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
}

function dateColor(dateStr: string | null): string {
  if (!dateStr) return '';
  const diffDays = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return 'text-red-600 dark:text-red-400';
  if (diffDays <= 30) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function formatBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  contractId: number;
  paymentFrequency: string;
  paymentType: string;
  startDate: string;
  slotCount: number;
  annualRent: number;
};

export function PaymentSchedulePanel({ contractId, paymentFrequency, paymentType, startDate, slotCount, annualRent }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<PdcRow | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingSlot = useRef<number>(0);
  const currentDateRef = useRef<Record<number, string>>({});

  const { data: rows = [] } = useQuery<PdcRow[]>({
    queryKey: ['pdc-cheques', contractId],
    queryFn: async () => {
      const res = await fetch(`/api/pdc-cheques?contract_id=${contractId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const isCustom = paymentFrequency === 'custom';
  const isPdc = paymentType === 'pdc';
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // PDC: virtual slots from no_of_pdc count, blank dates, merges with saved rows
  const pdcSlots = isPdc
    ? Array.from({ length: slotCount }, (_, i) => {
        const n = i + 1;
        const saved = rows.find(r => r.pdc_number === n);
        return {
          pdc_number: n,
          id: saved?.id ?? 0,
          contract_id: contractId,
          cheque_date: saved?.cheque_date ?? null,
          amount: (saved as PdcRow | undefined)?.amount ?? null,
          file_name: saved?.file_name ?? null,
          file_size: saved?.file_size ?? null,
          file_type: saved?.file_type ?? null,
          updated_at: saved?.updated_at ?? '',
        };
      })
    : [];

  // Cash standard: auto-dated virtual slots (unchanged behavior)
  const standardSlots = (!isPdc && !isCustom) ? (() => {
    const count = SLOT_COUNTS[paymentFrequency] ?? slotCount;
    const interval = INTERVAL_MONTHS[paymentFrequency] ?? 1;
    return Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const autoDate = startDate ? addMonths(startDate, i * interval) : null;
      const saved = rows.find(r => r.pdc_number === n);
      return {
        pdc_number: n,
        id: saved?.id ?? 0,
        contract_id: contractId,
        cheque_date: saved?.cheque_date ?? autoDate,
        amount: null as number | null,
        file_name: saved?.file_name ?? null,
        file_size: saved?.file_size ?? null,
        file_type: saved?.file_type ?? null,
        updated_at: saved?.updated_at ?? '',
        autoDate,
      };
    });
  })() : [];

  // Cash custom: actual DB rows
  const customSlots = (!isPdc && isCustom)
    ? [...rows].sort((a, b) => a.pdc_number - b.pdc_number).map(r => ({ ...r, amount: null as number | null }))
    : [];

  const displaySlots = isPdc ? pdcSlots : isCustom ? customSlots : standardSlots;

  const datedCount = displaySlots.filter(s => s.cheque_date).length;
  const amountSetCount = isPdc ? displaySlots.filter(s => s.amount != null).length : 0;
  const uploadedCount = isPdc ? displaySlots.filter(s => s.file_name).length : 0;
  const totalCount = displaySlots.length;

  const panelLabel = isPdc ? 'Cheque Schedule' : 'Payment Schedule';

  async function saveSlot(pdcNumber: number, cheque_date: string, amount: number | null) {
    try {
      await fetch('/api/pdc-cheques/date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contract_id: contractId, pdc_number: pdcNumber, cheque_date: cheque_date || null, amount: amount ?? null }),
      });
      qc.invalidateQueries({ queryKey: ['pdc-cheques', contractId] });
    } catch { toast.error('Failed to save'); }
  }

  async function addCustomSlot() {
    setAdding(true);
    try {
      const nextNum = customSlots.length > 0 ? Math.max(...customSlots.map(s => s.pdc_number)) + 1 : 1;
      const res = await fetch('/api/pdc-cheques/date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contract_id: contractId, pdc_number: nextNum, cheque_date: null }),
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ['pdc-cheques', contractId] });
    } catch { toast.error('Failed to add slot'); }
    finally { setAdding(false); }
  }

  async function removeCustomSlot(id: number) {
    if (!confirm('Remove this payment slot?')) return;
    try {
      const res = await fetch(`/api/pdc-cheques/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ['pdc-cheques', contractId] });
      toast.success('Removed');
    } catch { toast.error('Failed to remove'); }
  }

  function triggerUpload(pdcNumber: number) {
    uploadingSlot.current = pdcNumber;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const pdcNumber = uploadingSlot.current;
    setUploading(pdcNumber);
    try {
      const fd = new FormData();
      fd.append('contract_id', String(contractId));
      fd.append('pdc_number', String(pdcNumber));
      fd.append('file', file);
      const res = await fetch('/api/pdc-cheques/upload', { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) { const err = await res.json() as { error: string }; toast.error(err.error); return; }
      qc.invalidateQueries({ queryKey: ['pdc-cheques', contractId] });
      toast.success('Uploaded');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(null); }
  }

  async function removeFile(id: number) {
    if (!confirm('Remove this file?')) return;
    try {
      await fetch(`/api/pdc-cheques/${id}/file`, { method: 'DELETE', credentials: 'include' });
      qc.invalidateQueries({ queryKey: ['pdc-cheques', contractId] });
      toast.success('Removed');
    } catch { toast.error('Failed'); }
  }

  const totalAmount = isPdc
    ? displaySlots.reduce((sum, s) => sum + (s.amount ?? 0), 0)
    : 0;

  const summaryParts: string[] = [];
  summaryParts.push(`${datedCount}/${totalCount} dated`);
  if (isPdc) {
    summaryParts.push(`${amountSetCount}/${totalCount} amounts`);
    summaryParts.push(`${uploadedCount}/${totalCount} uploaded`);
    if (amountSetCount > 0 && totalAmount < annualRent) {
      const shortfall = annualRent - totalAmount;
      summaryParts.push(`⚠ ${shortfall.toLocaleString('en-US', { maximumFractionDigits: 2 })} uncovered`);
    }
  }

  return (
    <div className="mt-2 border-t pt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1 font-medium">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {panelLabel}
        </span>
        <span className="text-[10px]">{summaryParts.join(' · ')}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {displaySlots.map((s, idx) => (
            <div key={isPdc ? s.pdc_number : isCustom ? s.id : `${s.pdc_number}-${s.cheque_date ?? ''}`} className="flex items-center gap-2 rounded border px-2 py-1.5 bg-muted/30">
              <span className="w-5 text-[10px] font-semibold text-muted-foreground shrink-0">#{idx + 1}</span>

              <div className="flex items-center gap-1 flex-1 min-w-0">
                <CalendarDays size={11} className="text-muted-foreground shrink-0" />
                <DateInput
                  value={s.cheque_date ?? ''}
                  onChange={v => {
                    if (isAdmin) {
                      currentDateRef.current[s.pdc_number] = v;
                      saveSlot(s.pdc_number, v, s.amount ?? null);
                    }
                  }}
                  disabled={!isAdmin}
                  className={`text-[11px] bg-transparent border-0 outline-none w-32 h-auto py-0 px-0 rounded-none ${dateColor(s.cheque_date)} ${!isAdmin ? 'cursor-default' : ''}`}
                />
                {isPdc && (
                  <input
                    key={`amt-${s.pdc_number}-${s.amount}`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount"
                    defaultValue={s.amount ?? ''}
                    disabled={!isAdmin}
                    onBlur={e => isAdmin && saveSlot(
                      s.pdc_number,
                      currentDateRef.current[s.pdc_number] ?? s.cheque_date ?? '',
                      e.target.value ? Number(e.target.value) : null
                    )}
                    className="text-[11px] bg-transparent border-0 border-b border-muted outline-none w-24 h-auto py-0 px-1 rounded-none placeholder:text-muted-foreground/50"
                  />
                )}
              </div>

              {isPdc && (
                <div className="flex items-center gap-1 shrink-0">
                  {s.file_name ? (
                    <>
                      <span className="text-[10px] text-muted-foreground max-w-[80px] truncate hidden sm:block">{s.file_name}</span>
                      <button onClick={() => setPreviewRow(s as PdcRow)} className="p-1 text-muted-foreground hover:text-foreground" title="Preview">
                        <Eye size={12} />
                      </button>
                      {isAdmin && (
                        <>
                          <button onClick={() => triggerUpload(s.pdc_number)} className="p-1 text-muted-foreground hover:text-foreground" title="Replace">
                            <Upload size={12} />
                          </button>
                          <button onClick={() => s.id && removeFile(s.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Remove file">
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </>
                  ) : isAdmin ? (
                    <button
                      onClick={() => triggerUpload(s.pdc_number)}
                      disabled={uploading === s.pdc_number}
                      className="flex items-center gap-0.5 text-[11px] text-primary hover:underline disabled:opacity-50"
                    >
                      <Upload size={11} /> {uploading === s.pdc_number ? 'Uploading…' : 'Upload'}
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">No file</span>
                  )}
                </div>
              )}

              {!isPdc && isCustom && isAdmin && (
                <button
                  onClick={() => removeCustomSlot(s.id)}
                  disabled={s.id === 0}
                  className="p-1 text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                  title="Remove slot"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}

          {!isPdc && isCustom && isAdmin && (
            <button
              onClick={addCustomSlot}
              disabled={adding}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50 mt-1"
            >
              <Plus size={11} /> {adding ? 'Adding…' : 'Add payment slot'}
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        onChange={handleFileChange}
      />

      <Dialog open={!!previewRow} onOpenChange={v => !v && setPreviewRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Payment #{previewRow?.pdc_number} — {previewRow?.file_name}
              {previewRow?.file_size && <span className="text-xs font-normal text-muted-foreground ml-2">{formatBytes(previewRow.file_size)}</span>}
            </DialogTitle>
          </DialogHeader>
          {previewRow?.id && (
            previewRow.file_type?.startsWith('image/') ? (
              <img
                src={`/api/pdc-cheques/${previewRow.id}/file`}
                alt={previewRow.file_name ?? ''}
                className="w-full rounded object-contain max-h-[70vh]"
              />
            ) : (
              <iframe
                src={`/api/pdc-cheques/${previewRow.id}/file`}
                className="w-full h-[70vh] rounded border"
                title={previewRow.file_name ?? ''}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
