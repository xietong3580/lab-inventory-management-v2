import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { productService, transactionService, auditLogService } from '../services/dataService';
import {
  formatAuditTime,
  generateAuditSummary,
  getDisplayOperator,
  getActionConfig,
  actionTypeMap
} from '../utils/auditLogHelpers';
import { calculateUrgency, getRecentDates, extractDatePart } from '../utils/inventoryHelpers';
import { getTrendInterpretation } from '../utils/dashboardHelpers';
import InventoryTrendChart from '../components/dashboard/InventoryTrendChart';
import TransactionCompareChart from '../components/dashboard/TransactionCompareChart';
import RiskDistributionChart from '../components/dashboard/RiskDistributionChart';

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
    completed: { text: '已完成', bg: 'bg-slate-50', textColor: 'text-slate-600' },
    pending: { text: '处理中', bg: 'bg-amber-50', textColor: 'text-amber-600' },
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
    high: { text: '紧急', bg: 'bg-rose-50', textColor: 'text-rose-600' },
    medium: { text: '中等', bg: 'bg-amber-50', textColor: 'text-amber-600' },
    low: { text: '较低', bg: 'bg-slate-100', textColor: 'text-slate-600' },
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
                    出库: <span className="font-medium text-sky-600">{item.outCount}</span>
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
                    className="bg-emerald-400"
                    style={{ width: `${item.inCount * scale}%` }}
                    title={`入库: ${item.inCount}`}
                  />
                )}
                {/* 出库条形 */}
                {item.outCount > 0 && (
                  <div
                    className="bg-sky-400 ml-0.5"
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
function LowStockOverview({ lowStockCount, lowStockPercentage, top3Products }) {
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
                  <div className="text-base md:text-lg font-semibold text-slate-700">
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
  const navigate = useNavigate();
  // 产品数据状态（通过统一服务层获取）
  const [productsData, setProductsData] = useState({
    productsWithStatus: [],
    allProducts: [],
    loading: true,
    error: null
  });

  // 交易记录数据状态
  const [transactionsData, setTransactionsData] = useState({
    transactions: [],
    loading: true,
    error: null
  });

  // 审计日志数据状态
  const [auditLogsData, setAuditLogsData] = useState({
    auditLogs: [],
    loading: true,
    error: null
  });

  // Step 10-21D：calculateUrgency 从 inventoryHelpers 导入，不再内联定义

  // 通过统一服务层获取产品数据
  useEffect(() => {
    let isMounted = true;

    const fetchProductsData = async () => {
      try {
        setProductsData(prev => ({ ...prev, loading: true, error: null }));

        // 通过统一服务层获取产品数据
        const [productsWithStatus, allProducts] = await Promise.all([
          productService.getProductsWithCalculatedStatus(),
          productService.getAllProducts()
        ]);

        if (isMounted) {
          setProductsData({
            productsWithStatus,
            allProducts,
            loading: false,
            error: null
          });
        }
      } catch (error) {
        console.error('[Dashboard] 获取产品数据失败:', error);
        if (isMounted) {
          setProductsData(prev => ({
            ...prev,
            loading: false,
            error: '产品数据加载失败，使用降级数据'
          }));
          // 错误时保持空数组，dashboardData计算会使用空数组但不会崩溃
        }
      }
    };

    fetchProductsData();

    return () => {
      isMounted = false;
    };
  }, []); // 空依赖数组，只在组件挂载时获取一次

  // 获取交易记录、审计日志和仪表盘统计数据
  useEffect(() => {
    let isMounted = true;

    const fetchAllData = async () => {
      try {
        // 并行获取交易记录和审计日志
        const [transactions, auditLogs] = await Promise.all([
          transactionService.getTransactions(),
          auditLogService.getAuditLogs()
        ]);

        if (isMounted) {
          setTransactionsData({
            transactions,
            loading: false,
            error: null
          });
          setAuditLogsData({
            auditLogs,
            loading: false,
            error: null
          });
        }
      } catch (error) {
        console.error('[Dashboard] 获取数据失败:', error);
        if (isMounted) {
          setTransactionsData(prev => ({
            ...prev,
            loading: false,
            error: '交易数据加载失败，使用降级数据'
          }));
          setAuditLogsData(prev => ({
            ...prev,
            loading: false,
            error: '审计日志加载失败，使用降级数据'
          }));
        }
      }
    };

    fetchAllData();

    return () => {
      isMounted = false;
    };
  }, []); // 空依赖数组，只在组件挂载时获取一次

  // 空数据兜底函数，避免加载过程中计算错误
  const getEmptyDashboardData = () => {
    const emptyDateRange = [];
    return {
      totalProducts: 0,
      totalInventory: 0,
      lowStockCount: 0,
      normalStockCount: 0,
      lowStockAlerts: [],
      recentDaysTransactionsCount: 0,
      recentDaysAuditLogsCount: 0,
      transactionTrendData: emptyDateRange,
      lowStockPercentage: 0,
      top3LowStockProducts: [],
      auditLogStatsArray: [],
      maxAuditLogCount: 1,
      recentTransactions: [],
      recentAuditLogs: [],
      transactionSummary: {
        totalInCount: 0,
        totalOutCount: 0,
        totalTransactionsCount: 0,
        totalQuantityCount: 0,
        netChange: 0
      },
      inventoryTrendData: emptyDateRange,
      transactionCompareData: emptyDateRange
    };
  };

  // 实时计算统计数据（基于最新产品数据）
  const dashboardData = useMemo(() => {
    // 根据时间范围确定天数，'all' 表示全部历史数据
    const days = timeRange === '7days' ? 7 : timeRange === '30days' ? 30 : null; // null 表示全部数据

    // 如果产品数据、交易数据或审计日志数据仍在加载，返回空数据避免计算错误
    if (productsData.loading || transactionsData.loading || auditLogsData.loading) {
      return getEmptyDashboardData();
    }

    const products = productsData.productsWithStatus;
    const allProducts = productsData.allProducts;
    const allTransactions = transactionsData.transactions;
    const allAuditLogs = auditLogsData.auditLogs;

    // 已完成交易（用于趋势统计）
    const completedTransactions = allTransactions.filter(txn => txn.status === 'completed');

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

    // Step 10-21D：getRecentDates / extractDatePart 从 inventoryHelpers 导入

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

    // 计算选定时间范围内已完成交易的数量（用于趋势统计）
    const completedRecentDaysTransactions = completedTransactions.filter(txn => {
      if (!txn.date) return false;
      const datePart = extractDatePart(txn.date);
      return dateRange.includes(datePart);
    });
    const completedRecentDaysTransactionsCount = completedRecentDaysTransactions.length;

    // 计算选定时间范围内的审计日志数量
    const recentDaysAuditLogs = allAuditLogs.filter(log => {
      if (!log.timestamp) return false;
      const logDate = new Date(log.timestamp).toISOString().split('T')[0];
      return dateRange.includes(logDate);
    });
    const recentDaysAuditLogsCount = recentDaysAuditLogs.length;

    // 计算交易趋势数据（按日期统计入库/出库数量，只统计 completed 状态交易）
    const transactionTrendData = dateRange.map(date => {
      const dayTransactions = completedTransactions.filter(txn => {
        if (!txn.date) return false;
        const datePart = extractDatePart(txn.date);
        return datePart === date;
      });
      const inCount = dayTransactions.filter(txn => txn.type === '入库').reduce((sum, txn) => sum + (Number(txn.quantity) || 0), 0);
      const outCount = dayTransactions.filter(txn => txn.type === '出库').reduce((sum, txn) => sum + (Number(txn.quantity) || 0), 0);

      // 格式化日期显示（MM-DD）
      const [_, month, day] = date.split('-');
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

    // Step 10-21B：审计日志类型统计 — 基于 actionTypeMap 动态生成
    const auditLogStats = Object.fromEntries(
      Object.entries(actionTypeMap).map(([key, config]) => [key, { label: config.label, count: 0, color: config.color }])
    );

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

    // 获取选定时间范围内最近5条审计日志（按时间倒序排列）
    const sortedRecentDaysAuditLogs = [...recentDaysAuditLogs].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    const recentAuditLogs = sortedRecentDaysAuditLogs.slice(0, 5);

    // 计算交易趋势汇总数据
    const transactionSummary = {
      totalInCount: transactionTrendData.reduce((sum, item) => sum + item.inCount, 0),
      totalOutCount: transactionTrendData.reduce((sum, item) => sum + item.outCount, 0),
      totalTransactionsCount: completedRecentDaysTransactionsCount, // 已完成交易总笔数（趋势统计口径）
      totalQuantityCount: transactionTrendData.reduce((sum, item) => sum + item.totalCount, 0), // 出入库总数量
    };
    transactionSummary.netChange = transactionSummary.totalInCount - transactionSummary.totalOutCount;

    // 计算每日净变化（入库 - 出库）基于当前时间范围，只统计 completed 状态交易
    const dailyNetChange = {};
    dateRange.forEach(date => {
      const dayTransactions = completedTransactions.filter(txn => {
        if (!txn.date) return false;
        const datePart = extractDatePart(txn.date);
        return datePart === date;
      });
      const inCount = dayTransactions.filter(txn => txn.type === '入库').reduce((sum, txn) => sum + (Number(txn.quantity) || 0), 0);
      const outCount = dayTransactions.filter(txn => txn.type === '出库').reduce((sum, txn) => sum + (Number(txn.quantity) || 0), 0);
      dailyNetChange[date] = inCount - outCount;
    });

    // 计算净变化总和
    const totalNetChange = dateRange.reduce((sum, date) => sum + (dailyNetChange[date] || 0), 0);
    // 初始库存 = 当前总库存 - 净变化总和，这样累加后最后一天等于当前总库存
    let runningStock = totalInventory - totalNetChange;
    const inventoryTrendData = dateRange.map(date => {
      runningStock += dailyNetChange[date] || 0;
      return {
        date,
        totalStock: Math.max(0, Math.round(runningStock))
      };
    });

    // 计算出入库对比数据（基于当前时间范围），只统计 completed 状态交易
    const transactionCompareData = dateRange.map(date => {
      const dayTransactions = completedTransactions.filter(txn => {
        if (!txn.date) return false;
        const datePart = extractDatePart(txn.date);
        return datePart === date;
      });
      const inCount = dayTransactions.filter(txn => txn.type === '入库').reduce((sum, txn) => sum + (Number(txn.quantity) || 0), 0);
      const outCount = dayTransactions.filter(txn => txn.type === '出库').reduce((sum, txn) => sum + (Number(txn.quantity) || 0), 0);
      const [_, month, day] = date.split('-');
      return {
        date,
        displayDate: `${month}-${day}`,
        inCount,
        outCount
      };
    });

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
      transactionSummary,
      inventoryTrendData,
      transactionCompareData
    };
  }, [timeRange, productsData, transactionsData, auditLogsData]); // 依赖时间范围、产品数据、交易数据和审计日志数据

  // 时间范围文本
  const rangeText = timeRange === '7days' ? '近7日' : timeRange === '30days' ? '近30日' : '全部';

  // Step 10-21C：统计卡片模板来自本地定义，不再请求 /api/dashboard/stats
  const STAT_CARD_TEMPLATES = [
    { id: 'total-products', title: '产品总数', iconColor: 'bg-slate-600', change: '+0', changeType: 'neutral' },
    { id: 'normal-stock', title: '正常库存', iconColor: 'bg-slate-400', change: '+0', changeType: 'neutral' },
    { id: 'low-stock-alerts', title: '低库存预警', iconColor: 'bg-slate-200', change: '+0', changeType: 'neutral' },
    { id: 'recent-transactions', title: '交易记录', iconColor: 'bg-slate-600', change: '+0', changeType: 'neutral' },
    { id: 'recent-audit-logs', title: '审计记录', iconColor: 'bg-slate-400', change: '+0', changeType: 'neutral' },
  ];

  const dynamicDashboardStats = STAT_CARD_TEMPLATES.map(stat => {
    const {
      totalProducts,
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
      return {
        ...stat,
        title: `${rangeText}交易记录`,
        value: recentDaysTransactionsCount.toString(),
        description: `${rangeText}交易记录数`
      };
    } else if (stat.id === 'recent-audit-logs') {
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
          概览当前库存、预警、出入库和最近操作情况，便于日常核对。
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
                            <span className={`px-2 py-1 rounded text-xs font-medium ${txn.type === '入库' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'}`}>
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
                          <div className={`w-2 h-2 rounded-full ${txn.type === '入库' ? 'bg-emerald-300' : 'bg-sky-300'}`}></div>
                        </div>
                      </div>
                    </div>

                    {/* 移动端卡片布局 */}
                    <div className="md:hidden py-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm font-medium text-slate-700">{timeText}</div>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${txn.type === '入库' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'}`}>
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
              <button
                onClick={() => navigate('/transactions')}
                className="w-full py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors flex items-center justify-center gap-1"
              >
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
                const gapColorClass = gap >= 0 ? 'text-slate-600' : 'text-rose-600';

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
              <button
                onClick={() => navigate('/alerts')}
                className="w-full py-2 md:py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
              >
                查看全部{dashboardData.lowStockCount > 0 ? ` ${dashboardData.lowStockCount} 条` : ''}预警信息 →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 第二组三列布局：交易趋势、低库存概览增强与库存风险分布 */}
      <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
        {/* 交易趋势分析 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">
                  库存与交易趋势
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  随时间范围查看库存变化与出入库对比
                </p>
              </div>
              <div className="text-xs text-slate-500">
                共 <span className="font-medium text-slate-700">{dashboardData.transactionSummary.totalTransactionsCount}</span> 笔交易
              </div>
            </div>
          </div>
          <div className="p-4 md:p-6">
            <div className="mb-5 md:mb-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">库存趋势（{rangeText}）</h3>
                  <InventoryTrendChart data={dashboardData.inventoryTrendData} timeRangeLabel={rangeText} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">出入库对比（{rangeText}）</h3>
                  <TransactionCompareChart data={dashboardData.transactionCompareData} timeRangeLabel={rangeText} />
                </div>
              </div>
            </div>

            {/* 交易趋势汇总信息 - 优化为更清晰的信息卡片 */}
            <div className="mt-6 md:mt-8 pt-5 md:pt-6 border-t border-slate-100">
              <h3 className="text-sm font-medium text-slate-700 mb-3 md:mb-4">趋势汇总</h3>
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
                  <div className="text-xs md:text-sm text-slate-500 mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-300"></div>
                    入库总量
                  </div>
                  <div className="text-xl md:text-2xl font-semibold text-slate-700 mt-1">
                    {dashboardData.transactionSummary.totalInCount}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">件 · 占总交易量</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
                  <div className="text-xs md:text-sm text-slate-500 mb-1 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-sky-300"></div>
                    出库总量
                  </div>
                  <div className="text-xl md:text-2xl font-semibold text-slate-700 mt-1">
                    {dashboardData.transactionSummary.totalOutCount}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">件 · 占总交易量</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-3 md:p-4">
                  <div className="text-xs md:text-sm text-slate-500 mb-1">净变化</div>
                  <div className={`text-xl md:text-2xl font-semibold mt-1 text-slate-700`}>
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
              <div className="mt-4 md:mt-5 pt-3 md:pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-600">
                  <span className="font-medium">趋势解读：</span>
                  {getTrendInterpretation(dashboardData.transactionSummary)}
                </div>
              </div>
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
            />
          </div>
        </div>

        {/* 库存风险分布 */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">库存风险分布</h2>
                <p className="text-sm text-slate-500 mt-1">正常库存与低库存比例分析</p>
              </div>
              <div className="text-xs text-slate-500">
                总数 <span className="font-medium text-slate-700">{dashboardData.totalProducts}</span> 个产品
              </div>
            </div>
          </div>
          <div className="p-4 md:p-6">
            <RiskDistributionChart
              lowStockCount={dashboardData.lowStockCount}
              normalStockCount={dashboardData.normalStockCount}
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
                      <div className={`w-2 h-2 rounded-full ${item.color.split(' ')[0]}`}></div>
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
                          <div className="w-2 h-2 rounded-full bg-slate-300"></div>
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
              <button
                onClick={() => navigate('/audit-log')}
                className="w-full py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors flex items-center justify-center gap-1"
              >
                查看完整操作日志 →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 md:mt-8 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-xs md:text-sm text-slate-600">
          提示：统计数据用于辅助管理判断，不会自动修改库存。如发现库存异常，请优先查看产品台账、出入库记录和操作日志。
        </div>
      </div>
    </div>
  );
}

export default Dashboard;