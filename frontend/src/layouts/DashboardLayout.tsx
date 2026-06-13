import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Wallet, Package, Box, Settings,
  Users, ChevronLeft, ChevronRight, LogOut, Menu, X,
  Truck, AlertTriangle, BarChart2, User, Layers, PenLine, Bell
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../services/api';

interface NavItem {
  label: string;
  icon: React.ComponentType<any>;
  href: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Admin Approvals', icon: PenLine, href: '/administrative-approvals' },
  { label: 'Purchase Indents', icon: FileText, href: '/pr' },
  { label: 'Budget', icon: Wallet, href: '/budget', roles: ['faculty', 'hod', 'admin', 'dean_approver', 'apex_approver'] },
  { label: 'Deliveries', icon: Truck, href: '/inventory/deliveries', roles: ['faculty', 'hod', 'verifier_sp', 'admin'] },
  { label: 'Assets', icon: Box, href: '/assets' },
  { label: 'Discrepancies', icon: AlertTriangle, href: '/inventory/discrepancies', roles: ['admin', 'verifier_sp', 'apex_approver'] },
  { label: 'Analytics', icon: BarChart2, href: '/analytics', roles: ['admin', 'apex_approver'] },
  { label: 'My Profile', icon: User, href: '/profile' },
  { label: 'Users', icon: Users, href: '/admin/users', roles: ['admin'] },
  { label: 'Settings', icon: Settings, href: '/admin/settings', roles: ['admin'] },
];

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.unreadCount().then((res) => res.data),
    refetchInterval: 10000,
    enabled: !!user,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => notificationsApi.list().then(res => res.data),
    refetchInterval: 10000,
    enabled: !!user,
  });

  const readAllMutation = useMutation({
    mutationFn: () => notificationsApi.readAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    }
  });

  const readSingleMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.read(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    }
  });

  const unreadCount = unreadData?.count || 0;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.label === 'Purchase Indents' && user?.designation === 'Dean P&D (Budget)') {
      return false;
    }
    return !item.roles || (user?.role && item.roles.includes(user.role.group_key));
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside
      className={`flex flex-col h-full sidebar-bg ${mobile ? 'w-72' : collapsed ? 'w-16' : 'w-64'} transition-all duration-300`}
    >
      {/* Branding */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-slate-300 bg-white ${collapsed && !mobile ? 'justify-center' : ''}`}>
        <img src="/NITLOGO.png" alt="NIT Logo" className="w-12 h-12 object-contain flex-shrink-0" />
        {(!collapsed || mobile) && (
          <div>
            <div className="text-lg font-black text-[#1a3a6b] tracking-tight leading-none">NIT INVENTORY</div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5">NIT Tiruchirappalli</div>
          </div>
        )}
      </div>

      {/* Role badge */}
      {(!collapsed || mobile) && user?.role && (
        <div className="px-4 pt-4">
          <div className="px-3 py-1.5 bg-white border border-slate-200 text-xs text-slate-700 font-medium text-center">
            {user.role.name}
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const active = item.href === '/dashboard'
            ? location.pathname === '/dashboard'
            : location.pathname === item.href || location.pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={`${active ? 'nav-item-active' : 'nav-item'} ${collapsed && !mobile ? 'justify-center px-2' : ''}`}
              title={collapsed && !mobile ? item.label : undefined}
            >
              {(!collapsed || mobile) ? (
                <span>{item.label}</span>
              ) : (
                <span className="text-xs font-black tracking-wider text-slate-800">{item.label.substring(0, 2).toUpperCase()}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className={`border-t border-slate-300 p-3 bg-white ${collapsed && !mobile ? 'flex flex-col items-center gap-2' : ''}`}>
        {!collapsed || mobile ? (
          <div className="flex items-center gap-3 w-full">
            <Link to="/profile" className="w-8 h-8 bg-blue-100 border border-blue-200 flex items-center justify-center text-xs font-bold text-[#1a3a6b] flex-shrink-0 hover:bg-blue-200 transition-colors rounded-sm" title="My Profile Settings">
              {user?.name?.charAt(0).toUpperCase()}
            </Link>
            <div className="flex-1 min-w-0">
              <Link to="/profile" className="text-xs font-bold text-slate-800 truncate hover:text-[#1a3a6b] hover:underline block">{user?.name}</Link>
              <div className="text-xs text-slate-500 truncate">{user?.email}</div>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 transition-colors p-1" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Link to="/profile" className="w-8 h-8 bg-blue-100 border border-blue-200 flex items-center justify-center text-xs font-bold text-[#1a3a6b] flex-shrink-0 hover:bg-blue-200 transition-colors rounded-sm" title="My Profile Settings">
              {user?.name?.charAt(0).toUpperCase()}
            </Link>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 transition-colors p-2" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen formal-bg overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col flex-shrink-0 border-r border-slate-300 z-20 shadow-sm relative bg-slate-100">
        <Sidebar />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute bottom-20 -right-3 w-6 h-6 bg-white border border-slate-300 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-50 hover:text-[#1a3a6b]"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/50 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full z-50 md:hidden bg-slate-100 shadow-xl">
            <Sidebar mobile />
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-300 shadow-sm flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-slate-600 hover:text-[#1a3a6b]" onClick={() => setMobileOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-sm font-bold text-[#1a3a6b] capitalize">
                {location.pathname.split('/').filter(Boolean).join(' / ') || 'Dashboard'}
              </h1>
              <p className="text-xs text-slate-500">Institutional Resource & Inventory System</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-550 hover:text-slate-700 transition focus:outline-none z-50"
                title="View Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 border border-white text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden text-left">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                      <span className="text-xs font-bold text-slate-800">Notifications</span>
                      {notifications.some((n: any) => !n.is_read) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            readAllMutation.mutate();
                          }}
                          className="text-[10px] font-bold text-[#1a3a6b] hover:underline"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs text-slate-405 italic font-medium animate-pulse">
                          No notifications yet.
                        </div>
                      ) : (
                        notifications.map((n: any) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              if (!n.is_read) {
                                readSingleMutation.mutate(n.id);
                              }
                              setShowNotifications(false);
                              if (n.link) navigate(n.link);
                            }}
                            className={`p-3 text-xs transition-all cursor-pointer relative hover:bg-slate-50 ${
                              n.is_read ? 'bg-white text-slate-500' : 'bg-blue-50/40 text-slate-800'
                            }`}
                          >
                            {!n.is_read && (
                              <span className="absolute top-4 right-3 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                            )}
                            <div className="flex justify-between items-center gap-1.5">
                              <span className="font-bold text-slate-700 truncate max-w-[170px]">{n.title}</span>
                              <span className="text-[9px] text-slate-400 font-mono shrink-0">
                                {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-normal mt-0.5 line-clamp-2">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800">{user?.name}</div>
              <div className="text-xs text-slate-500">{user?.department?.name || 'Central Office'}</div>
            </div>
          </div>
        </header>

        {/* Signature Required Banner */}
        {user && !user.signature_path && location.pathname !== '/profile' && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 flex-shrink-0">
            <PenLine size={15} className="text-amber-600 shrink-0" />
            <p className="text-xs font-semibold flex-1">
              <span className="font-bold">Digital Signature Required —</span>{' '}
              Your account has no digital signature uploaded. Workflow approvals and official documents require your signature.
            </p>
            <Link
              to="/profile"
              className="shrink-0 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1 rounded transition-colors"
            >
              Upload Signature →
            </Link>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#f8fafc]">
          <div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
