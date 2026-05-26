import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { DashboardPage } from './pages/Dashboard';
import { PRListPage } from './pages/PRList';
import { PRDetailPage } from './pages/PRDetail';
import { NewPRPage } from './pages/NewPR';
import { AssetListPage, AssetPublicPage } from './pages/Assets';
import { DeliveriesPage, DiscrepanciesPage } from './pages/Inventory';
import { BudgetPage } from './pages/admin/BudgetPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { DeliveryDetailPage } from './pages/DeliveryDetail';
import { AssetDetailPage } from './pages/AssetDetail';
import { AnalyticsPage } from './pages/Placeholders';
import { ProfilePage } from './pages/ProfilePage';

const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen formal-bg flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#1a3a6b] border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && user.role && !roles.includes(user.role.group_key)) return <Navigate to="/dashboard" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
};

const App: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen formal-bg flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-[#1a3a6b] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />
        <Route path="/public/asset/:tag" element={<AssetPublicPage />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/pr" element={<ProtectedRoute><PRListPage /></ProtectedRoute>} />
        <Route path="/pr/create" element={<ProtectedRoute roles={['faculty', 'hod']}><NewPRPage /></ProtectedRoute>} />
        <Route path="/pr/:id" element={<ProtectedRoute><PRDetailPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

        <Route path="/budget" element={<ProtectedRoute roles={['faculty', 'hod', 'admin', 'dean_approver']}><BudgetPage /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute roles={['admin', 'apex_approver']}><AnalyticsPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>} />

        {/* Assets */}
        <Route path="/assets" element={<ProtectedRoute roles={['hod', 'verifier_sp', 'admin']}><AssetListPage /></ProtectedRoute>} />
        <Route path="/assets/:id" element={<ProtectedRoute roles={['hod', 'verifier_sp', 'admin']}><AssetDetailPage /></ProtectedRoute>} />

        {/* Inventory */}
        <Route path="/inventory/deliveries" element={<ProtectedRoute roles={['faculty', 'hod', 'verifier_sp', 'admin']}><DeliveriesPage /></ProtectedRoute>} />
        <Route path="/inventory/deliveries/:id" element={<ProtectedRoute roles={['faculty', 'hod', 'verifier_sp', 'admin']}><DeliveryDetailPage /></ProtectedRoute>} />
        <Route path="/inventory/discrepancies" element={<ProtectedRoute roles={['admin', 'verifier_sp', 'apex_approver']}><DiscrepanciesPage /></ProtectedRoute>} />

        {/* Redirects */}
        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
