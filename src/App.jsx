import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './contexts/AuthContext';
import Login from './pages/Login';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Transactions from './pages/Transactions';
import Alerts from './pages/Alerts';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';
import ProductImportPreview from './pages/ProductImportPreview';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 登录页单独路由 */}
          <Route path="/login" element={<Login />} />

          {/* 主布局下的所有后台页面（需登录） */}
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="users" element={<Users />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="settings" element={<Settings />} />
            <Route path="import-preview" element={<ProductImportPreview />} />
          </Route>

          {/* 默认重定向到登录页 */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;