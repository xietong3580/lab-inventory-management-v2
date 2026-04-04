import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import BackToTopButton from '../components/common/BackToTopButton';

function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header toggleSidebar={toggleSidebar} />

      <div className="flex">
        {/* 侧边栏遮罩层 - 仅在小屏下显示 */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
            onClick={closeSidebar}
          />
        )}

        {/* 侧边栏 */}
        <div
          className={`
            fixed md:relative inset-y-0 left-0 z-30
            transform transition-transform duration-300 ease-in-out
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          <Sidebar closeSidebar={closeSidebar} />
        </div>

        {/* 主内容区 */}
        <main className="flex-1 p-4 md:p-6 md:ml-0 transition-all duration-300 overflow-x-hidden">
          <div className="bg-white rounded border border-slate-200 min-h-0 md:min-h-[calc(100vh-8rem)]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* 全局返回顶部按钮 */}
      <BackToTopButton />
    </div>
  );
}

export default MainLayout;