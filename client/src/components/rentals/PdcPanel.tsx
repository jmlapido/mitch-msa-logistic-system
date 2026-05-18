import { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Upload, Eye, Trash2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/hooks/useAuth';

type PdcRow = {
  id: number;
  contract_id: number;
  pdc_number: number;
  cheque_date: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  updated_at: string;
};

function dateColor(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / 86400000);
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

export function PdcPanel({ contractId, pdcCount }: { contractId: number; pdcCount: number }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<PdcRow | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingSlot = useRef<number>(0);

  const { data: rows = [] } = useQuery<PdcRow[]>({
    queryKey: ['pdc-cheques', contractId],
    queryFn: async () => {
      const res = await fetch(`/api/pdc-cheques?contract_id=${contractId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const slots = Array.from({ length: pdcCount }, (_, i) => {
    const n = i + 1;
    return rows.find(r => r.pdc_number === n) ?? { id: 0, contract_id: contractId, pdc_number: n, cheque_date: null, file_name: null, file_size: null, file_type: null, updated_at: '' };
  });

  const datedCount = slots.filter(s => s.cheque_date).length;
  const uploadedCount = slots.filter(s => s.file_name).length;

  async function saveDate(pdcNumber: number, value: string) {
    try {
      await fetch('/api/pdc-cheques/date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contract_id: contractId, pdc_number: pdcNumber, cheque_date: value || null }),
      });
      qc.invalidateQueries({ queryKey: ['pdc-cheques', contractId] });
    } catch { toast.error('Failed to save date'); }
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
      if (!res.ok) { const e = await res.json() as { error: string }; toast.error(e.error); return; }
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

  const isAdmin = user?.role === 'admin';

  return (
    <div className="mt-2 border-t pt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1 font-medium">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          PDC Cheques
        </span>
        <span className="text-[10px]">{datedCount}/{pdcCount} dated · {uploadedCount}/{pdcCount} uploaded</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {slots.map(s => (
            <div key={s.pdc_number} className="flex items-center gap-2 rounded border px-2 py-1.5 bg-muted/30">
              <span className="w-5 text-[10px] font-semibold text-muted-foreground shrink-0">#{s.pdc_number}</span>

              <div className="flex items-center gap-1 flex-1 min-w-0">
                <CalendarDays size={11} className="text-muted-foreground shrink-0" />
                <input
                  type="date"
                  defaultValue={s.cheque_date ?? ''}
                  disabled={!isAdmin}
                  onBlur={e => isAdmin && saveDate(s.pdc_number, e.target.value)}
                  className={`text-[11px] bg-transparent border-0 outline-none w-32 ${dateColor(s.cheque_date)} ${!isAdmin ? 'cursor-default' : ''}`}
                />
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {s.file_name ? (
                  <>
                    <span className="text-[10px] text-muted-foreground max-w-[80px] truncate hidden sm:block">{s.file_name}</span>
                    <button
                      onClick={() => setPreviewRow(s as PdcRow)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      title="Preview"
                    >
                      <Eye size={12} />
                    </button>
                    {isAdmin && (
                      <>
                        <button onClick={() => triggerUpload(s.pdc_number)} className="p-1 text-muted-foreground hover:text-foreground" title="Replace">
                          <Upload size={12} />
                        </button>
                        <button onClick={() => s.id && removeFile(s.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Remove">
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
            </div>
          ))}
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
              Cheque #{previewRow?.pdc_number} — {previewRow?.file_name}
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
