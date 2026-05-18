import { useRef } from 'react';
import { Paperclip, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { BillEntry } from '@/lib/hooks/useBills';

type Props = { entry: BillEntry; month: string };

export function AttachmentCell({ entry, month }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  async function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entry_id', String(entry.entry_id));
    const res = await fetch('/api/bill-attachments', { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) { toast.error('Upload failed'); return; }
    toast.success('Invoice attached');
    qc.invalidateQueries({ queryKey: ['bill-entries', month] });
  }

  return (
    <div className="flex items-center justify-center gap-1.5">
      {entry.attachment_count > 0 ? (
        <a href={`/api/bill-attachments?entry_id=${entry.entry_id}`}
           target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
          <CheckCircle size={12} />
          {entry.attachment_count === 1 ? 'Attached' : `${entry.attachment_count} files`}
        </a>
      ) : (
        <span className="text-xs text-muted-foreground">No invoice</span>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        className="text-muted-foreground hover:text-primary transition-colors"
        title="Upload invoice"
      >
        <Paperclip size={13} />
      </button>
      <input
        ref={fileRef} type="file" className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.heic"
        onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ''; }}
      />
    </div>
  );
}
