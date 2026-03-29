import { Outlet } from 'react-router-dom';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';

function MainLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <div className="flex">
        <Sidebar />

        {/* 主内容区 */}
        <main className="flex-1 p-6">
          <div className="bg-white rounded border border-slate-200 min-h-[calc(100vh-8rem)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;