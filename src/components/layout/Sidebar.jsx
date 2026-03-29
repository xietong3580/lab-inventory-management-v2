import { useLocation, useNavigate } from 'react-router-dom';

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  // 导航菜单数据
  const menuItems = [
    { id: 'dashboard', label: '仪表盘', path: '/dashboard' },
    { id: 'products', label: '产品管理', path: '/products' },
    { id: 'transactions', label: '出入库记录', path: '/transactions' },
    { id: 'alerts', label: '低库存预警', path: '/alerts' },
    { id: 'users', label: '用户管理', path: '/users' },
    { id: 'settings', label: '系统设置', path: '/settings' },
  ];

  // 根据当前路径确定激活的菜单项
  const getActiveId = () => {
    const currentPath = location.pathname;
    const activeItem = menuItems.find(item => currentPath.startsWith(item.path));
    return activeItem ? activeItem.id : 'dashboard';
  };

  const activeId = getActiveId();

  const handleMenuClick = (path) => {
    navigate(path);
  };

  return (
    <aside className="w-64 border-r border-slate-200 bg-white min-h-[calc(100vh-4rem)] p-4">
      {/* 系统标识 */}
      <div className="mb-8 px-3 py-2">
        <div className="text-sm font-medium text-slate-500">库存管理系统</div>
        <div className="text-xs text-slate-400 mt-1">V2.0</div>
      </div>

      {/* 导航菜单 */}
      <nav className="space-y-1">
        {menuItems.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleMenuClick(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors ${
                isActive
                  ? 'bg-slate-100 text-slate-800 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
              aria-label={`导航到${item.label}`}
            >
              {/* 图标占位 */}
              <div
                className={`w-5 h-5 rounded ${
                  isActive ? 'bg-slate-600' : 'bg-slate-400'
                }`}
              ></div>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 底部功能区占位 */}
      <div className="mt-8 pt-6 border-t border-slate-100">
        <div className="text-xs text-slate-500 mb-2">系统</div>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800">
          <div className="w-5 h-5 bg-slate-400 rounded"></div>
          <span>系统信息</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;