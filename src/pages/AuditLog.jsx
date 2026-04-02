import { useState, useEffect, useMemo } from 'react';
import { getAuditLogs } from '../services/productService';
import {
  formatAuditTime,
  generateAuditSummary,
  getDisplayOperator,
  getActionConfig,
  actionTypeMap
} from '../utils/auditLogHelpers';

function AuditLog() {
  // 审计日志数据状态
  const [auditLogs, setAuditLogs] = useState([]);
  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedActionType, setSelectedActionType] = useState('');

  // 加载审计日志数据
  useEffect(() => {
    const logs = getAuditLogs(); // 已按时间倒序排列
    setAuditLogs(logs);
  }, []);

  // 筛选后的日志
  const filteredLogs = useMemo(() => {
    let filtered = [...auditLogs];

    // 1. 按操作类型筛选
    if (selectedActionType) {
      filtered = filtered.filter(log => log.actionType === selectedActionType);
    }

    // 2. 按产品名称关键词搜索（仅匹配 productName 字段）
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      filtered = filtered.filter(log =>
        log.productName && log.productName.toLowerCase().includes(keyword)
      );
    }

    return filtered;
  }, [auditLogs, searchKeyword, selectedActionType]);

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">操作日志</h1>
        <p className="text-slate-600 mt-1">
          系统所有操作记录的完整列表
        </p>
      </div>

      {/* 筛选工具栏 */}
      <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 产品名称搜索框 */}
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="product-search" className="block text-sm font-medium text-slate-700 mb-1">
              产品名称
            </label>
            <input
              id="product-search"
              type="text"
              placeholder="输入产品名称关键词..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          {/* 操作类型筛选下拉框 */}
          <div className="min-w-[180px]">
            <label htmlFor="action-type-filter" className="block text-sm font-medium text-slate-700 mb-1">
              操作类型
            </label>
            <select
              id="action-type-filter"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

          {/* 清空筛选按钮（仅在存在筛选条件时显示） */}
          {(searchKeyword || selectedActionType) && (
            <div className="self-end">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                onClick={() => {
                  setSearchKeyword('');
                  setSelectedActionType('');
                }}
              >
                清空筛选
              </button>
            </div>
          )}
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

        <div className="p-6">
          {auditLogs.length === 0 ? (
            // 系统暂无日志
            <div className="py-12 text-center">
              <div className="text-slate-500 mb-2">暂无操作记录</div>
              <div className="text-sm text-slate-500 max-w-md mx-auto">
                执行新增产品、编辑产品、出入库等操作后，这里会显示详细的操作日志记录。
              </div>
            </div>
          ) : filteredLogs.length === 0 ? (
            // 筛选无结果
            <div className="py-12 text-center">
              <div className="text-slate-500 mb-2">未找到匹配的日志记录</div>
              <div className="text-sm text-slate-500 max-w-md mx-auto mb-4">
                当前筛选条件下未找到匹配的操作日志。请尝试：
              </div>
              <div className="text-sm text-slate-600 max-w-md mx-auto space-y-1">
                <p>• 调整产品名称关键词</p>
                <p>• 选择不同的操作类型</p>
                <p>• 清空筛选条件以查看全部记录</p>
              </div>
              {(searchKeyword || selectedActionType) && (
                <button
                  type="button"
                  className="mt-6 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                  onClick={() => {
                    setSearchKeyword('');
                    setSelectedActionType('');
                  }}
                >
                  清空筛选
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 表头行 */}
              <div className="grid grid-cols-12 gap-4 mb-4 pb-3 border-b border-slate-200">
                <div className="col-span-2 text-sm font-medium text-slate-700">时间</div>
                <div className="col-span-2 text-sm font-medium text-slate-700">操作类型</div>
                <div className="col-span-2 text-sm font-medium text-slate-700">产品</div>
                <div className="col-span-2 text-sm font-medium text-slate-700">操作人</div>
                <div className="col-span-4 text-sm font-medium text-slate-700">摘要</div>
              </div>

              {/* 日志行列表 */}
              <div className="space-y-4">
                {filteredLogs.map((log) => {
                  const actionConfig = getActionConfig(log.actionType);
                  const displayTime = formatAuditTime(log.timestamp, 'full');
                  const displayOperator = getDisplayOperator(log.operator);
                  const summaryText = generateAuditSummary(log);

                  return (
                    <div
                      key={log.id}
                      className="grid grid-cols-12 gap-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      {/* 时间列 */}
                      <div className="col-span-2">
                        <div className="text-sm font-medium text-slate-800">
                          {displayTime}
                        </div>
                      </div>

                      {/* 操作类型列 */}
                      <div className="col-span-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${actionConfig.color}`}>
                          {actionConfig.label}
                        </span>
                      </div>

                      {/* 产品列 */}
                      <div className="col-span-2">
                        <div className="text-sm text-slate-800 truncate">
                          {log.productName || '-'}
                        </div>
                      </div>

                      {/* 操作人列 */}
                      <div className="col-span-2">
                        <div className="text-sm text-slate-800">
                          {displayOperator}
                        </div>
                      </div>

                      {/* 摘要列 */}
                      <div className="col-span-4">
                        <div className="text-sm text-slate-600">
                          {summaryText}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
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