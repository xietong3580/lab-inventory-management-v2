import { useState, useEffect, useRef } from 'react';
import { auditLogService } from '../services/dataService';
import { usePermission } from '../hooks/usePermission';
import {
  formatAuditTime,
  generateAuditSummary,
  getDisplayOperator,
  getActionConfig,
  actionTypeMap
} from '../utils/auditLogHelpers';
import { hasActiveFilters } from '../utils/auditLogFilterHelpers';
import { exportAuditLogsToCSV } from '../utils/exportHelpers';
import Pagination from '../components/common/Pagination';

// 每页条数（服务端分页）
const PAGE_SIZE = 20;
// 产品名称/操作人输入防抖延迟（毫秒）
const DEBOUNCE_MS = 400;

function AuditLog() {
  const { canWrite, adminOnlyTitle } = usePermission();

  // 当前页数据（直接使用服务端返回的当前页 items）
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 导出状态
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // 筛选状态（原始输入值）
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedActionType, setSelectedActionType] = useState('');
  const [selectedTimeRange, setSelectedTimeRange] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [operatorSearch, setOperatorSearch] = useState('');

  // 防抖后的输入值（真正参与服务端筛选请求）
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState('');
  const [debouncedOperatorSearch, setDebouncedOperatorSearch] = useState('');

  // 分页与刷新
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // 用于丢弃较慢的旧请求结果（防止旧响应覆盖新筛选结果）
  const requestSeqRef = useRef(0);

  // 处理日期范围变化
  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  // 清空所有筛选条件
  const clearFilters = () => {
    setSearchKeyword('');
    setSelectedActionType('');
    setSelectedTimeRange('all');
    setDateRange({ start: '', end: '' });
    setOperatorSearch('');
  };

  // 产品名称输入防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchKeyword(searchKeyword), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 操作人输入防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedOperatorSearch(operatorSearch), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [operatorSearch]);

  // 筛选条件变化时回到第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearchKeyword,
    debouncedOperatorSearch,
    selectedActionType,
    selectedTimeRange,
    dateRange.start,
    dateRange.end
  ]);

  // 页码越界安全处理：totalPages 缩小后，把当前页收敛回合法范围
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // 加载当前页审计日志（进入页面 + 筛选变化 + 翻页 + 点击刷新）
  useEffect(() => {
    const seq = ++requestSeqRef.current;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await auditLogService.getAuditLogs({
          page: currentPage,
          pageSize: PAGE_SIZE,
          actionType: selectedActionType,
          productName: debouncedSearchKeyword,
          operator: debouncedOperatorSearch,
          timeRange: selectedTimeRange,
          startDate: dateRange.start,
          endDate: dateRange.end
        });
        // 丢弃已过期请求的结果，避免慢的旧响应覆盖新的筛选结果
        if (cancelled || seq !== requestSeqRef.current) return;
        setItems(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (e) {
        if (cancelled || seq !== requestSeqRef.current) return;
        console.error('加载审计日志失败:', e);
        setError(`数据加载失败: ${e.message}`);
        setItems([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        if (!cancelled && seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    currentPage,
    refreshKey,
    selectedActionType,
    debouncedSearchKeyword,
    debouncedOperatorSearch,
    selectedTimeRange,
    dateRange.start,
    dateRange.end
  ]);

  // 导出当前筛选结果（服务端全量筛选后导出，不局限于当前页）
  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const allLogs = await auditLogService.getAllAuditLogs({
        actionType: selectedActionType,
        productName: debouncedSearchKeyword,
        operator: debouncedOperatorSearch,
        timeRange: selectedTimeRange,
        startDate: dateRange.start,
        endDate: dateRange.end
      });

      if (allLogs.length === 0) {
        alert('没有可导出的数据，请先调整筛选条件或等待数据加载。');
        return;
      }

      const exportData = allLogs.map((log) => {
        const actionConfig = getActionConfig(log.actionType);
        const displayTime = formatAuditTime(log.timestamp, 'compact');
        const displayOperator = getDisplayOperator(log.operator);
        const summaryText = generateAuditSummary(log, true);

        return {
          time: displayTime,
          actionType: actionConfig.label,
          productName: log.productName || '',
          operator: displayOperator,
          summary: summaryText
        };
      });

      exportAuditLogsToCSV(exportData, 'audit-log-export');
    } catch (e) {
      console.error('导出审计日志失败:', e);
      setExportError(`导出失败: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  const activeFilters = { searchKeyword, selectedActionType, selectedTimeRange, dateRange, operatorSearch };
  const hasFilters = hasActiveFilters(activeFilters);

  // 分页区间展示（基于服务端当前页 items）
  const startIndex = total > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const endIndex = startIndex > 0 ? startIndex + items.length - 1 : 0;

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">操作日志</h1>
        <p className="text-slate-600 mt-1">
          系统操作记录列表，按时间倒序排列。用于操作追溯与日常核对。
        </p>
      </div>

      {/* 操作栏：刷新 + 导出按钮 */}
      <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-start md:justify-end gap-4">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`px-4 py-2 border rounded-md transition-colors font-medium ${
              loading
                ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            刷新
          </button>
          <button
            onClick={handleExport}
            disabled={!canWrite || exporting || total === 0}
            title={!canWrite ? adminOnlyTitle : ''}
            className={`px-4 py-2 border rounded-md transition-colors font-medium ${
              !canWrite || exporting || total === 0
                ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {exporting ? '导出中...' : '导出 CSV'}
          </button>
        </div>
        {exportError && (
          <div className="mt-2 text-sm text-rose-600">{exportError}</div>
        )}
      </div>

      {/* 筛选工具栏 */}
      <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 产品名称搜索框 */}
            <div>
              <label htmlFor="product-search" className="block text-sm font-medium text-slate-700 mb-1.5">
                产品名称
              </label>
              <input
                id="product-search"
                type="text"
                placeholder="输入产品名称关键词..."
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>

            {/* 操作类型筛选下拉框 */}
            <div>
              <label htmlFor="action-type-filter" className="block text-sm font-medium text-slate-700 mb-1.5">
                操作类型
              </label>
              <select
                id="action-type-filter"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                value={selectedActionType}
                onChange={(e) => setSelectedActionType(e.target.value)}
              >
                <option value="">全部操作</option>
                {Object.entries(actionTypeMap).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 操作人搜索框 */}
            <div>
              <label htmlFor="operator-search" className="block text-sm font-medium text-slate-700 mb-1.5">
                操作人
              </label>
              <input
                id="operator-search"
                type="text"
                placeholder="输入操作人关键词..."
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                value={operatorSearch}
                onChange={(e) => setOperatorSearch(e.target.value)}
              />
            </div>

            {/* 清空筛选按钮（仅在存在筛选条件时显示） */}
            <div className="flex items-end">
              {hasFilters && (
                <button
                  type="button"
                  className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors w-full"
                  onClick={clearFilters}
                >
                  清空筛选
                </button>
              )}
            </div>
          </div>

          {/* 第二行：快捷时间范围 + 自定义日期范围 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 快捷时间范围筛选 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                快捷时间范围
              </label>
              <div className="flex flex-wrap gap-1">
                {[
                  { value: 'all', label: '全部' },
                  { value: 'today', label: '今日' },
                  { value: 'week', label: '近7天' },
                  { value: 'month', label: '近30天' }
                ].map((range) => (
                  <button
                    key={range.value}
                    type="button"
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      selectedTimeRange === range.value
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                    onClick={() => setSelectedTimeRange(range.value)}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 自定义开始日期 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                开始日期
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => handleDateChange('start', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
              />
            </div>

            {/* 自定义结束日期 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                结束日期
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => handleDateChange('end', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
              />
            </div>

            {/* 占位列，保持布局平衡 */}
            <div></div>
          </div>
        </div>
      </div>

      {/* 日志列表卡片 */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">操作日志</h2>
          <p className="text-sm text-slate-500 mt-1">
            筛选结果：{total} 条
          </p>
        </div>

        <div className="p-4">
          {loading ? (
            // 加载状态
            <div className="py-12 text-center">
              <div className="flex justify-center mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
              </div>
              <div className="text-slate-600">正在加载审计日志...</div>
            </div>
          ) : error ? (
            // 错误状态
            <div className="py-12 text-center">
              <div className="text-slate-600 mb-2">数据加载异常</div>
              <div className="text-sm text-slate-600 max-w-md mx-auto mb-4">{error}</div>
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors"
                onClick={handleRefresh}
              >
                重试
              </button>
            </div>
          ) : total === 0 && !hasFilters ? (
            // 系统暂无日志
            <div className="py-12 text-center">
              <div className="text-slate-500 mb-2">暂无数据</div>
              <div className="text-sm text-slate-500 max-w-md mx-auto">
                执行新增产品、编辑产品、出入库等操作后，这里会显示详细的操作日志记录。
              </div>
            </div>
          ) : total === 0 && hasFilters ? (
            // 筛选无结果
            <div className="py-12 text-center">
              <div className="text-slate-500 mb-2">未找到匹配的记录</div>
              <div className="text-sm text-slate-500 max-w-md mx-auto mb-4">
                当前筛选条件下未找到匹配的操作日志。请尝试：
              </div>
              <div className="text-sm text-slate-600 max-w-md mx-auto space-y-1">
                <p>• 调整产品名称关键词</p>
                <p>• 调整操作人关键词</p>
                <p>• 选择不同的操作类型</p>
                <p>• 调整快捷时间范围或自定义日期</p>
                <p>• 清空筛选条件以查看全部记录</p>
              </div>
              <button
                type="button"
                className="mt-6 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors"
                onClick={clearFilters}
              >
                清空筛选
              </button>
            </div>
          ) : (<>
            <div className="hidden md:block">
              {/* 桌面端表格视图 (md及以上) */}
              {/* 表头行 */}
              <div className="grid grid-cols-12 gap-4 mb-4 pb-3 border-b border-slate-200">
                <div className="col-span-1 text-sm font-medium text-slate-700">时间</div>
                <div className="col-span-2 text-sm font-medium text-slate-700">操作类型</div>
                <div className="col-span-3 text-sm font-medium text-slate-700">产品</div>
                <div className="col-span-1 text-sm font-medium text-slate-700">操作人</div>
                <div className="col-span-5 text-sm font-medium text-slate-700">摘要</div>
              </div>

              {/* 日志行列表 */}
              <div className="space-y-3">
                {items.map((log) => {
                  const actionConfig = getActionConfig(log.actionType);
                  const displayTime = formatAuditTime(log.timestamp, 'compact');
                  const displayOperator = getDisplayOperator(log.operator);
                  const summaryText = generateAuditSummary(log, true);

                  return (
                    <div
                      key={log.id}
                      className="grid grid-cols-12 gap-4 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      {/* 时间列 */}
                      <div className="col-span-1">
                        <div className="text-sm font-medium text-slate-800 whitespace-nowrap">
                          {displayTime}
                        </div>
                      </div>

                      {/* 操作类型列 */}
                      <div className="col-span-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${actionConfig.color}`}
                          title={log.actionType}>
                          {actionConfig.label}
                        </span>
                      </div>

                      {/* 产品列 */}
                      <div className="col-span-3">
                        <div className="text-sm text-slate-800 truncate"
                          title={log.productName || undefined}>
                          {['RESTORE_PREPARE', 'SYSTEM_RESET'].includes(log.actionType) ? '-' : (log.productName || '-')}
                        </div>
                      </div>

                      {/* 操作人列 */}
                      <div className="col-span-1">
                        <div className="text-sm text-slate-800 whitespace-nowrap">
                          {displayOperator}
                        </div>
                      </div>

                      {/* 摘要列 */}
                      <div className="col-span-5">
                        <div className="text-sm text-slate-600 break-words">
                          {summaryText}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="block md:hidden space-y-3">
              {/* 移动端卡片视图 (md以下) */}
              {items.map((log) => {
                const actionConfig = getActionConfig(log.actionType);
                const displayTime = formatAuditTime(log.timestamp, 'compact');
                const displayOperator = getDisplayOperator(log.operator);
                const summaryText = generateAuditSummary(log, true);

                return (
                  <div
                    key={log.id}
                    className="bg-white border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors"
                  >
                    {/* 卡片顶部：时间和操作类型 */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="text-sm font-medium text-slate-800">
                        {displayTime}
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${actionConfig.color}`}>
                        {actionConfig.label}
                      </span>
                    </div>

                    {/* 卡片内容：产品、操作人、摘要 */}
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-slate-700 w-16">产品：</div>
                        <div className="text-sm text-slate-800 flex-1 truncate">
                          {log.productName || '-'}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-slate-700 w-16">操作人：</div>
                        <div className="text-sm text-slate-800 flex-1">
                          {displayOperator}
                        </div>
                      </div>
                      <div className="flex items-start">
                        <div className="text-sm font-medium text-slate-700 w-16">摘要：</div>
                        <div className="text-sm text-slate-600 flex-1">
                          {summaryText}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 分页控制 */}
            {total > 0 && (
              <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-4 md:gap-0">
                <div className="w-full md:w-auto text-sm text-slate-600 text-center md:text-left">
                  显示第 {startIndex} - {endIndex} 条，共 {total} 条记录
                </div>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>)}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：操作日志用于记录和追溯系统中的关键操作。出问题时优先查看操作日志，确认最近有哪些人做了什么操作。
        </div>
      </div>
    </div>
  );
}

export default AuditLog;
