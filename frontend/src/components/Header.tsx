import { Search, Bell, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  loading?: boolean;
}

export default function Header({ title, subtitle, onRefresh, loading }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header
      style={{
        height: 'var(--header-height)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--bg-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Title */}
      <div style={{ flex: 1 }}>
        <h1
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--bg-border)',
          borderRadius: 8,
          padding: '6px 12px',
          width: 220,
        }}
      >
        <Search size={14} color="var(--text-muted)" />
        <input
          id="header-search"
          placeholder="Quick search..."
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
            flex: 1,
          }}
        />
      </div>

      {/* Refresh */}
      {onRefresh && (
        <button
          id="btn-refresh"
          onClick={onRefresh}
          className="btn btn-secondary btn-sm"
          title="Refresh data"
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      )}

      {/* Notifications */}
      <button
        id="btn-notifications"
        style={{
          position: 'relative',
          color: 'var(--text-secondary)',
          padding: 8,
          borderRadius: 8,
          transition: 'all 0.15s',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--bg-border)',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-500)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)'; }}
      >
        <Bell size={16} />
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 7,
            height: 7,
            background: 'var(--accent-rose)',
            borderRadius: '50%',
            border: '1.5px solid var(--bg-surface)',
          }}
        />
      </button>

      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, var(--brand-700), var(--brand-500))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          color: '#fff',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        title={user?.name}
      >
        {user?.name?.charAt(0).toUpperCase()}
      </div>
    </header>
  );
}
