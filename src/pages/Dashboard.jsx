import { useState, useEffect } from 'react';
import { dashboardStats, recentTransactions } from '../constants/mockData';
import { getProductsWithCalculatedStatus } from '../services/productService';

// 统计卡片组件
function StatCard({ title, value, change, changeType, description, iconColor }) {
  const changeTextColor = changeType === 'increase'
    ? 'text-emerald-600'
    : changeType === 'decrease'
    ? 'text-rose-600'
    : 'text-slate-600';

  const changePrefix = changeType === 'increase' ? '+' : changeType === 'decrease' ? '-' : '';

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-500 mb-1">{title}</div>
          <div className="text-2xl font-semibold text-slate-800">{value}</div>
        </div>
        <div className={`w-10 h-10 rounded-full ${iconColor} flex items-center justify-center`}>
          <div className="w-5 h-5 bg-white/80 rounded"></div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${changeTextColor}`}>
            {changePrefix}{change}
          </span>
          <span className="text-sm text-slate-500">{description}</span>
        </div>
      </div>
    </div>
  );
}

// 状态标签组件
function StatusBadge({ status }) {
  const config = {
    completed: { text: '已完成', bg: 'bg-emerald-50', textColor: 'text-emerald-700' },
    pending: { text: '处理中', bg: 'bg-amber-50', textColor: 'text-amber-700' },
  };
  const { text, bg, textColor } = config[status] || config.pending;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

// 紧急程度标签
function UrgencyBadge({ urgency }) {
  const config = {
    high: { text: '紧急', bg: 'bg-rose-50', textColor: 'text-rose-700' },
    medium: { text: '中等', bg: 'bg-amber-50', textColor: 'text-amber-700' },
    low: { text: '较低', bg: 'bg-slate-100', textColor: 'text-slate-700' },
  };
  const { text, bg, textColor } = config[urgency] || config.low;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

function Dashboard() {
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [lowStockCount, setLowStockCount] = useState(0);

  // 计算紧急程度（根据库存百分比）
  const calculateUrgency = (product) => {
    const ratio = product.currentStock / product.minStock;
    if (ratio <= 0.2) return 'high';
    if (ratio <= 0.5) return 'medium';
    return 'low';
  };

  // 初始化产品和预警数据
  useEffect(() => {
    const products = getProductsWithCalculatedStatus();

    // 筛选低库存产品并转换为预警数据结构
    const lowStockProducts = products
      .filter(product => product.status === '低库存')
      .map(product => ({
        id: product.id,
        productName: product.name,
        currentStock: product.currentStock,
        minStock: product.minStock,
        category: product.category,
        urgency: calculateUrgency(product)
      }));

    setLowStockAlerts(lowStockProducts);
    setLowStockCount(lowStockProducts.length);
  }, []);

  // 动态统计卡片数据
  const dynamicDashboardStats = dashboardStats.map(stat => {
    if (stat.id === 'low-stock-alerts') {
      return {
        ...stat,
        value: lowStockCount.toString(),
        change: '+0', // 简化处理，后续可计算变化
        description: '当前低库存产品数量'
      };
    }
    return stat;
  });

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">仪表盘</h1>
        <p className="text-slate-600 mt-1">
          欢迎回来，这里是库存管理系统的核心概览。
        </p>
      </div>

      {/* 统计卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {dynamicDashboardStats.map((stat) => (
          <StatCard key={stat.id} {...stat} />
        ))}
      </div>

      {/* 两列布局：最近记录与预警概览 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 最近出入库记录 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">最近出入库记录</h2>
            <p className="text-sm text-slate-500 mt-1">最近 5 条操作记录</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentTransactions.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <div className="font-medium text-slate-800">{txn.productName}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      {txn.date} · {txn.operator}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${txn.type === '入库' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {txn.type} {txn.quantity} 件
                    </div>
                    <div className="mt-2">
                      <StatusBadge status={txn.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-slate-100">
              <button className="w-full py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">
                查看全部出入库记录 →
              </button>
            </div>
          </div>
        </div>

        {/* 低库存预警概览 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">低库存预警</h2>
            <p className="text-sm text-slate-500 mt-1">当前 {lowStockCount} 个产品库存不足</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {lowStockAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <div className="font-medium text-slate-800">{alert.productName}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      {alert.category} · 当前库存 {alert.currentStock} / 最低 {alert.minStock}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-rose-600">
                      {Math.round((alert.currentStock / alert.minStock) * 100)}%
                    </div>
                    <div className="mt-2">
                      <UrgencyBadge urgency={alert.urgency} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-slate-100">
              <button className="w-full py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">
                查看全部{lowStockCount > 0 ? ` ${lowStockCount} 条` : ''}预警信息 →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：本系统为独立新版库存管理系统，不影响现有旧版系统。所有数据均为演示用途。
        </div>
      </div>
    </div>
  );
}

export default Dashboard;