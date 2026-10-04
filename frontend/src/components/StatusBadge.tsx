import type { DeliveryStatus, DriverStatus, RiskLevel } from '../types/api';

const DELIVERY_STATUS_STYLES: Record<DeliveryStatus, { bg: string; color: string; label: string }> = {
  CREATED:    { bg: 'rgba(99,102,241,0.15)',   color: '#818cf8', label: 'Created' },
  ASSIGNING:  { bg: 'rgba(245,158,11,0.15)',   color: '#f59e0b', label: 'Assigning' },
  ASSIGNED:   { bg: 'rgba(6,182,212,0.15)',    color: '#06b6d4', label: 'Assigned' },
  PICKED_UP:  { bg: 'rgba(139,92,246,0.15)',   color: '#8b5cf6', label: 'Picked Up' },
  IN_TRANSIT: { bg: 'rgba(59,130,246,0.15)',   color: '#60a5fa', label: 'In Transit' },
  DELIVERED:  { bg: 'rgba(16,185,129,0.15)',   color: '#10b981', label: 'Delivered' },
  CANCELLED:  { bg: 'rgba(244,63,94,0.15)',    color: '#f43f5e', label: 'Cancelled' },
};

const DRIVER_STATUS_STYLES: Record<DriverStatus, { bg: string; color: string; label: string }> = {
  OFFLINE:   { bg: 'rgba(71,85,105,0.2)',    color: '#64748b', label: 'Offline' },
  AVAILABLE: { bg: 'rgba(16,185,129,0.15)',  color: '#10b981', label: 'Available' },
  RESERVED:  { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', label: 'Reserved' },
  BUSY:      { bg: 'rgba(244,63,94,0.15)',   color: '#f43f5e', label: 'Busy' },
};

const RISK_STYLES: Record<RiskLevel, { bg: string; color: string }> = {
  LOW:    { bg: 'rgba(16,185,129,0.15)',  color: '#10b981' },
  MEDIUM: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  HIGH:   { bg: 'rgba(244,63,94,0.15)',  color: '#f43f5e' },
};

interface DeliveryStatusBadgeProps {
  status: DeliveryStatus;
}

export function DeliveryStatusBadge({ status }: DeliveryStatusBadgeProps) {
  const style = DELIVERY_STATUS_STYLES[status];
  return (
    <span
      className="badge"
      style={{ background: style.bg, color: style.color }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: style.color,
          display: 'inline-block',
          animation: ['ASSIGNING', 'IN_TRANSIT'].includes(status) ? 'dotPulse 1.5s infinite' : 'none',
        }}
      />
      {style.label}
    </span>
  );
}

interface DriverStatusBadgeProps {
  status: DriverStatus;
}

export function DriverStatusBadge({ status }: DriverStatusBadgeProps) {
  const style = DRIVER_STATUS_STYLES[status];
  return (
    <span
      className="badge"
      style={{ background: style.bg, color: style.color }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: style.color,
          display: 'inline-block',
          animation: status === 'AVAILABLE' ? 'dotPulse 2s infinite' : 'none',
        }}
      />
      {style.label}
    </span>
  );
}

interface RiskBadgeProps {
  risk: RiskLevel;
}

export function RiskBadge({ risk }: RiskBadgeProps) {
  const style = RISK_STYLES[risk];
  return (
    <span
      className="badge"
      style={{ background: style.bg, color: style.color }}
    >
      {risk} RISK
    </span>
  );
}
