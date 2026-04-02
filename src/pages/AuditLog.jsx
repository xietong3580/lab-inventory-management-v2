import { useState, useEffect } from 'react';
import { getAuditLogs } from '../services/productService';
import {
  formatAuditTime,
  generateAuditSummary,
  getDisplayOperator,
  getActionConfig
} from '../utils/auditLogHelpers';

function AuditLog() {
  // 审计日志数据状态
  const [auditLogs, setAuditLogs] = useState([]);

  // 加载审计日志数据
  useEffect(() => {
    const logs = getAuditLogs(); // 已按时间倒序排列
    setAuditLogs(logs);
  }, []);

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">操作日志</h1>
        <p className="text-slate-600 mt-1">
          系统所有操作记录的完整列表
        </p>
      </div>

      {/* 日志列表卡片 */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">操作日志</h2>
          <p className="text-sm text-slate-500 mt-1">
            共 {auditLogs.length} 条记录
          </p>
        </div>

        <div className="p-6">
          {auditLogs.length > 0 ? (
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
                {auditLogs.map((log) => {
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
          ) : (
            // 空状态提示
            <div className="py-12 text-center">
              <div className="text-slate-400 mb-2">暂无操作记录</div>
              <div className="text-sm text-slate-500 max-w-md mx-auto">
                执行新增产品、编辑产品、出入库等操作后，这里会显示详细的操作日志记录。
              </div>
            </div>
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