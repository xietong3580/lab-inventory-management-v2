import { useMemo } from 'react';
import { dashboardStats } from '../constants/mockData';
import { getProductsWithCalculatedStatus, getAllProducts, getTransactions, getAuditLogs } from '../services/productService';
import {
  formatAuditTime,
  generateAuditSummary,
  getDisplayOperator,
  getActionConfig
} from '../utils/auditLogHelpers';

// 统计卡片组件
function StatCard({ title, value, description, iconColor }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm text-slate-500 mb-1">{title}</div>
          <div className="text-2xl font-semibold text-slate-800">{value}</div>
          {description && (
            <div className="mt-2 text-xs text-slate-500">{description}</div>
          )}
        </div>
        <div className={`w-10 h-10 rounded-full ${iconColor} flex items-center justify-center ml-4`}>
          <div className="w-5 h-5 bg-white/80 rounded"></div>
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
    reversed: { text: '已撤销', bg: 'bg-slate-100', textColor: 'text-slate-500' },
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

// 交易趋势条形图组件
function TransactionTrendChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="text-slate-400 mb-2">暂无交易趋势数据</div>
        <div className="text-sm text-slate-500">近7日无出入库记录</div>
      </div>
    );
  }

  // 计算最大数量用于比例
  const maxCount = Math.max(...data.map(item => Math.max(item.inCount, item.outCount, item.totalCount)));
  const scale = maxCount > 0 ? 100 / maxCount : 0;

  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.date} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">{item.displayDate}</div>
            <div className="text-sm text-slate-500">
              入库: <span className="font-medium text-emerald-600">{item.inCount}</span> ·
              出库: <span className="font-medium text-rose-600">{item.outCount}</span>
            </div>
          </div>
          <div className="flex h-6 rounded overflow-hidden bg-slate-100">
            {/* 入库条形 */}
            {item.inCount > 0 && (
              <div
                className="bg-emerald-500"
                style={{ width: `${item.inCount * scale}%` }}
                title={`入库: ${item.inCount}`}
              />
            )}
            {/* 出库条形 */}
            {item.outCount > 0 && (
              <div
                className="bg-rose-500 ml-0.5"
                style={{ width: `${item.outCount * scale}%` }}
                title={`出库: ${item.outCount}`}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// 低库存概览增强组件
function LowStockOverview({ lowStockCount, lowStockPercentage, top3Products, totalProducts }) {
  return (
    <div className="space-y-4">
      {/* 概览卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded p-4">
          <div className="text-sm text-slate-500 mb-1">低库存数量</div>
          <div className="text-2xl font-semibold text-slate-800">{lowStockCount}</div>
          <div className="text-sm text-slate-500 mt-1">个产品</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-4">
          <div className="text-sm text-slate-500 mb-1">低库存占比</div>
          <div className="text-2xl font-semibold text-slate-800">{lowStockPercentage}%</div>
          <div className="text-sm text-slate-500 mt-1">占产品总数</div>
        </div>
      </div>

      {/* 最需关注的前3个产品 */}
      <div>
        <div className="text-sm font-medium text-slate-700 mb-3">最需关注产品</div>
        <div className="space-y-3">
          {top3Products.length > 0 ? (
            top3Products.map((product) => (
              <div key={product.id} className="flex items-center justify-between p-3 border border-slate-200 rounded">
                <div>
                  <div className="font-medium text-slate-800">{product.productName}</div>
                  <div className="text-sm text-slate-500 mt-1">
                    当前库存 {product.currentStock} / 最低 {product.minStock}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-rose-600">
                    {Math.round((product.currentStock / product.minStock) * 100)}%
                  </div>
                  <div className="mt-1">
                    <UrgencyBadge urgency={product.urgency} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-4 text-center text-slate-400">
              当前无低库存产品
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 审计日志条形统计组件
function AuditLogStatsChart({ stats, maxCount }) {
  if (!stats || stats.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="text-slate-400 mb-2">暂无审计日志统计</div>
        <div className="text-sm text-slate-500">系统尚未记录操作日志</div>
      </div>
    );
  }

  const scale = maxCount > 0 ? 100 / maxCount : 0;

  return (
    <div className="space-y-4">
      {stats.map((item) => (
        <div key={item.type} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">{item.label}</div>
            <div className="text-sm font-medium text-slate-800">{item.count}</div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full ${item.color.split(' ')[0]}`}
              style={{ width: `${item.count * scale}%` }}
              title={`${item.label}: ${item.count}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  // 计算紧急程度（根据库存百分比）
  const calculateUrgency = (product) => {
    const ratio = product.currentStock / product.minStock;
    if (ratio <= 0.2) return 'high';
    if (ratio <= 0.5) return 'medium';
    return 'low';
  };


  // 实时计算统计数据（基于最新产品数据）
  const dashboardData = useMemo(() => {
    const products = getProductsWithCalculatedStatus();
    const allProducts = getAllProducts();
    const allTransactions = getTransactions();
    const allAuditLogs = getAuditLogs();

    // 计算产品总数
    const totalProducts = allProducts.length;

    // 计算库存总量
    const totalInventory = allProducts.reduce((sum, product) => {
      return sum + (Number(product.currentStock) || 0);
    }, 0);

    // 筛选低库存产品
    const lowStockProducts = products.filter(product => product.status === '低库存');
    const lowStockCount = lowStockProducts.length;
    const normalStockCount = totalProducts - lowStockCount;

    // 转换为预警数据结构
    const lowStockAlerts = lowStockProducts.map(product => ({
      id: product.id,
      productName: product.name,
      currentStock: product.currentStock,
      minStock: product.minStock,
      category: product.category,
      urgency: calculateUrgency(product)
    }));

    // 获取最近7天的日期范围
    const getRecentDates = (days = 7) => {
      const dates = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]); // YYYY-MM-DD
      }
      return dates;
    };
    const recent7Days = getRecentDates(7);

    // 计算近7日交易记录数量
    const recent7DaysTransactions = allTransactions.filter(txn =>
      txn.date && recent7Days.includes(txn.date)
    );
    const recent7DaysTransactionsCount = recent7DaysTransactions.length;

    // 计算近7日审计日志数量
    const recent7DaysAuditLogs = allAuditLogs.filter(log => {
      if (!log.timestamp) return false;
      const logDate = new Date(log.timestamp).toISOString().split('T')[0];
      return recent7Days.includes(logDate);
    });
    const recent7DaysAuditLogsCount = recent7DaysAuditLogs.length;

    // 计算交易趋势数据（近7天入库/出库数量）
    const transactionTrendData = recent7Days.map(date => {
      const dayTransactions = allTransactions.filter(txn => txn.date === date);
      const inCount = dayTransactions.filter(txn => txn.type === '入库').reduce((sum, txn) => sum + (Number(txn.quantity) || 0), 0);
      const outCount = dayTransactions.filter(txn => txn.type === '出库').reduce((sum, txn) => sum + (Number(txn.quantity) || 0), 0);

      // 格式化日期显示（MM-DD）
      const [year, month, day] = date.split('-');
      return {
        date,
        displayDate: `${month}-${day}`,
        inCount,
        outCount,
        totalCount: inCount + outCount
      };
    });

    // 低库存概览数据
    const lowStockPercentage = totalProducts > 0 ? Math.round((lowStockCount / totalProducts) * 100) : 0;
    // 按紧急程度排序获取前3个最需关注产品
    const top3LowStockProducts = [...lowStockAlerts]
      .sort((a, b) => {
        // 按紧急程度排序：高 > 中 > 低
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      })
      .slice(0, 3);

    // 审计日志类型统计
    const auditLogStats = {
      'PRODUCT_ADD': { label: '新增产品', count: 0, color: 'bg-emerald-50 text-emerald-700' },
      'PRODUCT_UPDATE': { label: '编辑产品', count: 0, color: 'bg-blue-50 text-blue-700' },
      'PRODUCT_DELETE': { label: '删除产品', count: 0, color: 'bg-rose-50 text-rose-700' },
      'TRANSACTION_ADD': { label: '出入库', count: 0, color: 'bg-amber-50 text-amber-700' },
      'TRANSACTION_REVERSE': { label: '撤销交易', count: 0, color: 'bg-slate-50 text-slate-700' },
      'SYSTEM_RESET': { label: '系统重置', count: 0, color: 'bg-violet-50 text-violet-700' }
    };

    // 统计所有审计日志类型
    allAuditLogs.forEach(log => {
      if (auditLogStats[log.actionType]) {
        auditLogStats[log.actionType].count++;
      }
    });

    // 转换为数组并计算最大值用于图表比例
    const auditLogStatsArray = Object.entries(auditLogStats).map(([key, value]) => ({
      type: key,
      ...value
    }));
    const maxAuditLogCount = auditLogStatsArray.length > 0 ?
      Math.max(...auditLogStatsArray.map(item => item.count)) : 1;

    // 获取最近5条交易记录（按日期倒序）
    const recentTransactions = [...allTransactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    // 获取最近5条审计日志（已按时间倒序排列）
    const recentAuditLogs = allAuditLogs.slice(0, 5);

    return {
      totalProducts,
      totalInventory,
      lowStockCount,
      normalStockCount,
      lowStockAlerts,
      recent7DaysTransactionsCount,
      recent7DaysAuditLogsCount,
      transactionTrendData,
      lowStockPercentage,
      top3LowStockProducts,
      auditLogStatsArray,
      maxAuditLogCount,
      recentTransactions,
      recentAuditLogs
    };
  }); // 移除依赖数组，确保数据实时更新

  // 动态统计卡片数据
  const dynamicDashboardStats = dashboardStats.map(stat => {
    const {
      totalProducts,
      totalInventory,
      lowStockCount,
      normalStockCount,
      recent7DaysTransactionsCount,
      recent7DaysAuditLogsCount
    } = dashboardData;

    if (stat.id === 'total-products') {
      return {
        ...stat,
        value: totalProducts.toString(),
        description: '系统中产品总数'
      };
    } else if (stat.id === 'normal-stock') {
      return {
        ...stat,
        value: normalStockCount.toString(),
        description: '库存正常产品数'
      };
    } else if (stat.id === 'low-stock-alerts') {
      return {
        ...stat,
        value: lowStockCount.toString(),
        description: '当前低库存产品数量'
      };
    } else if (stat.id === 'recent-transactions') {
      return {
        ...stat,
        value: recent7DaysTransactionsCount.toString(),
        description: '近7日交易记录数'
      };
    } else if (stat.id === 'recent-audit-logs') {
      return {
        ...stat,
        value: recent7DaysAuditLogsCount.toString(),
        description: '近7日审计记录数'
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5 mb-6">
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
              {dashboardData.recentTransactions.map((txn) => (
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
            <p className="text-sm text-slate-500 mt-1">当前 {dashboardData.lowStockCount} 个产品库存不足</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {dashboardData.lowStockAlerts.slice(0, 5).map((alert) => (
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
                查看全部{dashboardData.lowStockCount > 0 ? ` ${dashboardData.lowStockCount} 条` : ''}预警信息 →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 第二组两列布局：交易趋势与低库存概览增强 */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 近7日交易趋势 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">近7日交易趋势</h2>
            <p className="text-sm text-slate-500 mt-1">入库与出库数量趋势</p>
          </div>
          <div className="p-6">
            <TransactionTrendChart data={dashboardData.transactionTrendData} />
          </div>
        </div>

        {/* 低库存概览增强 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">低库存概览</h2>
            <p className="text-sm text-slate-500 mt-1">低库存数量、占比与最需关注产品</p>
          </div>
          <div className="p-6">
            <LowStockOverview
              lowStockCount={dashboardData.lowStockCount}
              lowStockPercentage={dashboardData.lowStockPercentage}
              top3Products={dashboardData.top3LowStockProducts}
              totalProducts={dashboardData.totalProducts}
            />
          </div>
        </div>
      </div>

      {/* 审计日志概览统计 */}
      <div className="mt-8 bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">近7日审计记录统计</h2>
          <p className="text-sm text-slate-500 mt-1">按操作类型统计数量</p>
        </div>
        <div className="p-6">
          <AuditLogStatsChart
            stats={dashboardData.auditLogStatsArray}
            maxCount={dashboardData.maxAuditLogCount}
          />
        </div>
      </div>

      {/* 最近操作记录 */}
      <div className="mt-8 bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">最近操作记录</h2>
          <p className="text-sm text-slate-500 mt-1">系统最近 5 条操作记录</p>
        </div>
        <div className="p-6">
          {dashboardData.recentAuditLogs.length > 0 ? (
            <div className="space-y-4">
              {dashboardData.recentAuditLogs.map((log) => {
                const actionConfig = getActionConfig(log.actionType);
                const timeText = formatAuditTime(log.timestamp, 'time');
                const summaryText = generateAuditSummary(log, true);

                return (
                  <div key={log.id} className="flex items-start justify-between py-3 border-b border-slate-100 last:border-0">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {/* 时间列 */}
                      <div className="shrink-0 w-16 text-sm font-medium text-slate-700">
                        {timeText}
                      </div>
                      {/* 操作类型标签 */}
                      <div className="shrink-0">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${actionConfig.color}`}>
                          {actionConfig.label}
                        </span>
                      </div>
                      {/* 主要内容 */}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-800 truncate">
                          {log.productName || '-'}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">
                          {summaryText}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="text-slate-400 mb-2">暂无操作记录</div>
              <div className="text-sm text-slate-500">
                执行新增产品、编辑产品、出入库等操作后，这里会显示最近记录
              </div>
            </div>
          )}
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