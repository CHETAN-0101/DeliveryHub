import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const ICONS = {
  success: <CheckCircle size={16} color="var(--accent-emerald)" />,
  error: <XCircle size={16} color="var(--accent-rose)" />,
  info: <Info size={16} color="var(--brand-400)" />,
  warning: <AlertTriangle size={16} color="var(--accent-amber)" />,
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {ICONS[toast.type]}
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>
            {toast.message}
          </span>
          <button
            id={`toast-close-${toast.id}`}
            onClick={() => removeToast(toast.id)}
            style={{ color: 'var(--text-muted)', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
