import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Cpu,
  Bell,
  Settings,
  LogOut,
  Zap,
  Activity,
  MessageSquare,
  Users,
  Route,
  Shield,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
  roles: Array<AuthUser['role']>;
}

interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: 'customer' | 'admin' | 'driver' | 'dispatcher';
  name: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} />, roles: ['customer', 'driver', 'dispatcher', 'admin'] },
  { label: 'Deliveries', path: '/deliveries', icon: <Package size={18} />, roles: ['customer', 'dispatcher', 'admin'] },
  { label: 'Drivers', path: '/drivers', icon: <Users size={18} />, roles: ['dispatcher', 'admin'] },
  { label: 'Driver Dashboard', path: '/driver-dashboard', icon: <Activity size={18} />, roles: ['driver', 'admin'] },
  { label: 'Dispatch', path: '/dispatch', icon: <Route size={18} />, roles: ['dispatcher', 'admin'] },
  { label: 'AI Insights', path: '/ai', icon: <Cpu size={18} />, roles: ['customer', 'driver', 'dispatcher', 'admin'] },
  { label: 'AI Assistant', path: '/assistant', icon: <MessageSquare size={18} />, roles: ['customer', 'driver', 'dispatcher', 'admin'] },
  { label: 'Notifications', path: '/notifications', icon: <Bell size={18} />, badge: 3, roles: ['customer', 'driver', 'dispatcher', 'admin'] },
  { label: 'Admin Panel', path: '/admin', icon: <Shield size={18} />, roles: ['admin'] },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: <Settings size={18} />, roles: ['customer', 'driver', 'dispatcher', 'admin'] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const userRole = user?.role || 'customer';
  const filteredNavItems = NAV_ITEMS.filter(item => item.roles.includes(userRole));
  const filteredBottomItems = BOTTOM_ITEMS.filter(item => item.roles.includes(userRole));

  return (
    <aside
      id="main-sidebar"
      style={{
        width: 'var(--sidebar-width)',
        height: '100vh',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--bg-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0, top: 0,
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '20px 18px',
          borderBottom: '1px solid var(--bg-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            background: 'linear-gradient(135deg, var(--brand-600), var(--accent-cyan))',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)',
            flexShrink: 0,
          }}
        >
          <Zap size={20} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            DeliveryHub
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.5px' }}>
            AI-POWERED PLATFORM
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.8px', padding: '8px 10px 4px', textTransform: 'uppercase' }}>
          Main Menu
        </div>

        {filteredNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            id={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            end={item.path === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              marginBottom: 2,
              color: isActive ? 'var(--brand-300)' : 'var(--text-secondary)',
              background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--brand-500)' : '2px solid transparent',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s ease',
              textDecoration: 'none',
              position: 'relative',
            })}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              if (!location.pathname.startsWith(item.path) || (item.path !== '/' && location.pathname !== item.path)) {
                el.style.background = 'var(--bg-hover)';
                el.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
              el.style.background = isActive ? 'rgba(99,102,241,0.12)' : 'transparent';
              el.style.color = isActive ? 'var(--brand-300)' : 'var(--text-secondary)';
            }}
          >
            {item.icon}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge && (
              <span
                style={{
                  background: 'var(--accent-rose)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 10,
                  padding: '1px 6px',
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}

        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.8px', padding: '16px 10px 4px', textTransform: 'uppercase' }}>
          System
        </div>

        {filteredBottomItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            id={`nav-${item.label.toLowerCase()}`}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              marginBottom: 2,
              color: isActive ? 'var(--brand-300)' : 'var(--text-secondary)',
              background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--brand-500)' : '2px solid transparent',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s ease',
              textDecoration: 'none',
            })}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User Footer */}
      <div
        style={{
          padding: '14px 14px',
          borderTop: '1px solid var(--bg-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
            {user?.role}
          </div>
        </div>
        <button
          id="btn-logout"
          onClick={logout}
          title="Logout"
          style={{ color: 'var(--text-muted)', padding: 5, borderRadius: 6, transition: 'all 0.15s' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-rose)'; (e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.1)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
