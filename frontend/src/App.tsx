import { Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/ToastContainer';
import Sidebar from './components/Sidebar';
import { RoleGuard } from './components/RoleGuard';
import Dashboard from './pages/Dashboard';
import DeliveriesPage from './pages/Deliveries';
import CreateDeliveryPage from './pages/CreateDelivery';
import DriversPage from './pages/Drivers';
import DriverDashboardPage from './pages/DriverDashboard';
import DispatchPage from './pages/Dispatch';
import TrackingPage from './pages/Tracking';
import AIInsightsPage from './pages/AIInsights';
import AIAssistantPage from './pages/AIAssistant';
import NotificationsPage from './pages/Notifications';
import SettingsPage from './pages/Settings';
import AdminPanelPage from './pages/AdminPanel';
import LoginPage from './pages/Login';

// ---- Global Error Boundary ----
interface EBState { hasError: boolean; message: string }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base)',
          flexDirection: 'column',
          gap: 16,
          padding: 32,
          textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg,#f43f5e,#e11d48)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, marginBottom: 8,
          }}>⚠</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, lineHeight: 1.6 }}>
            {this.state.message || 'An unexpected error occurred. Please try refreshing the page.'}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload(); }}
            style={{ marginTop: 8 }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---- App Shell ----
function AppShell() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<RoleGuard allowedRoles={['customer', 'driver', 'dispatcher', 'admin']}><Dashboard /></RoleGuard>} />
          <Route path="/deliveries" element={<RoleGuard allowedRoles={['customer', 'dispatcher', 'admin']}><DeliveriesPage /></RoleGuard>} />
          <Route path="/deliveries/new" element={<RoleGuard allowedRoles={['customer', 'admin']}><CreateDeliveryPage /></RoleGuard>} />
          <Route path="/tracking/:id" element={<RoleGuard allowedRoles={['customer', 'driver', 'dispatcher', 'admin']}><TrackingPage /></RoleGuard>} />
          <Route path="/tracking" element={<RoleGuard allowedRoles={['customer', 'driver', 'dispatcher', 'admin']}><TrackingPage /></RoleGuard>} />
          <Route path="/drivers" element={<RoleGuard allowedRoles={['dispatcher', 'admin']}><DriversPage /></RoleGuard>} />
          <Route path="/driver-dashboard" element={<RoleGuard allowedRoles={['driver', 'admin']}><DriverDashboardPage /></RoleGuard>} />
          <Route path="/dispatch" element={<RoleGuard allowedRoles={['dispatcher', 'admin']}><DispatchPage /></RoleGuard>} />
          <Route path="/ai" element={<RoleGuard allowedRoles={['customer', 'driver', 'dispatcher', 'admin']}><AIInsightsPage /></RoleGuard>} />
          <Route path="/assistant" element={<RoleGuard allowedRoles={['customer', 'driver', 'dispatcher', 'admin']}><AIAssistantPage /></RoleGuard>} />
          <Route path="/notifications" element={<RoleGuard allowedRoles={['customer', 'driver', 'dispatcher', 'admin']}><NotificationsPage /></RoleGuard>} />
          <Route path="/settings" element={<RoleGuard allowedRoles={['customer', 'driver', 'dispatcher', 'admin']}><SettingsPage /></RoleGuard>} />
          <Route path="/admin" element={<RoleGuard allowedRoles={['admin']}><AdminPanelPage /></RoleGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

// ---- Root App ----
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
              <AppShell />
            </ErrorBoundary>
            <ToastContainer />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
