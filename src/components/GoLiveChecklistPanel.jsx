import { useState, useEffect } from 'react';
import { getGoLiveChecklist } from '../services/backupService';
import { formatBytes } from '../services/backupService';

export default function GoLiveChecklistPanel({ canWrite }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await getGoLiveChecklist();
        setData(result);
      } catch (err) {
        setError(err.message || '加载检查数据失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── 折叠卡头部 ──
  const HeaderBar = () => (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors text-left"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-800">管理员维护检查</h2>
        <p className="text-sm text-slate-500 mt-1">
          用于重要操作前检查数据和备份状态。点击展开查看详情。
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {data && (
          <span className={`w-2.5 h-2.5 rounded-full ${
            data.overall_level === 'ok' ? 'bg-emerald-500' : data.overall_level === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
          }`} title={
            data.overall_level === 'ok' ? '状态正常' : data.overall_level === 'warning' ? '需要关注' : '存在异常'
          }></span>
        )}
        <span className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </div>
    </button>
  );

  // ── 加载中 ──
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg">
        <HeaderBar />
        {expanded && (
          <div className="px-6 pb-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600 mr-3"></div>
              <span className="text-slate-500">正在加载管理员维护检查...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 加载错误 ──
  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg">
        <HeaderBar />
        {expanded && (
          <div className="px-6 pb-6">
            <div className="p-3 rounded-md border bg-rose-50 border-rose-200 text-sm text-rose-700">
              {error}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!data) return null;

  const { database_status: db, backup_status: bk, entry_readiness: entry, recommended_steps: steps, warnings, overall_level, overall_message } = data;

  const riskItems = [
    '不要在未创建备份时清空数据，操作不可逆',
    '不要把未知采购价、售价填为 0，未知时应留空',
    '不要把旧系统历史出入库记录直接混入新系统正式出入库',
    '不要在未核对库存数量前开始正式出入库操作',
    '不要直接手工修改数据库文件，应通过系统功能操作',
    '不要提交数据库文件或备份文件到代码仓库',
    '出问题时先查看备份预检、恢复准备和审计日志，不要盲目修改数据',
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <HeaderBar />

      {expanded && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 space-y-5 border-t border-slate-100">
          {/* 整体评估 */}
          <div className="pt-4">
            <div className={`p-3 rounded-md border text-sm ${
              overall_level === 'ok'
                ? 'bg-emerald-50 border-emerald-200'
                : overall_level === 'warning'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-rose-50 border-rose-200'
            }`}>
              <div className={`font-medium mb-1 ${
                overall_level === 'ok' ? 'text-emerald-800' : overall_level === 'warning' ? 'text-amber-800' : 'text-rose-800'
              }`}>
                {overall_level === 'ok' ? '✅ 状态正常' : overall_level === 'warning' ? '⚠️ 需要关注' : '❌ 存在异常'}
              </div>
              <div className={`${overall_level === 'ok' ? 'text-emerald-700' : overall_level === 'warning' ? 'text-amber-700' : 'text-rose-700'}`}>
                {overall_message}
              </div>
            </div>
          </div>

          {/* 当前数据概览 */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">当前数据概览</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: '产品', value: db.products_count },
                { label: '出入库记录', value: db.transactions_count },
                { label: '审计日志', value: db.audit_logs_count },
                { label: '用户', value: db.users_count },
                { label: '低库存', value: db.low_stock_count, warn: db.low_stock_count > 0 },
                { label: '负库存', value: db.negative_stock_count, error: db.negative_stock_count > 0 },
                { label: '缺失 SKU', value: db.missing_sku_count, warn: db.missing_sku_count > 0 },
                { label: '同货号多库存条目', value: db.duplicate_sku_count, info: db.duplicate_sku_count > 0 },
              ].map(item => (
                <div key={item.label} className={`p-2.5 rounded border ${
                  item.error ? 'bg-rose-50 border-rose-200' : item.warn ? 'bg-amber-50 border-amber-200' : item.info ? 'bg-slate-50 border-slate-200' : 'bg-slate-50 border-slate-200'
                }`} title={
                  item.info && item.label === '同货号多库存条目'
                    ? '同一货号可在不同库位、库存分类、来源或规格下并存，属于正常业务现象'
                    : undefined
                }>
                  <div className="text-xs text-slate-500">{item.label}</div>
                  <div className={`text-lg font-semibold ${
                    item.error ? 'text-rose-700' : item.warn ? 'text-amber-700' : item.info ? 'text-slate-600' : 'text-slate-800'
                  }`}>{item.value}</div>
                  {item.info && item.value > 0 && (
                    <div className="text-[10px] text-slate-400 mt-0.5">允许</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 备份状态 */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">备份状态</div>
            {!bk.has_available_backup ? (
              <div className="p-3 rounded-md border bg-amber-50 border-amber-200 text-sm text-amber-700">
                尚未检测到可用备份，重要操作前请先创建数据库备份。
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div className="p-2 rounded border bg-slate-50 border-slate-200">
                  <div className="text-xs text-slate-500">最新备份</div>
                  <div className="text-sm font-mono text-slate-800 truncate" title={bk.latest_backup_filename}>
                    {bk.latest_backup_filename || '—'}
                  </div>
                </div>
                <div className="p-2 rounded border bg-slate-50 border-slate-200">
                  <div className="text-xs text-slate-500">最新备份时间</div>
                  <div className="text-sm text-slate-800">
                    {bk.latest_backup_time ? new Date(bk.latest_backup_time).toLocaleString('zh-CN') : '—'}
                  </div>
                </div>
                <div className="p-2 rounded border bg-slate-50 border-slate-200">
                  <div className="text-xs text-slate-500">最新备份大小</div>
                  <div className="text-sm text-slate-800">{bk.latest_backup_size_bytes > 0 ? formatBytes(bk.latest_backup_size_bytes) : '—'}</div>
                </div>
                <div className="p-2 rounded border bg-slate-50 border-slate-200">
                  <div className="text-xs text-slate-500">备份总数</div>
                  <div className="text-sm font-semibold text-slate-800">{bk.backup_files_count}</div>
                </div>
                <div className="p-2 rounded border bg-slate-50 border-slate-200">
                  <div className="text-xs text-slate-500">可用备份</div>
                  <div className={`text-sm font-semibold ${bk.has_available_backup ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {bk.has_available_backup ? '有' : '无'}
                  </div>
                </div>
                <div className="p-2 rounded border bg-slate-50 border-slate-200">
                  <div className="text-xs text-slate-500">恢复前安全网</div>
                  <div className={`text-sm font-semibold ${bk.has_pre_restore_backup ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {bk.has_pre_restore_backup ? '有' : '无'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 维护操作推荐流程 */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">维护操作推荐流程</div>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-600 text-white text-xs font-semibold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-700">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 注意事项 */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">注意事项</div>
            <div className="p-3 rounded-md border bg-amber-50 border-amber-200">
              <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                {riskItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 当前存在业务数据的提醒 */}
          {entry.data_may_be_test_data && (
            <div className="p-3 rounded-md border bg-blue-50 border-blue-200 text-sm text-blue-700">
              当前系统存在 {entry.current_products_count} 个产品和 {entry.current_transactions_count} 条出入库记录。如当前数据并非正式数据，请先完成备份，再按受控清空流程处理。
            </div>
          )}

          {/* 只读说明 */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500 text-center">
            本模块只做检查和提醒，不会执行清空、导入、备份或恢复。
          </div>
        </div>
      )}
    </div>
  );
}
