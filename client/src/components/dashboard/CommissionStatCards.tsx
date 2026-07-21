import { useNavigate } from 'react-router-dom';
import { Percent, ClipboardList } from 'lucide-react';
import { StatCard } from './StatCard';
import { AedAmount } from '@/components/ui/AedAmount';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { commissions: DashboardData['commissions'] };

export function CommissionStatCards({ commissions }: Props) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-0.5">Commissions</p>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total This Month"
          value={<AedAmount amount={commissions.total} />}
          icon={Percent}
          color="teal"
          onClick={() => navigate('/commissions')}
        />
        <StatCard
          label="Recorded"
          value={`${commissions.count} recorded`}
          icon={ClipboardList}
          color="default"
          onClick={() => navigate('/commissions')}
        />
      </div>
    </div>
  );
}
