import { useRef, useState } from 'react';
import { Paperclip, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRentalDocs, useRentalMutations } from '@/lib/hooks/useRentals';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatDate } from '@/lib/utils';

type Props = { entityType: 'lease' | 'tenant' | 'unit'; entityId: number };
const DOC_TYPES = ['contract', 'agreement', 'id_copy', 'other'] as const;

export function DocumentsPanel({ entityType, entityId }: Props) {
  const { data: docs = [] } = useRentalDocs(entityType, entityId);
  const { uploadDoc, deleteDoc } = useRentalMutations();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>('contract');

  async function handleUpload(file: File) {
    try {
      await uploadDoc(file, entityType, entityId, docType);
      toast.success('Document uploaded');
    } catch { toast.error('Upload failed'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this document?')) return;
    try { await deleteDoc.mutateAsync(id); toast.success('Deleted'); }
    catch { toast.error('Delete failed'); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs capitalize">{t.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="h-8 text-xs">
          <Paperclip size={12} className="mr-1" /> Attach
        </Button>
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic"
          onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
      </div>
      {docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents attached</p>
      ) : (
        <div className="space-y-1">
          {docs.map(d => (
            <div key={d.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
              <div>
                <span className="font-medium capitalize">{d.doc_type.replace('_', ' ')}</span>
                <span className="text-muted-foreground ml-2">{d.file_name}</span>
                <span className="text-muted-foreground ml-2">{formatDate(d.uploaded_at)}</span>
              </div>
              <div className="flex gap-1">
                <a href={`/api/rental-documents/${d.id}/download`} target="_blank" rel="noreferrer"
                  className="p-1 hover:text-primary"><Eye size={12} /></a>
                {user?.role === 'admin' && (
                  <button onClick={() => handleDelete(d.id)} className="p-1 hover:text-destructive"><Trash2 size={12} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
