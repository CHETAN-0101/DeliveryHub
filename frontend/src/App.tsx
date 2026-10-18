import { Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/ToastContainer';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DeliveriesPage from './pages/Deliveries';
import DriversPage from './pages/Drivers';
import DriverDashboardPage from './pages/DriverDashboard';
import DispatchPage from './pages/Dispatch';
import AIInsightsPage from './pages/AIInsights';
import AIAssistantPage from './pages/AIAssistant';
import NotificationsPage from './pages/Notifications';
import SettingsPage from './pages/Settings';
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
          <Route path="/" element={<Dashboard />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/driver-dashboard" element={<DriverDashboardPage />} />
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route path="/ai" element={<AIInsightsPage />} />
          <Route path="/assistant" element={<AIAssistantPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
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
