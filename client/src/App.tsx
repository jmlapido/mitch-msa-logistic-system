import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/hooks/useAuth';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { TopNav } from '@/components/layout/TopNav';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Bills from '@/pages/Bills';
import Customers from '@/pages/Customers';
import RentalsPayments from './pages/RentalsPayments';
import RentalsUnits from './pages/RentalsUnits';
import Partners from '@/pages/Partners';
import Commissions from '@/pages/Commissions';
import Withdrawals from '@/pages/Withdrawals';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import AuditLogs from '@/pages/AuditLogs';
import { AdminRoute } from '@/components/layout/AdminRoute';
import { SuperAdminRoute } from '@/components/layout/SuperAdminRoute';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNav />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
      <footer className="no-print border-t mt-8 py-2 text-center text-xs text-muted-foreground">
        Designed and Developed for MSA Logistic by{' '}
        <a
          href="https://fb.com/jmlapido"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground underline underline-offset-2 transition-colors"
        >
          JMLapido
        </a>
      </footer>
    </div>
  );
}

function LegacyRentalsRedirect() {
  const [searchParams] = useSearchParams();
  const building = searchParams.get('building');
  return <Navigate to={building ? `/rentals/units?building=${encodeURIComponent(building)}` : '/rentals/payments'} replace />;
}

function LegacyBuildingsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/rentals/units${search}`} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Toaster richColors position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/bills" element={<Bills />} />
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/rentals" element={<LegacyRentalsRedirect />} />
                    <Route path="/rentals/payments" element={<RentalsPayments />} />
                    <Route path="/rentals/units" element={<RentalsUnits />} />
                    <Route path="/rentals/buildings" element={<LegacyBuildingsRedirect />} />
                    <Route path="/partners" element={<Partners />} />
                    <Route path="/commissions" element={<Commissions />} />
                    <Route path="/withdrawals" element={<Withdrawals />} />
                    <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
                    <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
                    <Route path="/logs" element={<SuperAdminRoute><AuditLogs /></SuperAdminRoute>} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
