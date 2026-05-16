import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/hooks/useAuth';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
