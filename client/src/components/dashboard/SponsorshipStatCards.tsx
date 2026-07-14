import { useNavigate } from 'react-router-dom';
import { Handshake, TrendingUp } from 'lucide-react';
import { StatCard } from './StatCard';
import { AedAmount } from '@/components/ui/AedAmount';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { sponsorships: DashboardData['sponsorships'] };

export function SponsorshipStatCards({ sponsorships: s }: Props) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-0.5">Sponsorships</p>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Contract Value"
          value={<AedAmount amount={s.totalContractValue} />}
          icon={Handshake}
          color="purple"
          delta={{ value: `${s.activeCount} active sponsor${s.activeCount !== 1 ? 's' : ''}`, direction: 'neutral' }}
          onClick={() => navigate('/partners')}
        />
        <StatCard
          label="Collected"
          value={<AedAmount amount={s.collected} />}
          icon={TrendingUp}
          color="green"
          delta={{
            value: s.pending > 0 || s.overdue > 0
              ? `${s.pending > 0 ? `AED ${s.pending.toLocaleString()} pending` : ''}${s.pending > 0 && s.overdue > 0 ? ' · ' : ''}${s.overdue > 0 ? `AED ${s.overdue.toLocaleString()} overdue` : ''}`
              : '— all collected',
            direction: s.overdue > 0 ? 'down' : 'neutral',
          }}
          onClick={() => navigate('/partners')}
        />
      </div>
    </div>
  );
}
