import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, LogOut, User, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useSettings } from '@/lib/hooks/useSettings';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BASE_NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/bills', label: 'Bills' },
  { to: '/rentals', label: 'Rentals' },
  { to: '/partners', label: 'Partners' },
  { to: '/reports', label: 'Reports' },
];

export function TopNav() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = user?.role === 'superadmin'
    ? [...BASE_NAV, { to: '/logs', label: 'Logs' }]
    : BASE_NAV;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <nav className="bg-primary text-primary-foreground shadow-md no-print">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          {settings?.logo_url && (
            <img src={settings.logo_url} alt="Logo" className="h-7 w-7 rounded object-contain" />
          )}
          <span className="font-bold text-sm">{settings?.company_name ?? 'MSA Logistic'}</span>
        </Link>

        <div className="hidden md:flex items-center gap-1 flex-1">
          {navLinks.map(({ to, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to} to={to}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  active ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="text-primary-foreground hover:bg-white/10">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-white/10 gap-2 hidden md:inline-flex">
                <User size={16} /> {user?.name}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">{user?.role}</DropdownMenuItem>
              {(user?.role === 'admin' || user?.role === 'superadmin') && (
                <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut size={14} className="mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost" size="icon"
            onClick={() => setMobileOpen(o => !o)}
            className="md:hidden text-primary-foreground hover:bg-white/10"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-white/20 px-4 py-2 space-y-1">
          {navLinks.map(({ to, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to} to={to}
                className={`block px-3 py-2 rounded text-sm transition-colors ${
                  active ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <div className="border-t border-white/20 pt-2 mt-2 flex items-center justify-between">
            <span className="text-sm text-white/80">{user?.name} · {user?.role}</span>
            <div className="flex gap-1">
              {(user?.role === 'admin' || user?.role === 'superadmin') && (
                <Link to="/settings" className="text-xs px-2 py-1 rounded hover:bg-white/10">Settings</Link>
              )}
              <button onClick={logout} className="text-xs px-2 py-1 rounded hover:bg-white/10 text-red-300">Sign out</button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
