import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/hooks/useAuth';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { TopNav } from '@/components/layout/TopNav';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Bills from '@/pages/Bills';
import Rentals from '@/pages/Rentals';
import Partners from '@/pages/Partners';
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
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
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
                    <Route path="/rentals" element={<Rentals />} />
                    <Route path="/partners" element={<Partners />} />
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
