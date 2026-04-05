import { useMemo, useState } from 'react';
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
    <div className="bg-white border border-slate-200 rounded-lg p-2 sm:p-3 md:p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-xs sm:text-sm md:text-sm text-slate-500 mb-1">{title}</div>
          <div className="text-lg sm:text-xl md:text-2xl font-semibold text-slate-800">{value}</div>
          {description && (
            <div className="mt-1 md:mt-2 text-xs text-slate-500">{description}</div>
          )}
        </div>
        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full ${iconColor} flex items-center justify-center ml-2 md:ml-4`}>
          <div className="w-4 h-4 md:w-5 md:h-5 bg-white/80 rounded"></div>
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

  // 优化零值日期显示：折叠连续零值区间
  const optimizedData = [];
  let i = 0;
  while (i < data.length) {
    const current = data[i];
    const hasTransactions = current.inCount > 0 || current.outCount > 0;

    if (hasTransactions) {
      // 有交易的日期，单独显示
      optimizedData.push({
        type: 'transaction',
        ...current
      });
      i++;
    } else {
      // 连续零值日期，合并为一组
      let zeroCount = 1;
      while (i + zeroCount < data.length) {
        const next = data[i + zeroCount];
        if (next.inCount === 0 && next.outCount === 0) {
          zeroCount++;
        } else {
          break;
        }
      }

      if (zeroCount === 1) {
        // 单个零值日期
        optimizedData.push({
          type: 'zero-single',
          ...current
        });
      } else {
        // 连续零值日期组
        optimizedData.push({
          type: 'zero-group',
          startDate: current.displayDate,
          endDate: data[i + zeroCount - 1].displayDate,
          count: zeroCount,
          date: current.date,
          displayDate: `${current.displayDate}-${data[i + zeroCount - 1].displayDate}`
        });
      }
      i += zeroCount;
    }
  }

  return (
    <div className="space-y-3">
      {optimizedData.map((item, index) => {
        const isZero = item.type.startsWith('zero');

        if (item.type === 'zero-group') {
          // 连续零值日期组
          return (
            <div key={`zero-group-${index}`} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-400">{item.displayDate}</div>
                <div className="text-sm text-slate-400">
                  连续{item.count}天无交易
                </div>
              </div>
              <div className="h-4 rounded overflow-hidden bg-slate-100/50">
                <div className="h-full w-full bg-slate-200/30"></div>
              </div>
            </div>
          );
        }

        // 单个日期（可能有交易或零值）
        const hasTransactions = item.inCount > 0 || item.outCount > 0;

        return (
          <div key={item.date} className={`space-y-2 ${isZero ? 'opacity-80' : ''}`}>
            <div className="flex items-center justify-between">
              <div className={`text-sm font-medium ${hasTransactions ? 'text-slate-700' : 'text-slate-400'}`}>
                {item.displayDate}
              </div>
              <div className={`text-sm ${hasTransactions ? 'text-slate-500' : 'text-slate-400'}`}>
                {hasTransactions ? (
                  <>
                    入库: <span className="font-medium text-emerald-600">{item.inCount}</span> ·
                    出库: <span className="font-medium text-rose-600">{item.outCount}</span>
                  </>
                ) : (
                  '无交易'
                )}
              </div>
            </div>
            {hasTransactions ? (
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
            ) : (
              <div className="h-4 rounded overflow-hidden bg-slate-100/50">
                <div className="h-full w-full bg-slate-200/30"></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 低库存概览增强组件
function LowStockOverview({ lowStockCount, lowStockPercentage, top3Products, totalProducts }) {
  return (
    <div className="space-y-3 md:space-y-4">
      {/* 概览卡片 */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
          <div className="text-xs md:text-sm text-slate-500 mb-1">低库存数量</div>
          <div className="text-xl md:text-2xl font-semibold text-slate-800">{lowStockCount}</div>
          <div className="text-xs md:text-sm text-slate-500 mt-1">个产品</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
          <div className="text-xs md:text-sm text-slate-500 mb-1">低库存占比</div>
          <div className="text-xl md:text-2xl font-semibold text-slate-800">{lowStockPercentage}%</div>
          <div className="text-xs md:text-sm text-slate-500 mt-1">占产品总数</div>
        </div>
      </div>

      {/* 最需关注的前3个产品 */}
      <div>
        <div className="text-sm font-medium text-slate-700 mb-2 md:mb-3">最需关注产品</div>
        <div className="space-y-2 md:space-y-3">
          {top3Products.length > 0 ? (
            top3Products.map((product) => (
              <div key={product.id} className="flex items-center justify-between p-2 md:p-3 border border-slate-200 rounded">
                <div className="min-w-0 flex-1 pr-2">
                  <div className="font-medium text-slate-800 truncate">{product.productName}</div>
                  <div className="text-xs md:text-sm text-slate-500 mt-1">
                    当前库存 {product.currentStock} / 最低 {product.minStock}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base md:text-lg font-semibold text-rose-600">
                    {Math.round((product.currentStock / product.minStock) * 100)}%
                  </div>
                  <div className="mt-1">
                    <UrgencyBadge urgency={product.urgency} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-3 md:py-4 text-center text-slate-400">
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

  // 计算非零统计项数量
  const nonZeroStats = stats.filter(item => item.count > 0);
  const hasMostlyZeros = nonZeroStats.length <= 1; // 0或1个非零项视为"大部分为0"

  const scale = maxCount > 0 ? 100 / maxCount : 0;

  return (
    <div className="space-y-4">
      {/* 轻量提示：当大部分统计项为0时 */}
      {hasMostlyZeros && (
        <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded">
          <div className="text-sm text-slate-600">
            当前时间范围内操作记录较少，各类型统计值多为0。
          </div>
        </div>
      )}

      {stats.map((item) => (
        <div key={item.type} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">{item.label}</div>
            <div className={`text-sm font-medium ${item.count === 0 ? 'text-slate-400' : 'text-slate-800'}`}>
              {item.count}
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            {item.count > 0 ? (
              <div
                className={`h-full ${item.color.split(' ')[0]}`}
                style={{ width: `${item.count * scale}%` }}
                title={`${item.label}: ${item.count}`}
              />
            ) : (
              <div className="h-full bg-slate-200 opacity-30" style={{ width: '100%' }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  // 时间范围筛选状态
  const [timeRange, setTimeRange] = useState('7days'); // '7days', '30days', 'all'

  // 计算紧急程度（根据库存百分比）
  const calculateUrgency = (product) => {
    const ratio = product.currentStock / product.minStock;
    if (ratio <= 0.2) return 'high';
    if (ratio <= 0.5) return 'medium';
    return 'low';
  };


  // 实时计算统计数据（基于最新产品数据）
  const dashboardData = useMemo(() => {
    // 根据时间范围确定天数，'all' 表示全部历史数据
    const days = timeRange === '7days' ? 7 : timeRange === '30days' ? 30 : null; // null 表示全部数据

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

    // 获取最近N天的日期范围
    const getRecentDates = (days = 7) => {
      const dates = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]); // YYYY-MM-DD
      }
      return dates;
    };

    // 从日期时间字符串中提取日期部分（YYYY-MM-DD）
    const extractDatePart = (dateTimeStr) => {
      if (!dateTimeStr) return '';
      // 格式可能是 "2026-03-29 14:30" 或 "2026-03-29"
      return dateTimeStr.split(' ')[0];
    };

    // 根据时间范围获取要统计的日期列表
    let dateRange = [];
    if (days !== null) {
      // 有限时间范围：最近N天
      dateRange = getRecentDates(days);
    } else {
      // 全部数据：从所有交易记录中提取唯一日期
      const allDatesSet = new Set();
      allTransactions.forEach(txn => {
        if (txn.date) {
          const datePart = extractDatePart(txn.date);
          if (datePart) {
            allDatesSet.add(datePart);
          }
        }
      });
      // 从审计日志中也提取日期
      allAuditLogs.forEach(log => {
        if (log.timestamp) {
          const logDate = new Date(log.timestamp).toISOString().split('T')[0];
          allDatesSet.add(logDate);
        }
      });
      // 转换为数组并按日期排序（升序）
      dateRange = Array.from(allDatesSet).sort();
    }

    // 计算选定时间范围内的交易记录数量
    const recentDaysTransactions = allTransactions.filter(txn => {
      if (!txn.date) return false;
      const datePart = extractDatePart(txn.date);
      return dateRange.includes(datePart);
    });
    const recentDaysTransactionsCount = recentDaysTransactions.length;

    // 计算选定时间范围内的审计日志数量
    const recentDaysAuditLogs = allAuditLogs.filter(log => {
      if (!log.timestamp) return false;
      const logDate = new Date(log.timestamp).toISOString().split('T')[0];
      return dateRange.includes(logDate);
    });
    const recentDaysAuditLogsCount = recentDaysAuditLogs.length;

    // 计算交易趋势数据（按日期统计入库/出库数量）
    const transactionTrendData = dateRange.map(date => {
      const dayTransactions = allTransactions.filter(txn => {
        if (!txn.date) return false;
        const datePart = extractDatePart(txn.date);
        return datePart === date;
      });
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

    // 统计选定时间范围内的审计日志类型
    recentDaysAuditLogs.forEach(log => {
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

    // 获取选定时间范围内最近5条交易记录（按日期倒序）
    const recentTransactions = [...recentDaysTransactions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    // 获取选定时间范围内最近5条审计日志（已按时间倒序排列）
    const recentAuditLogs = recentDaysAuditLogs.slice(0, 5);

    // 计算交易趋势汇总数据
    const transactionSummary = {
      totalInCount: transactionTrendData.reduce((sum, item) => sum + item.inCount, 0),
      totalOutCount: transactionTrendData.reduce((sum, item) => sum + item.outCount, 0),
      totalTransactionsCount: recentDaysTransactionsCount, // 交易记录总笔数
      totalQuantityCount: transactionTrendData.reduce((sum, item) => sum + item.totalCount, 0), // 出入库总数量
    };
    transactionSummary.netChange = transactionSummary.totalInCount - transactionSummary.totalOutCount;

    return {
      totalProducts,
      totalInventory,
      lowStockCount,
      normalStockCount,
      lowStockAlerts,
      recentDaysTransactionsCount,
      recentDaysAuditLogsCount,
      transactionTrendData,
      lowStockPercentage,
      top3LowStockProducts,
      auditLogStatsArray,
      maxAuditLogCount,
      recentTransactions,
      recentAuditLogs,
      transactionSummary
    };
  }, [timeRange]); // 依赖时间范围

  // 动态统计卡片数据
  const dynamicDashboardStats = dashboardStats.map(stat => {
    const {
      totalProducts,
      totalInventory,
      lowStockCount,
      normalStockCount,
      recentDaysTransactionsCount,
      recentDaysAuditLogsCount
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
      const rangeText = timeRange === '7days' ? '近7日' : timeRange === '30days' ? '近30日' : '全部';
      return {
        ...stat,
        title: `${rangeText}交易记录`,
        value: recentDaysTransactionsCount.toString(),
        description: `${rangeText}交易记录数`
      };
    } else if (stat.id === 'recent-audit-logs') {
      const rangeText = timeRange === '7days' ? '近7日' : timeRange === '30days' ? '近30日' : '全部';
      return {
        ...stat,
        title: `${rangeText}审计记录`,
        value: recentDaysAuditLogsCount.toString(),
        description: `${rangeText}审计记录数`
      };
    }
    return stat;
  });

  return (
    <div className="p-4 md:p-6">
      {/* 页面标题区 */}
      <div className="mb-4 md:mb-6">
        <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-slate-800">仪表盘</h1>
        <p className="text-slate-600 mt-1 text-xs sm:text-sm md:text-base">
          欢迎回来，这里是库存管理系统的核心概览。
        </p>
      </div>

      {/* 时间范围筛选器 */}
      <div className="mb-4 md:mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs sm:text-sm text-slate-500 mr-3 whitespace-nowrap">时间范围:</span>
          <div className="inline-flex rounded-md border border-slate-200 bg-white shadow-sm">
            <button
              className={`px-2 py-2 text-xs sm:text-sm md:px-3 md:py-2 md:text-sm font-medium rounded-l-md transition-colors ${
                timeRange === '7days'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setTimeRange('7days')}
            >
              近7天
            </button>
            <button
              className={`px-2 py-2 text-xs sm:text-sm md:px-3 md:py-2 md:text-sm font-medium border-l border-slate-200 transition-colors ${
                timeRange === '30days'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setTimeRange('30days')}
            >
              近30天
            </button>
            <button
              className={`px-2 py-2 text-xs sm:text-sm md:px-3 md:py-2 md:text-sm font-medium rounded-r-md border-l border-slate-200 transition-colors ${
                timeRange === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setTimeRange('all')}
            >
              全部
            </button>
          </div>
        </div>
      </div>

      {/* 统计卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-5 mb-4 md:mb-6">
        {dynamicDashboardStats.map((stat) => (
          <StatCard key={stat.id} {...stat} />
        ))}
      </div>

      {/* 两列布局：最近记录与预警概览 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* 最近出入库记录 - 优化信息层级 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">最近出入库记录</h2>
                <p className="text-sm text-slate-500 mt-1">最新交易记录，按时间倒序排列</p>
              </div>
              <div className="text-xs text-slate-500">
                共 <span className="font-medium text-slate-700">{dashboardData.recentTransactions.length}</span> 条记录
              </div>
            </div>
          </div>
          <div className="p-4 md:p-6">
            <div className="space-y-0 divide-y divide-slate-100">
              {dashboardData.recentTransactions.map((txn) => {
                const timeText = formatAuditTime(txn.date, 'compact');
                const dateText = formatAuditTime(txn.date, 'date');
                return (
                  <div key={txn.id} className="group hover:bg-slate-50/50 transition-colors py-3 md:py-3.5">
                    {/* 桌面端网格布局 - 优化为更清晰的摘要布局 */}
                    <div className="hidden md:block">
                      <div className="flex items-start gap-4">
                        <div className="w-28 shrink-0">
                          <div className="text-sm font-medium text-slate-800" title={timeText}>
                            {timeText}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5" title={dateText}>
                            {dateText}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1.5">
                            <div className="text-sm font-medium text-slate-800 truncate" title={txn.productName}>
                              {txn.productName}
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${txn.type === '入库' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              {txn.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <div>操作人: <span className="font-medium text-slate-700">{txn.operator}</span></div>
                            <div>数量: <span className="font-medium text-slate-800">{txn.quantity} 件</span></div>
                          </div>
                          <div className="mt-2">
                            <StatusBadge status={txn.status} />
                          </div>
                        </div>
                        <div className="shrink-0">
                          <div className={`w-2 h-2 rounded-full ${txn.type === '入库' ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                        </div>
                      </div>
                    </div>

                    {/* 移动端卡片布局 */}
                    <div className="md:hidden py-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm font-medium text-slate-700">{timeText}</div>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${txn.type === '入库' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {txn.type}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="font-medium text-slate-800 truncate text-sm">{txn.productName}</div>
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-slate-600">{txn.operator}</div>
                          <div className="text-sm font-medium text-slate-800">{txn.quantity} 件</div>
                        </div>
                        <div className="mt-1">
                          <StatusBadge status={txn.status} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 md:mt-6 pt-4 md:pt-5 border-t border-slate-100">
              <button className="w-full py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors flex items-center justify-center gap-1">
                查看全部出入库记录 →
              </button>
            </div>
          </div>
        </div>

        {/* 低库存预警概览 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">低库存预警</h2>
                <p className="text-sm text-slate-500 mt-1">当前库存不足产品概览</p>
              </div>
              <div className="text-xs text-slate-500">
                共 <span className="font-medium text-slate-700">{dashboardData.lowStockCount}</span> 个产品库存不足
              </div>
            </div>
          </div>
          <div className="p-4 md:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              {dashboardData.lowStockAlerts.slice(0, 6).map((alert) => {
                const gap = alert.currentStock - alert.minStock;
                const gapText = gap >= 0 ? `剩余 ${gap}` : `缺口 ${-gap}`;
                const gapColorClass = gap >= 0 ? 'text-emerald-600' : 'text-rose-600';

                return (
                  <div key={alert.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 md:p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between mb-2 md:mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800 truncate">{alert.productName}</div>
                        <div className="text-xs md:text-sm text-slate-500 mt-1 truncate">{alert.category}</div>
                      </div>
                      <div className="ml-2 shrink-0">
                        <UrgencyBadge urgency={alert.urgency} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                      <div>
                        <div className="text-xs md:text-sm text-slate-500 mb-1">当前库存</div>
                        <div className="text-base md:text-lg font-semibold text-slate-800">{alert.currentStock}</div>
                      </div>
                      <div>
                        <div className="text-xs md:text-sm text-slate-500 mb-1">最低库存</div>
                        <div className="text-base md:text-lg font-semibold text-slate-800">{alert.minStock}</div>
                      </div>
                    </div>

                    <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="text-xs md:text-sm text-slate-500">库存状态</div>
                        <div className={`text-xs md:text-sm font-semibold ${gapColorClass}`}>
                          {gapText}
                        </div>
                      </div>
                      <div className="mt-1">
                        <div className="text-xs text-slate-500">
                          占比: {Math.round((alert.currentStock / alert.minStock) * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 md:mt-6 pt-4 md:pt-5 border-t border-slate-100">
              <button className="w-full py-2 md:py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">
                查看全部{dashboardData.lowStockCount > 0 ? ` ${dashboardData.lowStockCount} 条` : ''}预警信息 →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 第二组两列布局：交易趋势与低库存概览增强 */}
      <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* 交易趋势分析 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  {timeRange === '7days' ? '近7日' : timeRange === '30days' ? '近30日' : '最近'}交易趋势
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {timeRange === 'all' ? '全部交易记录的入库与出库数量趋势分析' : '入库与出库数量每日趋势对比'}
                </p>
              </div>
              <div className="text-xs text-slate-500">
                共 <span className="font-medium text-slate-700">{dashboardData.transactionSummary.totalTransactionsCount}</span> 笔交易
              </div>
            </div>
          </div>
          <div className="p-4 md:p-6 lg:max-h-[600px] lg:overflow-y-auto">
            <div className="mb-5 md:mb-6">
              <TransactionTrendChart data={dashboardData.transactionTrendData} />
            </div>

            {/* 交易趋势汇总信息 - 优化为更清晰的信息卡片 */}
            <div className="mt-6 md:mt-8 pt-5 md:pt-6 border-t border-slate-100">
              <h3 className="text-sm font-medium text-slate-700 mb-3 md:mb-4">趋势汇总</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
                  <div className="text-xs md:text-sm text-slate-500 mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    入库总量
                  </div>
                  <div className="text-xl md:text-2xl font-semibold text-emerald-600 mt-1">
                    {dashboardData.transactionSummary.totalInCount}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">件 · 占总交易量</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
                  <div className="text-xs md:text-sm text-slate-500 mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    出库总量
                  </div>
                  <div className="text-xl md:text-2xl font-semibold text-rose-600 mt-1">
                    {dashboardData.transactionSummary.totalOutCount}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">件 · 占总交易量</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
                  <div className="text-xs md:text-sm text-slate-500 mb-1">净变化</div>
                  <div className={`text-xl md:text-2xl font-semibold mt-1 ${dashboardData.transactionSummary.netChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {dashboardData.transactionSummary.netChange >= 0 ? '+' : ''}{dashboardData.transactionSummary.netChange}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">入库 - 出库</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
                  <div className="text-xs md:text-sm text-slate-500 mb-1">交易总笔数</div>
                  <div className="text-xl md:text-2xl font-semibold text-slate-800 mt-1">
                    {dashboardData.transactionSummary.totalTransactionsCount}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">笔 · 平均每日</div>
                </div>
              </div>
              {timeRange !== 'all' && (
                <div className="mt-4 md:mt-5 pt-3 md:pt-4 border-t border-slate-100">
                  <div className="text-xs text-slate-600">
                    <span className="font-medium">趋势解读：</span>
                    当前时间范围内入库总量 {dashboardData.transactionSummary.totalInCount >= dashboardData.transactionSummary.totalOutCount ? '大于' : '小于'} 出库总量，整体库存呈现{dashboardData.transactionSummary.netChange >= 0 ? '净增长' : '净减少'}趋势。
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 低库存概览增强 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">低库存概览</h2>
                <p className="text-sm text-slate-500 mt-1">低库存数量、占比与最需关注产品</p>
              </div>
              <div className="text-xs text-slate-500">
                占比 <span className="font-medium text-slate-700">{dashboardData.lowStockPercentage}%</span> · 总数 {dashboardData.totalProducts}
              </div>
            </div>
          </div>
          <div className="p-4 md:p-6">
            <LowStockOverview
              lowStockCount={dashboardData.lowStockCount}
              lowStockPercentage={dashboardData.lowStockPercentage}
              top3Products={dashboardData.top3LowStockProducts}
              totalProducts={dashboardData.totalProducts}
            />
          </div>
        </div>
      </div>

      {/* 审计日志概览统计 - 优化信息层级 */}
      <div className="mt-6 md:mt-8 bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {timeRange === '7days' ? '近7日' : timeRange === '30days' ? '近30日' : '全部'}审计记录统计
              </h2>
              <p className="text-sm text-slate-500 mt-1">按操作类型统计系统操作频率与分布</p>
            </div>
            <div className="text-xs text-slate-500">
              总计 <span className="font-medium text-slate-700">{dashboardData.recentDaysAuditLogsCount}</span> 条审计记录
            </div>
          </div>
        </div>
        <div className="p-4 md:p-6">
          <div className="mb-4">
            <AuditLogStatsChart
              stats={dashboardData.auditLogStatsArray}
              maxCount={dashboardData.maxAuditLogCount}
            />
          </div>

          {/* 操作类型分布摘要 */}
          <div className="mt-5 md:mt-6 pt-4 md:pt-5 border-t border-slate-100">
            <h3 className="text-sm font-medium text-slate-700 mb-3">操作类型分布</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
              {dashboardData.auditLogStatsArray
                .filter(item => item.count > 0)
                .sort((a, b) => b.count - a.count)
                .slice(0, 6)
                .map((item) => (
                  <div key={item.type} className="flex items-center justify-between p-2 md:p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${item.color.split(' ')[0].replace('bg-', 'bg-')}`}></div>
                      <div className="text-xs md:text-sm font-medium text-slate-700 truncate">{item.label}</div>
                    </div>
                    <div className="text-xs md:text-sm font-semibold text-slate-800">{item.count}</div>
                  </div>
                ))}
            </div>
            {dashboardData.auditLogStatsArray.filter(item => item.count > 0).length === 0 && (
              <div className="py-3 text-center text-slate-400 text-sm">
                暂无操作类型分布数据
              </div>
            )}
            {dashboardData.auditLogStatsArray.filter(item => item.count > 0).length > 0 && (
              <div className="mt-3 md:mt-4 text-xs text-slate-600">
                <span className="font-medium">分布解读：</span>
                当前时间范围内，<span className="font-medium text-slate-800">
                  {dashboardData.auditLogStatsArray.reduce((max, item) => item.count > max.count ? item : max, {count: 0, label: ''}).label}
                </span> 操作最为频繁，反映了系统近期主要活动类型。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 最近操作记录 - 优化为后台首页摘要风格 */}
      <div className="mt-6 md:mt-8 bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">最近操作记录</h2>
              <p className="text-sm text-slate-500 mt-1">系统最近操作摘要，按时间倒序排列</p>
            </div>
            <div className="text-xs text-slate-500">
              共 <span className="font-medium text-slate-700">{dashboardData.recentAuditLogs.length}</span> 条记录
            </div>
          </div>
        </div>
        <div className={`p-4 md:p-6 ${dashboardData.recentAuditLogs.length <= 2 ? 'pb-4' : ''}`}>
          {dashboardData.recentAuditLogs.length > 0 ? (
            <div className="space-y-0 divide-y divide-slate-100">
              {dashboardData.recentAuditLogs.map((log) => {
                const actionConfig = getActionConfig(log.actionType);
                const timeText = formatAuditTime(log.timestamp, 'compact');
                const dateText = formatAuditTime(log.timestamp, 'date');
                const summaryText = generateAuditSummary(log, true);
                const operatorText = getDisplayOperator(log.operator);

                return (
                  <div key={log.id} className="group hover:bg-slate-50/50 transition-colors py-3 md:py-3.5">
                    {/* 桌面端摘要布局 */}
                    <div className="hidden md:block">
                      <div className="flex items-start gap-4">
                        {/* 左侧时间与日期区块 */}
                        <div className="w-32 shrink-0">
                          <div className="text-sm font-medium text-slate-800" title={timeText}>
                            {timeText}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5" title={dateText}>
                            {dateText}
                          </div>
                        </div>
                        {/* 中间操作类型与产品信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${actionConfig.color}`}>
                              {actionConfig.label}
                            </span>
                            <div className="text-sm font-medium text-slate-800 truncate" title={log.productName || '系统操作'}>
                              {log.productName || '系统操作'}
                            </div>
                          </div>
                          <div className="text-sm text-slate-600">
                            {summaryText}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="text-xs text-slate-500">
                              操作人: <span className="font-medium text-slate-700">{operatorText}</span>
                            </div>
                            {log.notes && (
                              <div className="text-xs text-slate-500 truncate max-w-xs" title={log.notes}>
                                备注: {log.notes}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* 右侧快速状态指示 */}
                        <div className="shrink-0">
                          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        </div>
                      </div>
                    </div>

                    {/* 移动端卡片布局 */}
                    <div className="md:hidden">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm font-medium text-slate-700">{timeText}</div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${actionConfig.color}`}>
                          {actionConfig.label}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-slate-800 truncate text-sm flex-1">
                            {log.productName || '系统操作'}
                          </div>
                        </div>
                        <div className="text-xs text-slate-600">
                          {summaryText}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <div>操作人: <span className="font-medium text-slate-700">{operatorText}</span></div>
                          {log.notes && (
                            <div className="truncate max-w-[120px]" title={log.notes}>有备注</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 md:py-12 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <div className="w-6 h-6 bg-slate-300 rounded"></div>
              </div>
              <div className="text-slate-400 mb-2">暂无操作记录</div>
              <div className="text-xs md:text-sm text-slate-500 max-w-md mx-auto">
                执行新增产品、编辑产品、出入库等操作后，这里会显示最近记录
              </div>
            </div>
          )}
          {dashboardData.recentAuditLogs.length > 0 && (
            <div className="mt-4 md:mt-6 pt-4 md:pt-5 border-t border-slate-100">
              <button className="w-full py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors flex items-center justify-center gap-1">
                查看完整操作日志 →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 md:mt-8 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-xs md:text-sm text-slate-600">
          提示：本系统为独立新版库存管理系统，不影响现有旧版系统。所有数据均为演示用途。
        </div>
      </div>
    </div>
  );
}

export default Dashboard;