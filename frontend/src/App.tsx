import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import { BudgetFormPage } from './pages/admin/BudgetFormPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { DeliveryDetailPage } from './pages/DeliveryDetail';
import { AssetDetailPage } from './pages/AssetDetail';
import { AnalyticsPage } from './pages/Placeholders';
import { ProfilePage } from './pages/ProfilePage';
import { FormsDashboardPage } from './pages/FormsDashboard';
import { AdministrativeApprovalsListPage } from './pages/AdministrativeApprovalsList';
import { AdministrativeApprovalCreatePage } from './pages/AdministrativeApprovalCreate';
import { AdministrativeApprovalDetailPage } from './pages/AdministrativeApprovalDetail';


import { ErrorBoundary } from './components/ErrorBoundary';

// Forces a full remount whenever the :id URL param changes so local state
// (selected tabs, form fields, etc.) never bleeds between records.
const WithIdKey: React.FC<{ component: React.ComponentType }> = ({ component: Component }) => {
  const { id } = useParams<{ id: string }>();
  return <Component key={id} />;
};

const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[]; prRestricted?: boolean }> = ({ children, roles, prRestricted }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen formal-bg flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#1a3a6b] border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && user.role && !roles.includes(user.role.group_key)) return <Navigate to="/dashboard" replace />;
  if (prRestricted && user.designation === 'Dean P&D (Budget)') return <Navigate to="/dashboard" replace />;
  return <DashboardLayout><ErrorBoundary>{children}</ErrorBoundary></DashboardLayout>;
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
        <Route path="/login" element={<ErrorBoundary>{user ? <Navigate to="/dashboard" replace /> : <LoginPage />}</ErrorBoundary>} />
        <Route path="/register" element={<ErrorBoundary>{user ? <Navigate to="/dashboard" replace /> : <RegisterPage />}</ErrorBoundary>} />
        <Route path="/public/asset/:tag" element={<ErrorBoundary><AssetPublicPage /></ErrorBoundary>} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/pr" element={<ProtectedRoute prRestricted><PRListPage /></ProtectedRoute>} />
        <Route path="/forms" element={<ProtectedRoute><FormsDashboardPage /></ProtectedRoute>} />
        <Route path="/pr/create" element={<ProtectedRoute roles={['faculty']}><NewPRPage /></ProtectedRoute>} />
        <Route path="/pr/:id" element={<ProtectedRoute prRestricted><WithIdKey component={PRDetailPage} /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/administrative-approvals" element={<ProtectedRoute><AdministrativeApprovalsListPage /></ProtectedRoute>} />
        <Route path="/administrative-approvals/create" element={<ProtectedRoute roles={['faculty']}><AdministrativeApprovalCreatePage /></ProtectedRoute>} />
        <Route path="/administrative-approvals/:id" element={<ProtectedRoute><WithIdKey component={AdministrativeApprovalDetailPage} /></ProtectedRoute>} />


        <Route path="/budget" element={<ProtectedRoute roles={['faculty', 'hod', 'admin', 'dean_approver', 'apex_approver']}><BudgetPage /></ProtectedRoute>} />
        <Route path="/budget/create" element={<ProtectedRoute roles={['admin', 'dean_approver', 'hod']}><BudgetFormPage /></ProtectedRoute>} />
        <Route path="/budget/edit/:id" element={<ProtectedRoute roles={['admin', 'dean_approver', 'hod']}><BudgetFormPage /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute roles={['admin', 'apex_approver']}><AnalyticsPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>} />

        {/* Assets */}
        <Route path="/assets" element={<ProtectedRoute><AssetListPage /></ProtectedRoute>} />
        <Route path="/assets/:id" element={<ProtectedRoute><AssetDetailPage /></ProtectedRoute>} />

        {/* Inventory */}
        <Route path="/inventory/deliveries" element={<ProtectedRoute roles={['faculty', 'hod', 'verifier_sp', 'admin']}><DeliveriesPage /></ProtectedRoute>} />
        <Route path="/inventory/deliveries/:id" element={<ProtectedRoute roles={['faculty', 'hod', 'verifier_sp', 'verifier_da', 'admin']}><WithIdKey component={DeliveryDetailPage} /></ProtectedRoute>} />
        <Route path="/inventory/discrepancies" element={<ProtectedRoute roles={['admin', 'verifier_sp', 'apex_approver']}><DiscrepanciesPage /></ProtectedRoute>} />

        {/* Redirects */}
        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
