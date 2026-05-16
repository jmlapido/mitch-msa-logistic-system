import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, LogOut, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useSettings } from '@/lib/hooks/useSettings';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/bills', label: 'Bills' },
  { to: '/rentals', label: 'Rentals' },
  { to: '/properties', label: 'Properties' },
  { to: '/reports', label: 'Reports' },
];

export function TopNav() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <nav className="bg-primary text-primary-foreground shadow-md no-print">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-6">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          {settings?.logo_url && (
            <img src={settings.logo_url} alt="Logo" className="h-7 w-7 rounded object-contain" />
          )}
          <span className="font-bold text-sm">{settings?.company_name ?? 'BillTrack'}</span>
        </Link>

        <div className="hidden md:flex items-center gap-1 flex-1">
          {NAV_LINKS.map(({ to, label }) => {
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

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} className="text-primary-foreground hover:bg-white/10">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-white/10 gap-2">
                <User size={16} /> {user?.name}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">{user?.role}</DropdownMenuItem>
              {user?.role === 'admin' && <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>}
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut size={14} className="mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
