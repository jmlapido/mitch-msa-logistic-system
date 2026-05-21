import { useNavigate } from 'react-router-dom';
import { Handshake, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import { StatCard } from './StatCard';
import { AedAmount } from '@/components/ui/AedAmount';
import type { DashboardData } from '@/lib/hooks/useDashboard';

type Props = { sponsorships: DashboardData['sponsorships'] };

export function SponsorshipStatCards({ sponsorships: s }: Props) {
  const navigate = useNavigate();
  const rate = s.totalContractValue > 0
    ? Math.round((s.collected / s.totalContractValue) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-0.5">Sponsorships</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          delta={{ value: `▲ ${rate}% rate`, direction: 'up' }}
          onClick={() => navigate('/partners')}
        />
        <StatCard
          label="Pending"
          value={<AedAmount amount={s.pending} />}
          icon={Clock}
          color="yellow"
          delta={{ value: '— outstanding balance', direction: 'neutral' }}
          onClick={() => navigate('/partners')}
        />
        <StatCard
          label="Overdue"
          value={<AedAmount amount={s.overdue} />}
          icon={AlertTriangle}
          color={s.overdue > 0 ? 'red' : 'default'}
          delta={{ value: s.overdue > 0 ? '▼ needs attention' : '— all on track', direction: s.overdue > 0 ? 'down' : 'neutral' }}
          onClick={() => navigate('/partners')}
        />
      </div>
    </div>
  );
}
