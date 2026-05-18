import { toast } from 'sonner';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePendingArchiveTenants, useRentalMutations } from '@/lib/hooks/useRentals';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/hooks/useAuth';

export function ArchiveBanner() {
  const { user } = useAuth();
  const { data: pending = [] } = usePendingArchiveTenants();
  const { archiveTenant } = useRentalMutations();

  if (user?.role === 'staff' || pending.length === 0) return null;

  async function handleArchive(id: number, name: string) {
    if (!confirm(`Archive ${name}? Their unit will be freed and financial records will be kept for 1 year.`)) return;
    try {
      await archiveTenant.mutateAsync(id);
      toast.success(`${name} archived`);
    } catch { toast.error('Failed to archive'); }
  }

  return (
    <div className="mb-4 space-y-2">
      {pending.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <Archive size={14} className="text-yellow-600 dark:text-yellow-400 shrink-0" />
            <span>
              <span className="font-medium">{t.name}</span>
              {t.end_date && <span className="text-muted-foreground ml-1">— contract ended {formatDate(t.end_date)}</span>}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleArchive(t.id, t.name)}>
            Archive
          </Button>
        </div>
      ))}
    </div>
  );
}
