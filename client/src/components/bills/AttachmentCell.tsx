import { useRef } from 'react';
import { Paperclip, Eye } from 'lucide-react';
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
    toast.success('Attached');
    qc.invalidateQueries({ queryKey: ['bill-entries', month] });
  }

  return (
    <div className="flex items-center gap-1">
      {entry.attachment_count > 0 && (
        <a href={`/api/bill-attachments?entry_id=${entry.entry_id}`}
           target="_blank" rel="noreferrer"
           className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
          <Eye size={12} /> {entry.attachment_count}
        </a>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Attach file"
      >
        <Paperclip size={14} />
      </button>
      <input
        ref={fileRef} type="file" className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.heic"
        onChange={e => e.target.files?.[0] && upload(e.target.files[0])}
      />
    </div>
  );
}
