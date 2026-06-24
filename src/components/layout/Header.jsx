import { useAuth, ROLE_LABELS } from '../../contexts/AuthContext';

function Header({ toggleSidebar }) {
  const { currentUser, logout } = useAuth();

  const displayName = currentUser?.displayName || currentUser?.username || '用户';
  const roleLabel = ROLE_LABELS[currentUser?.role] || currentUser?.role || '';
  const firstChar = displayName.charAt(0);

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
      {/* 左侧：汉堡菜单按钮 + 页面标题 */}
      <div className="flex items-center gap-4">
        {/* 汉堡菜单按钮 - 仅小屏显示 */}
        <button
          onClick={toggleSidebar}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded md:hidden"
          aria-label="打开导航菜单"
        >
          <div className="w-5 h-5 flex flex-col justify-center gap-1">
            <div className="w-full h-0.5 bg-slate-500"></div>
            <div className="w-full h-0.5 bg-slate-500"></div>
            <div className="w-full h-0.5 bg-slate-500"></div>
          </div>
        </button>

        <div className="text-lg font-semibold text-slate-800">
          库存自动化管理系统 V2
        </div>
      </div>

      {/* 右侧：操作区 */}
      <div className="flex items-center gap-3">
        {/* 用户信息 */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-700 text-white rounded-full flex items-center justify-center text-sm font-medium">
            {firstChar}
          </div>
          <div className="hidden md:block">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800">{displayName}</span>
              {roleLabel && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  currentUser?.role === 'admin'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {roleLabel}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {currentUser?.username || ''}
            </div>
          </div>
        </div>

        {/* 退出登录按钮 */}
        <button
          onClick={handleLogout}
          className="text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors"
          title="退出登录"
        >
          退出
        </button>
      </div>
    </header>
  );
}

export default Header;