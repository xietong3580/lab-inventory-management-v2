import { useState, useEffect, useMemo } from 'react';
import { getAuditLogs } from '../services/productService';
import {
  formatAuditTime,
  generateAuditSummary,
  getDisplayOperator,
  getActionConfig,
  actionTypeMap
} from '../utils/auditLogHelpers';
import { filterAuditLogs, hasActiveFilters } from '../utils/auditLogFilterHelpers';
import { exportAuditLogsToCSV } from '../utils/exportHelpers';

function AuditLog() {
  // 审计日志数据状态
  const [auditLogs, setAuditLogs] = useState([]);
  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedActionType, setSelectedActionType] = useState('');
  const [selectedTimeRange, setSelectedTimeRange] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [operatorSearch, setOperatorSearch] = useState('');
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 处理日期范围变化
  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  // 导出当前筛选结果为 CSV
  const handleExport = () => {
    if (filteredLogs.length === 0) {
      alert('没有可导出的数据，请先调整筛选条件或等待数据加载。');
      return;
    }

    // 准备导出数据
    const exportData = filteredLogs.map(log => {
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
  };

  // 加载审计日志数据
  useEffect(() => {
    const logs = getAuditLogs(); // 已按时间倒序排列
    setAuditLogs(logs);
  }, []);

  // 筛选后的日志
  const filteredLogs = useMemo(() => {
    return filterAuditLogs(
      auditLogs,
      selectedTimeRange,
      dateRange,
      selectedActionType,
      searchKeyword,
      operatorSearch
    );
  }, [auditLogs, selectedTimeRange, dateRange, selectedActionType, searchKeyword, operatorSearch]);

  // 当筛选条件变化时重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, selectedActionType, selectedTimeRange, dateRange, operatorSearch]);

  // 分页计算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedLogs = filteredLogs.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">操作日志</h1>
        <p className="text-slate-600 mt-1">
          系统所有操作记录的完整列表
        </p>
      </div>

      {/* 操作栏：导出按钮 */}
      <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-start md:justify-end gap-4">
          <button
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className={`px-4 py-2 border rounded-md transition-colors font-medium ${
              filteredLogs.length === 0
                ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            导出 CSV
          </button>
        </div>
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
              {hasActiveFilters({ searchKeyword, selectedActionType, selectedTimeRange, dateRange, operatorSearch }) && (
                <button
                  type="button"
                  className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors w-full"
                  onClick={() => {
                    setSearchKeyword('');
                    setSelectedActionType('');
                    setSelectedTimeRange('all');
                    setDateRange({ start: '', end: '' });
                    setOperatorSearch('');
                  }}
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
            筛选结果：{filteredLogs.length} 条{filteredLogs.length !== auditLogs.length && `（共 ${auditLogs.length} 条）`}
          </p>
        </div>

        <div className="p-4">
          {auditLogs.length === 0 ? (
            // 系统暂无日志
            <div className="py-12 text-center">
              <div className="text-slate-500 mb-2">暂无数据</div>
              <div className="text-sm text-slate-500 max-w-md mx-auto">
                执行新增产品、编辑产品、出入库等操作后，这里会显示详细的操作日志记录。
              </div>
            </div>
          ) : filteredLogs.length === 0 ? (
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
              {hasActiveFilters({ searchKeyword, selectedActionType, selectedTimeRange, dateRange, operatorSearch }) && (
                <button
                  type="button"
                  className="mt-6 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors"
                  onClick={() => {
                    setSearchKeyword('');
                    setSelectedActionType('');
                    setSelectedTimeRange('all');
                    setDateRange({ start: '', end: '' });
                    setOperatorSearch('');
                  }}
                >
                  清空筛选
                </button>
              )}
            </div>
          ) : (<>
            <div className="hidden md:block">
              {/* 桌面端表格视图 (md及以上) */}
              {/* 表头行 */}
              <div className="grid grid-cols-12 gap-4 mb-4 pb-3 border-b border-slate-200">
                <div className="col-span-1 text-sm font-medium text-slate-700">时间</div>
                <div className="col-span-1 text-sm font-medium text-slate-700">操作类型</div>
                <div className="col-span-3 text-sm font-medium text-slate-700">产品</div>
                <div className="col-span-1 text-sm font-medium text-slate-700">操作人</div>
                <div className="col-span-6 text-sm font-medium text-slate-700">摘要</div>
              </div>

              {/* 日志行列表 */}
              <div className="space-y-3">
                {displayedLogs.map((log) => {
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
                        <div className="text-sm font-medium text-slate-800">
                          {displayTime}
                        </div>
                      </div>

                      {/* 操作类型列 */}
                      <div className="col-span-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${actionConfig.color}`}>
                          {actionConfig.label}
                        </span>
                      </div>

                      {/* 产品列 */}
                      <div className="col-span-3">
                        <div className="text-sm text-slate-800 truncate">
                          {log.productName || '-'}
                        </div>
                      </div>

                      {/* 操作人列 */}
                      <div className="col-span-1">
                        <div className="text-sm text-slate-800">
                          {displayOperator}
                        </div>
                      </div>

                      {/* 摘要列 */}
                      <div className="col-span-6">
                        <div className="text-sm text-slate-600">
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
              {displayedLogs.map((log) => {
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
            {filteredLogs.length > 0 && (
              <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-4 md:gap-0">
                <div className="w-full md:w-auto text-sm text-slate-600 text-center md:text-left">
                  显示第 {startIndex + 1} - {Math.min(endIndex, filteredLogs.length)} 条，共 {filteredLogs.length} 条记录
                </div>
                <div className="w-full md:w-auto flex justify-center flex-wrap items-center gap-2 whitespace-nowrap">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      currentPage === 1
                        ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    上一页
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1.5 rounded border text-sm ${
                            currentPage === pageNum
                              ? 'bg-slate-700 text-white'
                              : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    {totalPages > 5 && (
                      <>
                        <span className="text-slate-400">...</span>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className={`px-3 py-1.5 rounded border text-sm ${
                            currentPage === totalPages
                              ? 'bg-slate-700 text-white'
                              : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      currentPage === totalPages
                        ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>)}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：此页面展示系统所有操作记录，按时间倒序排列。
        </div>
      </div>
    </div>
  );
}

export default AuditLog;