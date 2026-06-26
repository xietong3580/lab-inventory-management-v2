import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

/**
 * 角色中英文映射（后端存储英文，前端显示中文）
 */
export const ROLE_LABELS = {
  admin: '管理员',
  viewer: '只读用户',
};

/**
 * 认证上下文 Provider
 */
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true); // 初始为 true，用于页面刷新恢复登录态

  const navigate = useNavigate();
  const location = useLocation();

  // 页面刷新后恢复登录态
  useEffect(() => {
    const restoreSession = async () => {
      const token = authService.getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const user = await authService.getMe();
        setCurrentUser(user);
      } catch {
        // token 无效，getMe 内部已清除 localStorage
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  // 登录
  const login = useCallback(async (username, password) => {
    const data = await authService.login(username, password);
    setCurrentUser(data.user);
    return data;
  }, []);

  // 登出
  const logout = useCallback(() => {
    authService.logout();
    setCurrentUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const isAuthenticated = !!currentUser;
  const isAdmin = currentUser?.role === 'admin';

  const value = {
    currentUser,
    isAuthenticated,
    isAdmin,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 使用认证上下文的 Hook
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }
  return context;
}

/**
 * 受保护路由守卫组件
 * 未登录时跳转到 /login
 * 如果仍在加载鉴权状态（页面刷新恢复中），显示 loading
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // 正在恢复登录态，显示 loading
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">加载中…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // 未登录，跳转 /login，并记住来源路径
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}

export default AuthContext;
