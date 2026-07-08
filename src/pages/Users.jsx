import { useState, useEffect, useCallback, useMemo } from 'react';
import { userService } from '../services/dataService';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';

// 角色值英文 → 中文显示映射
const ROLE_DISPLAY = {
  admin: '管理员',
  viewer: '只读用户',
};

function Users() {
  const { canWrite, adminOnlyTitle, isAdmin } = usePermission();
  const { currentUser } = useAuth();

  // Step 10-20B：活跃管理员计数（用于最后管理员停用防护）
  const activeAdminCount = useMemo(() => {
    return users.filter(u =>
      u.role === 'admin' &&
      u.status !== '停用' &&
      u.is_active !== false
    ).length;
  }, [users]);

  // Step 10-20B：判断是否允许停用/启用目标用户
  const canToggleUserStatus = useCallback((user) => {
    if (!canWrite) return { allowed: false, reason: adminOnlyTitle };
    // 不允许停用当前登录账号
    if (currentUser && user.id === currentUser.id) {
      return { allowed: false, reason: '不能停用当前登录账号' };
    }
    // 不允许停用最后一个活跃管理员
    const isActiveNow = user.status !== '停用' && user.is_active !== false;
    if (user.role === 'admin' && isActiveNow && activeAdminCount <= 1) {
      return { allowed: false, reason: '至少需要保留一个启用状态的管理员' };
    }
    return { allowed: true, reason: '' };
  }, [canWrite, adminOnlyTitle, currentUser, activeAdminCount]);

  // ==== 数据状态 ====
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ==== 全局消息 ====
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // ==== 搜索 ====
  const [searchTerm, setSearchTerm] = useState('');

  // ==== 分页 ====
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ==== 加载用户列表 ====
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await userService.getAllUsers();
      setUsers(data);
    } catch (err) {
      console.error('[Users] 加载用户数据失败:', err);
      setError(err.message || '加载用户数据失败');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ==== 清除消息（自动消失） ====
  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 4000);
  };
  const showError = (msg) => {
    setErrorMsg(msg);
    setSuccessMsg(null);
    setTimeout(() => setErrorMsg(null), 5000);
  };
  const clearMessages = () => {
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  // ==== 搜索过滤 ====
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const kw = searchTerm.trim().toLowerCase();
    return users.filter(u =>
      (u.username || '').toLowerCase().includes(kw) ||
      (u.displayName || u.display_name || '').toLowerCase().includes(kw) ||
      (u.email || '').toLowerCase().includes(kw)
    );
  }, [users, searchTerm]);

  // ==== 分页计算 ====
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedUsers = filteredUsers.slice(startIndex, endIndex);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));

  // ============================================================================
  // 新增用户弹窗
  // ============================================================================
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    username: '',
    displayName: '',
    email: '',
    role: 'viewer',
    password: '',
  });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState(null);

  const openAddModal = () => {
    clearMessages();
    setAddForm({ username: '', displayName: '', email: '', role: 'viewer', password: '' });
    setAddError(null);
    setShowAddModal(true);
  };
  const closeAddModal = () => {
    setShowAddModal(false);
    setAddError(null);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddError(null);

    // 前端基础校验
    if (!addForm.username.trim()) {
      setAddError('用户名不能为空');
      return;
    }
    if (!addForm.password || addForm.password.length < 6) {
      setAddError('密码至少 6 位');
      return;
    }

    setAddSubmitting(true);
    try {
      await userService.createUser({
        username: addForm.username.trim(),
        display_name: addForm.displayName.trim() || undefined,
        email: addForm.email.trim() || undefined,
        role: addForm.role,
        password: addForm.password,
      });
      showSuccess(`用户「${addForm.username.trim()}」创建成功`);
      closeAddModal();
      await loadUsers();
      setCurrentPage(1);
    } catch (err) {
      setAddError(err.message || '创建用户失败');
    } finally {
      setAddSubmitting(false);
    }
  };

  // ============================================================================
  // 编辑用户弹窗
  // ============================================================================
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    username: '',
    displayName: '',
    email: '',
    role: 'viewer',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  const openEditModal = (user) => {
    clearMessages();
    setEditingUser(user);
    setEditForm({
      username: user.username || '',
      displayName: user.displayName || user.display_name || '',
      email: user.email || '',
      role: user.role || 'viewer',
    });
    setEditError(null);
    setShowEditModal(true);
  };
  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
    setEditError(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError(null);

    if (!editForm.username.trim()) {
      setEditError('用户名不能为空');
      return;
    }

    setEditSubmitting(true);
    try {
      const payload = {};
      if (editForm.username.trim() !== editingUser.username) {
        payload.username = editForm.username.trim();
      }
      if (editForm.displayName.trim() !== (editingUser.displayName || editingUser.display_name || '')) {
        payload.display_name = editForm.displayName.trim();
      }
      if (editForm.email.trim() !== (editingUser.email || '')) {
        payload.email = editForm.email.trim();
      }
      if (editForm.role !== editingUser.role) {
        payload.role = editForm.role;
      }

      if (Object.keys(payload).length === 0) {
        setEditError('没有修改任何字段');
        return;
      }

      await userService.updateUser(editingUser.id, payload);
      showSuccess(`用户「${editForm.username.trim()}」更新成功`);
      closeEditModal();
      await loadUsers();
    } catch (err) {
      setEditError(err.message || '更新用户失败');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ============================================================================
  // 启用 / 停用用户
  // ============================================================================
  const handleToggleClick = (user) => {
    // Step 10-20B：前端自停用与最后管理员停用防护
    const { allowed } = canToggleUserStatus(user);
    if (!allowed) return;
    setStatusConfirmUser(user);
  };

  const handleToggleCancel = () => setStatusConfirmUser(null);

  const handleToggleConfirm = async () => {
    if (!statusConfirmUser) return;
    const user = statusConfirmUser;
    const action = user.status === '停用' || user.is_active === false ? '启用' : '停用';

    setStatusConfirmUser(null);
    clearMessages();
    try {
      const newActive = user.status === '停用' || user.is_active === false;
      await userService.updateUserStatus(user.id, newActive);
      showSuccess(`用户「${user.username}」已${action}`);
      await loadUsers();
    } catch (err) {
      showError(err.message || `${action}用户失败`);
    }
  };

  // ============================================================================
  // 重置密码弹窗
  // ============================================================================
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdTarget, setPwdTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdError, setPwdError] = useState(null);
  // 停用/启用确认弹窗
  const [statusConfirmUser, setStatusConfirmUser] = useState(null);

  const openPwdModal = (user) => {
    clearMessages();
    setPwdTarget(user);
    setNewPassword('');
    setPwdError(null);
    setShowPwdModal(true);
  };
  const closePwdModal = () => {
    setShowPwdModal(false);
    setPwdTarget(null);
    setPwdError(null);
  };

  const handlePwdSubmit = async (e) => {
    e.preventDefault();
    setPwdError(null);

    if (!newPassword || newPassword.length < 6) {
      setPwdError('新密码至少 6 位');
      return;
    }

    setPwdSubmitting(true);
    try {
      await userService.resetUserPassword(pwdTarget.id, newPassword);
      showSuccess(`用户「${pwdTarget.username}」密码已重置`);
      closePwdModal();
    } catch (err) {
      setPwdError(err.message || '重置密码失败');
    } finally {
      setPwdSubmitting(false);
    }
  };

  // ============================================================================
  // 角色标签组件（支持英文值 + 中文显示）
  // ============================================================================
  function RoleBadge({ role }) {
    // 先查英文映射，再查中文直接匹配，最后兜底
    const display = ROLE_DISPLAY[role] || role || '只读用户';
    const config = {
      admin: { bg: 'bg-slate-100', textColor: 'text-slate-800' },
      viewer: { bg: 'bg-slate-50', textColor: 'text-slate-600' },
      管理员: { bg: 'bg-slate-100', textColor: 'text-slate-800' },
      只读用户: { bg: 'bg-slate-50', textColor: 'text-slate-600' },
    };
    const { bg, textColor } = config[role] || config['只读用户'];

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
        {display}
      </span>
    );
  }

  // 状态标签组件
  function StatusBadge({ status }) {
    const config = {
      活跃: { text: '活跃', bg: 'bg-slate-50', textColor: 'text-slate-600' },
      停用: { text: '停用', bg: 'bg-slate-100', textColor: 'text-slate-600' },
    };
    const { text, bg, textColor } = config[status] || config.停用;

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
        {text}
      </span>
    );
  }

  // ============================================================================
  // 通用：不可写按钮包装
  // ============================================================================
  const disabledBtnClass = !canWrite ? 'opacity-50 cursor-not-allowed' : '';

  // ============================================================================
  // 渲染
  // ============================================================================
  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">用户管理</h1>
        <p className="text-slate-600 mt-1">
          管理系统用户账户及角色权限，管理员可新增、编辑用户并重置密码。
        </p>
      </div>

      {/* 全局消息 */}
      {successMsg && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
          ✕ {errorMsg}
        </div>
      )}

      {/* 操作栏 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <button
            onClick={canWrite ? openAddModal : undefined}
            disabled={!canWrite}
            title={!canWrite ? adminOnlyTitle : ''}
            className={`px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium ${disabledBtnClass}`}
          >
            + 新增用户
          </button>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="搜索用户名或邮箱..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setCurrentPage(1); }}
              className="px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent w-full sm:w-64"
            />
            <button
              onClick={() => setCurrentPage(1)}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium w-full sm:w-auto"
            >
              搜索
            </button>
          </div>
        </div>
      </div>

      {/* 用户表格 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"></div>
            <div className="mt-3 text-sm text-slate-600">正在加载用户数据...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rose-50 flex items-center justify-center">
              <span className="text-2xl text-rose-600">!</span>
            </div>
            <div className="text-sm font-medium text-rose-800 mb-2">加载用户数据失败</div>
            <div className="text-sm text-slate-600 mb-4">{error}</div>
            <button
              onClick={() => { setError(null); loadUsers(); }}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium"
            >
              重试
            </button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
              <span className="text-2xl text-slate-500">👤</span>
            </div>
            <div className="text-sm font-medium text-slate-800 mb-2">暂无用户数据</div>
            <div className="text-sm text-slate-600">系统当前没有用户记录</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-slate-200 table-fixed">
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">用户名</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">显示名称</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">邮箱</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">角色</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">状态</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">最后登录</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {displayedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 md:px-4 md:py-4">
                        <div className="text-sm font-medium text-slate-800 truncate" title={user.username}>{user.username}</div>
                      </td>
                      <td className="px-3 py-3 md:px-4 md:py-4">
                        <div className="text-sm text-slate-700 truncate" title={user.displayName || user.display_name || ''}>{user.displayName || user.display_name || '-'}</div>
                      </td>
                      <td className="px-3 py-3 md:px-4 md:py-4">
                        <div className="text-sm text-slate-700 truncate" title={user.email || ''}>{user.email || '-'}</div>
                      </td>
                      <td className="px-3 py-3 md:px-4 md:py-4 whitespace-nowrap">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-3 py-3 md:px-4 md:py-4 whitespace-nowrap">
                        <StatusBadge status={user.status} />
                      </td>
                      <td className="px-3 py-3 md:px-4 md:py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-700">{(() => {
                          const raw = user.lastLogin;
                          if (!raw || raw === '-' || raw === 'null' || raw === 'undefined') return '从未登录';
                          try {
                            const t = new Date(raw);
                            if (isNaN(t.getTime())) return '从未登录';
                            const pad = (n) => String(n).padStart(2, '0');
                            return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
                          } catch { return '从未登录'; }
                        })()}</div>
                      </td>
                      <td className="px-3 py-3 md:px-4 md:py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-nowrap">
                          {/* 编辑 */}
                          <button
                            onClick={canWrite ? () => openEditModal(user) : undefined}
                            disabled={!canWrite}
                            title={!canWrite ? adminOnlyTitle : ''}
                            className={`px-2 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 ${disabledBtnClass}`}
                          >
                            编辑
                          </button>
                          {/* 启用 / 停用 — Step 10-20B：前端自停用与最后管理员停用防护 */}
                          {(() => {
                            const t = canToggleUserStatus(user);
                            return (
                              <button
                                onClick={t.allowed ? () => handleToggleClick(user) : undefined}
                                disabled={!t.allowed}
                                title={!t.allowed ? t.reason : ''}
                                className={`px-2 py-1.5 text-sm bg-slate-50 text-rose-600 border border-rose-200 rounded hover:bg-rose-50 transition-colors whitespace-nowrap shrink-0 ${disabledBtnClass}`}
                              >
                                {user.status === '停用' || user.is_active === false ? '启用' : '停用'}
                              </button>
                            );
                          })()}
                          {/* 重置密码 */}
                          <button
                            onClick={canWrite ? () => openPwdModal(user) : undefined}
                            disabled={!canWrite}
                            title={!canWrite ? adminOnlyTitle : ''}
                            className={`px-2 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 ${disabledBtnClass}`}
                          >
                            重置密码
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页控制 */}
            <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-4 md:gap-0">
              <div className="w-full md:w-auto text-sm text-slate-600 text-center md:text-left">
                显示第 {startIndex + 1} - {Math.min(endIndex, filteredUsers.length)} 条，共 {filteredUsers.length} 条记录
              </div>
              <div className="w-full md:w-auto flex justify-center flex-wrap items-center gap-2 whitespace-nowrap">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-1.5 rounded border text-sm ${
                    currentPage === 1
                      ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  上一页
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1.5 rounded border text-sm ${
                          currentPage === pageNum
                            ? 'bg-slate-700 text-white'
                            : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  {totalPages > 5 && (
                    <>
                      <span className="text-slate-400">...</span>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        className={`px-3 py-1.5 rounded border text-sm ${
                          currentPage === totalPages
                            ? 'bg-slate-700 text-white'
                            : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {totalPages}
                      </button>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1.5 rounded border text-sm ${
                    currentPage === totalPages
                      ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：管理员可新增、编辑、启用/停用用户账户，以及重置用户密码。角色分为"管理员"（admin，可读写）和"只读用户"（viewer，只读）。
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 新增用户弹窗 */}
      {/* ==================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeAddModal}>
          <div className="absolute inset-0 bg-black/40"></div>
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">新增用户</h2>
            </div>
            <form onSubmit={handleAddSubmit} className="px-6 py-4 space-y-4">
              {addError && (
                <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded text-sm text-rose-800">
                  {addError}
                </div>
              )}
              {/* 用户名 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">用户名 *</label>
                <input
                  type="text"
                  value={addForm.username}
                  onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                  placeholder="英文或拼音"
                  autoFocus
                  required
                />
              </div>
              {/* 显示名称 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">显示名称</label>
                <input
                  type="text"
                  value={addForm.displayName}
                  onChange={(e) => setAddForm({ ...addForm, displayName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                  placeholder={'可选，如 “张三”'}
                />
              </div>
              {/* 邮箱 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                  placeholder="可选"
                />
              </div>
              {/* 角色 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm bg-white"
                >
                  <option value="viewer">只读用户 (viewer)</option>
                  <option value="admin">管理员 (admin)</option>
                </select>
              </div>
              {/* 密码 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">密码 *</label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                  placeholder="至少 6 位"
                  required
                  minLength={6}
                />
              </div>
              {/* 按钮 */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={addSubmitting}
                  className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="px-4 py-2 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {addSubmitting ? '创建中...' : '创建用户'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 编辑用户弹窗 */}
      {/* ==================================================================== */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeEditModal}>
          <div className="absolute inset-0 bg-black/40"></div>
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">
                编辑用户：{editingUser.username}
              </h2>
            </div>
            <form onSubmit={handleEditSubmit} className="px-6 py-4 space-y-4">
              {editError && (
                <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded text-sm text-rose-800">
                  {editError}
                </div>
              )}
              {/* 用户名 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                  placeholder="英文或拼音"
                  required
                />
              </div>
              {/* 显示名称 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">显示名称</label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                  placeholder="可选"
                />
              </div>
              {/* 邮箱 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                  placeholder="可选"
                />
              </div>
              {/* 角色 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm bg-white"
                >
                  <option value="viewer">只读用户 (viewer)</option>
                  <option value="admin">管理员 (admin)</option>
                </select>
              </div>
              {/* 按钮 */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={editSubmitting}
                  className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {editSubmitting ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 重置密码弹窗 */}
      {/* ==================================================================== */}
      {showPwdModal && pwdTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closePwdModal}>
          <div className="absolute inset-0 bg-black/40"></div>
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">
                重置密码：{pwdTarget.username}
              </h2>
            </div>
            <form onSubmit={handlePwdSubmit} className="px-6 py-4 space-y-4">
              {pwdError && (
                <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded text-sm text-rose-800">
                  {pwdError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">新密码 *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                  placeholder="至少 6 位"
                  autoFocus
                  required
                  minLength={6}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closePwdModal}
                  disabled={pwdSubmitting}
                  className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pwdSubmitting}
                  className="px-4 py-2 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {pwdSubmitting ? '重置中...' : '确认重置'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 停用/启用确认弹窗 */}
      {/* ==================================================================== */}
      {statusConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleToggleCancel}>
          <div className="absolute inset-0 bg-black/40"></div>
          <div
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">
                {statusConfirmUser.status === '停用' || statusConfirmUser.is_active === false ? '确认启用用户' : '确认停用用户'}
              </h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="text-sm text-slate-700">
                {statusConfirmUser.status === '停用' || statusConfirmUser.is_active === false
                  ? '启用后，该用户可以重新登录系统。请确认是否继续。'
                  : '停用后，该用户将无法登录系统。请确认是否继续。'}
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">用户名</span>
                  <span className="font-medium text-slate-800">{statusConfirmUser.username}</span>
                </div>
                {(statusConfirmUser.displayName || statusConfirmUser.display_name) && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">显示名称</span>
                    <span className="font-medium text-slate-800">{statusConfirmUser.displayName || statusConfirmUser.display_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">角色</span>
                  <span className="font-medium text-slate-800">{statusConfirmUser.role === 'admin' ? '管理员' : '只读用户'}</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleToggleCancel}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleToggleConfirm}
                className={`px-4 py-2 text-sm rounded-md transition-colors font-medium ${
                  statusConfirmUser.status === '停用' || statusConfirmUser.is_active === false
                    ? 'bg-slate-700 text-white hover:bg-slate-800'
                    : 'bg-slate-50 text-rose-600 border border-rose-200 hover:bg-rose-50'
                }`}
              >
                {statusConfirmUser.status === '停用' || statusConfirmUser.is_active === false ? '确认启用' : '确认停用'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
