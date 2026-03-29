function Header() {
  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
      {/* 左侧：页面标题（后续根据路由动态更新） */}
      <div className="text-lg font-semibold text-slate-800">
        库存自动化管理系统 V2
      </div>

      {/* 右侧：操作区 */}
      <div className="flex items-center gap-4">
        {/* 通知图标占位 */}
        <button
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
          aria-label="通知"
        >
          <div className="w-5 h-5 bg-slate-300 rounded-full"></div>
        </button>

        {/* 用户信息占位 */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-200 rounded-full"></div>
          <div className="hidden md:block">
            <div className="text-sm font-medium text-slate-800">管理员</div>
            <div className="text-xs text-slate-500">admin@example.com</div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;