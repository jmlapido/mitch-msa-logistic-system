import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/hooks/useAuth';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== 'admin' && user?.role !== 'superadmin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
