import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import {
  previewProductImport,
  executeProductImport,
  validateImportFile,
  formatFileSize,
} from '../services/importService';

/**
 * 行状态标签组件
 */
function RowStatusBadge({ status }) {
  const config = {
    valid: { text: '通过', bg: 'bg-emerald-50', textColor: 'text-emerald-700', border: 'border-emerald-200' },
    error: { text: '错误', bg: 'bg-rose-50', textColor: 'text-rose-700', border: 'border-rose-200' },
    warning: { text: '警告', bg: 'bg-amber-50', textColor: 'text-amber-700', border: 'border-amber-200' },
  };
  const { text, bg, textColor, border } = config[status] || config.valid;

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${bg} ${textColor} ${border}`}>
      {text}
    </span>
  );
}

/**
 * 库存口径上下文展示组件
 * 显示 inventory_context 中所有有值的字段
 */
const INVENTORY_CONTEXT_FIELDS = [
  { key: 'remote_stock', label: '异地库存' },
  { key: 'virtual_stock', label: '虚拟库存' },
  { key: 'available_stock', label: '可售库存' },
  { key: 'total_stock', label: '总库存' },
  { key: 'stock_note', label: '库存说明' },
  { key: 'stock_source', label: '库存来源' },
  { key: 'stock_type', label: '库存类型' },
  { key: 'stock_location', label: '库存地点' },
];

function InventoryContextCell({ context }) {
  if (!context || typeof context !== 'object') {
    return <span className="text-xs text-slate-400">-</span>;
  }

  const entries = INVENTORY_CONTEXT_FIELDS
    .map(({ key, label }) => {
      const val = context[key];
      if (val === undefined || val === null || val === '') return null;
      return { key, label, value: String(val) };
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return <span className="text-xs text-slate-400">-</span>;
  }

  return (
    <div className="space-y-0.5">
      {entries.map(({ key, label, value }) => (
        <div key={key} className="text-xs" title={`${label}: ${value}`}>
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-800 ml-1">{value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 判断 warning 文本是否包含库存口径相关关键词
 */
const STOCK_CALIBER_KEYWORDS = [
  '库存口径', '异地', '虚拟', '总可售', '本地真实库存', 'current_stock',
  '库存字段', '库存来源', '库存说明', '库存类型', '库存地点',
  '不保存该字段', '不能自动', '暂不保存', '仅供预览',
];

function hasStockCaliberKeyword(text) {
  return STOCK_CALIBER_KEYWORDS.some((kw) => text.includes(kw));
}

function ProductImportPreview() {
  const { canWrite, adminOnlyTitle } = usePermission();
  const navigate = useNavigate();

  // 文件相关状态
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // 预览结果状态
  const [previewResult, setPreviewResult] = useState(null);
  const [apiError, setApiError] = useState('');

  // 正式导入相关状态
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState(null);
  const [executeError, setExecuteError] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const fileInputRef = useRef(null);
  const executeResultRef = useRef(null);

  // Step 10-28D: 导入完成后自动滚动到结果区域
  useEffect(() => {
    if (executeResult && executeResultRef.current) {
      // 短暂延迟确保 DOM 已渲染
      setTimeout(() => {
        executeResultRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    }
  }, [executeResult]);

  /**
   * 处理文件选择
   */
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    setApiError('');
    setPreviewResult(null);
    setExecuteResult(null);
    setExecuteError('');

    if (!file) {
      setSelectedFile(null);
      setFileError('');
      return;
    }

    const { valid, error } = validateImportFile(file);
    if (!valid) {
      setSelectedFile(null);
      setFileError(error);
      return;
    }

    setSelectedFile(file);
    setFileError('');
  };

  /**
   * 处理上传预览
   */
  const handleUploadPreview = async () => {
    if (!selectedFile) {
      setFileError('请先选择 CSV 文件');
      return;
    }

    setIsUploading(true);
    setApiError('');
    setPreviewResult(null);

    try {
      const result = await previewProductImport(selectedFile);
      setPreviewResult(result);
    } catch (err) {
      setApiError(err.message || '导入预览请求失败');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 重置文件选择
   */
  const handleClearFile = () => {
    setSelectedFile(null);
    setFileError('');
    setApiError('');
    setPreviewResult(null);
    setExecuteResult(null);
    setExecuteError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * 打开正式导入确认弹窗
   */
  const handleOpenConfirmDialog = () => {
    setConfirmChecked(false);
    setShowConfirmDialog(true);
  };

  /**
   * 关闭正式导入确认弹窗
   */
  const handleCloseConfirmDialog = () => {
    setShowConfirmDialog(false);
    setConfirmChecked(false);
  };

  /**
   * 执行正式导入
   */
  const handleExecuteImport = async () => {
    if (!selectedFile) return;

    setShowConfirmDialog(false);
    setConfirmChecked(false);
    setIsExecuting(true);
    setExecuteError('');
    setExecuteResult(null);

    try {
      const result = await executeProductImport(selectedFile, {
        mode: 'create_only',
        confirmBackup: true,
      });
      setExecuteResult(result);
    } catch (err) {
      setExecuteError(err.message || '正式导入请求失败，请检查后端服务');
    } finally {
      setIsExecuting(false);
    }
  };

  // ── 从 previewResult（顶层字段）提取数据 ──────────────────
  const stats = previewResult && previewResult.total_rows !== undefined
    ? {
        total: previewResult.total_rows ?? 0,
        valid: previewResult.valid_rows ?? 0,
        error: previewResult.error_rows ?? 0,
        warning: previewResult.warning_rows ?? 0,
        canImport: previewResult.can_import ?? false,
      }
    : null;

  const columns = previewResult?.columns ?? null;
  const fields = columns
    ? {
        p0: Array.isArray(columns.recognized_p0) ? columns.recognized_p0 : [],
        p1: Array.isArray(columns.recognized_p1) ? columns.recognized_p1 : [],
        p2: Array.isArray(columns.recognized_p2) ? columns.recognized_p2 : [],
        stockContext: Array.isArray(columns.recognized_stock_context) ? columns.recognized_stock_context : [],
        ignored: Array.isArray(columns.ignored) ? columns.ignored : [],
        missingRequired: Array.isArray(columns.missing_required) ? columns.missing_required : [],
      }
    : null;

  const rows = Array.isArray(previewResult?.rows) ? previewResult.rows : [];
  const globalErrors = Array.isArray(previewResult?.errors) ? previewResult.errors : [];
  const globalWarnings = Array.isArray(previewResult?.warnings) ? previewResult.warnings : [];

  // 旧系统无货号产品计数（Step 10-6C-fix）
  const legacyNoCodeCount = useMemo(
    () => rows.filter((r) => r.suggested_sku != null).length,
    [rows],
  );

  // 库存口径相关 warning 过滤
  const stockCaliberWarnings = useMemo(
    () => globalWarnings.filter(hasStockCaliberKeyword),
    [globalWarnings],
  );
  const otherGlobalWarnings = useMemo(
    () => globalWarnings.filter((w) => !hasStockCaliberKeyword(w)),
    [globalWarnings],
  );

  // ── 正式导入按钮启用条件判断（必须在 stats 之后） ──────────
  const canExecute = useMemo(() => {
    if (!canWrite) return false;
    if (!selectedFile) return false;
    if (!previewResult) return false;
    if (!stats?.canImport) return false;
    if (isUploading) return false;
    if (isExecuting) return false;
    return true;
  }, [canWrite, selectedFile, previewResult, stats?.canImport, isUploading, isExecuting]);

  /**
   * 正式导入按钮禁用原因
   */
  const executeDisabledReason = useMemo(() => {
    if (!canWrite) return '仅管理员可执行正式导入';
    if (!selectedFile) return '请先选择 CSV 文件';
    if (!previewResult) return '请先完成 CSV 预览';
    if (stats && !stats.canImport) return '预览存在阻断错误，不能执行正式导入';
    if (isUploading) return '预览解析中...';
    if (isExecuting) return '导入中...';
    return '';
  }, [canWrite, selectedFile, previewResult, stats, isUploading, isExecuting]);

  // 检查任一行是否有 inventory_context 非空
  const hasInventoryContext = useMemo(
    () => rows.some(
      (r) => r.inventory_context && typeof r.inventory_context === 'object'
        && Object.keys(r.inventory_context).some(
          (k) => r.inventory_context[k] !== null && r.inventory_context[k] !== ''
        ),
    ),
    [rows],
  );

  return (
    <div className="p-4 md:p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">产品数据导入预览</h1>
        <p className="text-slate-600 mt-1">
          上传 CSV 文件进行解析和字段校验，预览导入结果。本轮仅预览，不执行任何数据库写入。
        </p>
      </div>

      {/* Step 10-28D: 导入成功后顶部显著成功横幅 */}
      {executeResult && executeResult.success && !isExecuting && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl text-emerald-500 mt-0.5 shrink-0">✓</span>
            <div className="flex-1">
              <div className="text-lg font-semibold text-emerald-800">导入成功</div>
              <div className="text-sm text-emerald-700 mt-1">
                新增 <strong>{executeResult.created_count ?? 0}</strong> 个产品，
                跳过 <strong>{executeResult.skipped_count ?? 0}</strong> 条，
                错误 <strong>{executeResult.error_count ?? 0}</strong> 条
                {executeResult.batch_id && (
                  <span className="ml-2 text-emerald-600">
                    · 批次 <span className="font-mono">{executeResult.batch_id}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => navigate('/products')}
                  className="px-4 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 transition-colors"
                >
                  去产品管理查看
                </button>
                <button
                  type="button"
                  onClick={() => {
                    executeResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="px-4 py-1.5 border border-emerald-300 text-emerald-700 text-sm font-medium rounded-md hover:bg-emerald-100 transition-colors"
                >
                  查看导入详情
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 10-28D: 导入失败顶部显著错误横幅 */}
      {((executeResult && !executeResult.success) || executeError) && !isExecuting && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-300 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl text-rose-500 mt-0.5 shrink-0">✗</span>
            <div className="flex-1">
              <div className="text-lg font-semibold text-rose-800">导入失败</div>
              <div className="text-sm text-rose-700 mt-1">
                {executeError || executeResult?.detail || '事务已回滚，未写入任何数据。'}
              </div>
              {executeResult?.errors && executeResult.errors.length > 0 && (
                <div className="text-xs text-rose-600 mt-1">
                  {executeResult.errors.slice(0, 3).join('；')}
                  {executeResult.errors.length > 3 && ` 等 ${executeResult.errors.length} 条错误`}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  executeResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="mt-3 px-4 py-1.5 border border-rose-300 text-rose-700 text-sm font-medium rounded-md hover:bg-rose-100 transition-colors"
              >
                查看错误详情
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 安全提示区域 */}
      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">安全说明 · 库存口径</h2>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5 shrink-0">•</span>
            <span>本轮仅执行 CSV 解析和字段校验，<strong>不会写入数据库</strong>，不会创建产品，不会修改库存。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5 shrink-0">•</span>
            <span>
              <strong>低库存判定依据：</strong>仅以 <strong>本地真实库存（current_stock ≤ min_stock）</strong> 为准。
              即使异地库存、虚拟库存、总可售库存很高，也不影响低库存判断。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5 shrink-0">•</span>
            <span>
              <strong>库存不自动合并：</strong>异地库存、虚拟库存、总可售库存
              <strong>不会自动合并</strong>为本地真实库存。如需导入，请人工确认后填写正确的 current_stock 列。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
            <span>
              正式导入功能已开放（管理员专属）。需先完成预览、
              <strong>确认数据库备份</strong>后执行，仅新增不覆盖已存在产品（按七字段复合键判重）。
            </span>
          </li>
        </ul>
      </div>

      {/* 上传区域 */}
      <div className="mb-6 bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">上传 CSV 文件</h2>
              <p className="text-sm text-slate-500 mt-1">
                选择 .csv 文件进行解析预览，文件大小建议不超过 2 MB
              </p>
            </div>
            {previewResult && !apiError && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded border border-slate-200">
                上次预览完成
              </span>
            )}
          </div>
        </div>
        <div className="p-4 md:p-6">
          {/* 文件选择 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={!canWrite || isUploading}
              title={!canWrite ? adminOnlyTitle : ''}
              className={`text-sm text-slate-700 file:mr-4 file:px-4 file:py-2 file:rounded-md file:border-0 file:text-sm file:font-medium file:cursor-pointer ${
                canWrite
                  ? 'file:bg-slate-700 file:text-white file:hover:bg-slate-800'
                  : 'file:bg-slate-300 file:text-slate-500 file:cursor-not-allowed'
              } ${!canWrite ? 'cursor-not-allowed opacity-60' : ''}`}
            />
            {selectedFile && (
              <button
                onClick={handleClearFile}
                disabled={isUploading}
                className="px-3 py-1.5 text-sm text-slate-500 border border-slate-200 rounded hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                清除选择
              </button>
            )}
          </div>

          {/* 已选文件信息 */}
          {selectedFile && (
            <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-md">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-slate-500">
                  文件名: <span className="text-slate-800 font-medium">{selectedFile.name}</span>
                </span>
                <span className="text-slate-500">
                  大小: <span className="text-slate-800 font-medium">{formatFileSize(selectedFile.size)}</span>
                </span>
                <span className="text-slate-500">
                  类型: <span className="text-slate-800 font-medium">CSV</span>
                </span>
              </div>
            </div>
          )}

          {/* 前端校验提示 */}
          {fileError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md">
              <span className="text-sm text-rose-700">{fileError}</span>
            </div>
          )}

          {/* viewer 权限提示 */}
          {!canWrite && (
            <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-md flex items-start gap-3">
              <span className="text-slate-400 mt-0.5 shrink-0 text-lg leading-none">ℹ</span>
              <div>
                <div className="text-sm font-medium text-slate-700">只读用户 · 无导入权限</div>
                <div className="text-sm text-slate-500 mt-1">
                  当前角色为只读用户（viewer），仅可查看产品数据，不能上传 CSV 或导入数据。
                  如需导入，请联系管理员（admin）操作。
                </div>
              </div>
            </div>
          )}

          {/* 上传按钮 */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleUploadPreview}
              disabled={!canWrite || !selectedFile || isUploading}
              title={
                !canWrite
                  ? adminOnlyTitle
                  : !selectedFile
                    ? '请先选择 CSV 文件'
                    : isUploading
                      ? '解析中...'
                      : ''
              }
              className={`px-6 py-2.5 rounded-md transition-colors font-medium flex items-center gap-2 ${
                !canWrite || !selectedFile || isUploading
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-700 text-white hover:bg-slate-800'
              }`}
            >
              {isUploading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  解析中...
                </>
              ) : (
                '开始预览'
              )}
            </button>

            {/* 正式导入按钮 */}
            <button
              onClick={handleOpenConfirmDialog}
              disabled={!canExecute}
              title={executeDisabledReason || ''}
              className={`px-6 py-2.5 rounded-md transition-colors font-medium flex items-center gap-2 ${
                canExecute
                  ? 'bg-slate-800 text-white hover:bg-slate-900'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              {canExecute ? '执行正式导入' : (executeDisabledReason || '暂不可导入')}
            </button>
          </div>
        </div>
      </div>

      {/* API 错误 */}
      {apiError && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg">
          <div className="text-sm font-medium text-rose-800 mb-1">请求失败</div>
          <div className="text-sm text-rose-700">{apiError}</div>
        </div>
      )}

      {/* ================================================================ */}
      {/* 预览结果 — 当 previewResult 存在且无 API 错误时始终展示 */}
      {/* ================================================================ */}
      {previewResult && !apiError && (
        <>
          {/* 文件信息横幅 */}
          <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500">
              文件: <span className="text-slate-800 font-medium font-mono">{previewResult.filename ?? '-'}</span>
            </span>
            {previewResult.encoding && (
              <span className="text-slate-500">
                编码: <span className="text-slate-800 font-medium">{previewResult.encoding}</span>
              </span>
            )}
            <span className="ml-auto px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded font-medium border border-slate-300">
              只读预览 · 未写库
            </span>
          </div>

          {/* ── 统计卡片 ── */}
          {stats && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">预览统计</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">总行数</div>
                  <div className="text-2xl font-semibold text-slate-800">{stats.total}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">可通过</div>
                  <div className="text-2xl font-semibold text-emerald-700">{stats.valid}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">错误行</div>
                  <div className="text-2xl font-semibold text-rose-700">{stats.error}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">警告行</div>
                  <div className="text-2xl font-semibold text-amber-700">{stats.warning}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">可导入</div>
                  <div className={`text-2xl font-semibold ${stats.canImport ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {stats.canImport ? '是' : '否'}
                  </div>
                </div>
              </div>

              {/* can_import 状态提示 */}
              {stats.canImport === false && (
                <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-md">
                  <div className="text-sm text-rose-700 flex items-start gap-2">
                    <span className="text-rose-500 mt-0.5 shrink-0">✗</span>
                    <span>
                      <strong>存在错误，正式导入前需要修正。</strong>
                      请修正上方红色错误后重新预览。
                    </span>
                  </div>
                </div>
              )}
              {stats.canImport === true && canWrite && stats.warning === 0 && stats.error === 0 && (
                <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                  <div className="text-sm text-emerald-700 flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                    <span>
                      <strong>预览通过，可进入后续导入流程。</strong>
                      确认数据库备份后可执行正式导入。
                    </span>
                  </div>
                </div>
              )}
              {stats.canImport === true && canWrite && (stats.warning > 0 || stats.error > 0) && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="text-sm text-amber-700 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                    <span>
                      <strong>可继续人工确认，但建议补全字段。</strong>
                      当前 {stats.warning} 行存在建议级警告，建议补全品牌、规格、供应商、备注等字段以获得更完整的库存数据。
                    </span>
                  </div>
                </div>
              )}
              {stats.canImport === true && !canWrite && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <div className="text-sm text-slate-600 flex items-start gap-2">
                    <span className="text-slate-400 mt-0.5 shrink-0">ℹ</span>
                    <span>
                      当前 CSV 通过预览校验，但<strong>仅管理员可执行正式导入</strong>。
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 旧系统无货号产品迁移提示（Step 10-6C-fix） */}
          {legacyNoCodeCount > 0 && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="text-sm text-blue-700 flex items-start gap-2">
                <span className="text-blue-500 mt-0.5 shrink-0">ℹ</span>
                <span>
                  <strong>发现 {legacyNoCodeCount} 行旧系统无产品货号。</strong>
                  系统可在正式导入时生成迁移 SKU（LEGACY-NOCODE-0001 起），产品名称保持不变。
                  建议后续在系统中为这些产品补充正式货号。
                </span>
              </div>
            </div>
          )}

          {/* ── 全局错误 ── */}
          {globalErrors.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">
                全局错误
                <span className="text-sm font-normal text-slate-500 ml-2">{globalErrors.length} 条</span>
              </h2>
              <div className="bg-white border border-rose-200 rounded-lg p-4 space-y-1.5">
                {globalErrors.map((err, i) => (
                  <div key={i} className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                    {err}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 库存口径相关警告（醒目但克制） ── */}
          {stockCaliberWarnings.length > 0 && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">
                库存口径警告
                <span className="font-normal ml-2">{stockCaliberWarnings.length} 条</span>
              </h3>
              <ul className="space-y-1.5">
                {stockCaliberWarnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── 其他全局警告 ── */}
          {otherGlobalWarnings.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">
                全局警告
                <span className="text-sm font-normal text-slate-500 ml-2">{otherGlobalWarnings.length} 条</span>
              </h2>
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5">
                {otherGlobalWarnings.map((w, i) => (
                  <div key={i} className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                    {w}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 字段识别 ── */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">字段识别结果</h2>

            {/* 缺失必填字段警示 */}
            {fields && fields.missingRequired.length > 0 && (
              <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="text-rose-500 mt-0.5 shrink-0 text-lg leading-none">✗</span>
                  <div>
                    <div className="text-sm font-semibold text-rose-800 mb-1">
                      缺失必填字段 — 无法导入
                    </div>
                    <div className="text-sm text-rose-700">
                      CSV 表头中缺少以下必填字段列，请补充后重新上传：
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {fields.missingRequired.map((f) => (
                        <span key={f} className="px-2 py-1 bg-rose-100 text-rose-800 text-xs rounded border border-rose-300 font-medium">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* P0: 当前可落库字段 */}
              <div className="bg-white border border-slate-200 rounded-lg">
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-slate-700 text-white text-xs rounded font-medium">P0</span>
                    <span className="text-sm font-medium text-slate-800">可落库字段</span>
                  </div>
                  <span className="text-xs text-slate-500">当前阶段可直接写入数据库</span>
                </div>
                <div className="p-4">
                  {fields && fields.p0.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {fields.p0.map((f) => (
                        <span key={f} className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded border border-slate-200">
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">无</span>
                  )}
                </div>
              </div>

              {/* P1: 已识别暂不保存 */}
              <div className="bg-white border border-slate-200 rounded-lg">
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium border border-amber-200">P1</span>
                    <span className="text-sm font-medium text-slate-800">暂不保存字段</span>
                  </div>
                  <span className="text-xs text-slate-500">已识别但当前阶段不写入</span>
                </div>
                <div className="p-4">
                  {fields && fields.p1.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {fields.p1.map((f) => (
                        <span key={f} className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded border border-amber-200">
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">无</span>
                  )}
                </div>
              </div>

              {/* P2: 仅供参照 */}
              <div className="bg-white border border-slate-200 rounded-lg">
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-medium border border-slate-300">P2</span>
                    <span className="text-sm font-medium text-slate-800">仅供参照字段</span>
                  </div>
                  <span className="text-xs text-slate-500">仅用于人工核对，不自动处理</span>
                </div>
                <div className="p-4">
                  {fields && fields.p2.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {fields.p2.map((f) => (
                        <span key={f} className="px-2 py-1 bg-slate-50 text-slate-600 text-xs rounded border border-slate-200">
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">无</span>
                  )}
                </div>
              </div>

              {/* 忽略字段 */}
              <div className="bg-white border border-slate-200 rounded-lg">
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-slate-50 text-slate-500 text-xs rounded font-medium border border-slate-300">-</span>
                    <span className="text-sm font-medium text-slate-800">忽略字段</span>
                  </div>
                  <span className="text-xs text-slate-500">未识别的 CSV 列</span>
                </div>
                <div className="p-4">
                  {fields && fields.ignored.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {fields.ignored.map((f) => (
                        <span key={f} className="px-2 py-1 bg-slate-50 text-slate-500 text-xs rounded border border-slate-200 line-through">
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">无</span>
                  )}
                </div>
              </div>
            </div>

            {/* 库存口径参考字段（独立一行） */}
            {fields && fields.stockContext.length > 0 && (
              <div className="mt-4 bg-white border border-amber-200 rounded-lg">
                <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/50">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium border border-amber-200">口径</span>
                    <span className="text-sm font-medium text-slate-800">库存口径参考字段</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    这些字段仅用于预览参考，不写入数据库，不参与本地库存计算
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {fields.stockContext.map((f) => (
                      <span key={f} className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded border border-amber-200">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 库存口径提醒横幅 ── */}
          {hasInventoryContext && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">库存口径提醒</h3>
              <p className="text-sm text-amber-700">
                以下行包含非本地库存数据（异地库存、虚拟库存、总可售库存等），当前仅按本地真实库存口径
                进行预览。这些行的 <strong>current_stock</strong> 如需从其他库存来源计算，请人工确认后
                在正式导入时处理。
              </p>
            </div>
          )}

          {/* ── 行级预览 ── */}
          {rows.length > 0 ? (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">
                行级预览
                <span className="text-sm font-normal text-slate-500 ml-2">共 {rows.length} 行</span>
              </h2>
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[1200px] md:min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          #
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          状态
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          SKU
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          产品名称
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          分类
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          本地库存
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          最低库存
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          单位
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          位置
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          库存口径
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          错误/警告
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {rows.map((row) => {
                        const n = row.normalized ?? {};
                        const ctx = row.inventory_context ?? {};

                        return (
                          <tr
                            key={row.row_number}
                            className={`hover:bg-slate-50 transition-colors ${
                              row.status === 'error' ? 'bg-rose-50/50' : ''
                            }`}
                          >
                            {/* 行号 */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="text-sm text-slate-500 font-mono">{row.row_number}</span>
                            </td>

                            {/* 状态 */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <RowStatusBadge status={row.status} />
                            </td>

                            {/* SKU */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              {n.sku != null ? (
                                <span className="text-sm font-medium text-slate-800">{n.sku}</span>
                              ) : row.suggested_sku != null ? (
                                <span className="text-sm text-blue-600 font-medium" title="正式导入时将生成此迁移 SKU">
                                  {row.suggested_sku}
                                  <span className="text-xs text-blue-400 ml-1">（将生成）</span>
                                </span>
                              ) : (
                                <span className="text-sm text-slate-400">-</span>
                              )}
                            </td>

                            {/* 产品名称 */}
                            <td className="px-3 py-3">
                              <span className="text-sm text-slate-800">{n.name ?? '-'}</span>
                            </td>

                            {/* 分类 */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="text-sm text-slate-700">{n.category ?? '-'}</span>
                            </td>

                            {/* 本地真实库存 */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium text-slate-800">
                                  {n.current_stock !== undefined && n.current_stock !== null ? n.current_stock : '-'}
                                </span>
                                {(() => {
                                  const cs = n.current_stock;
                                  const ms = n.min_stock;
                                  if (cs !== undefined && cs !== null && ms !== undefined && ms !== null && cs <= ms) {
                                    return (
                                      <span
                                        className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded border border-amber-200 font-medium"
                                        title={`本地库存 ${cs} ≤ 最低库存 ${ms}，导入后将处于低库存状态`}
                                      >
                                        低库存
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </td>

                            {/* 最低库存 */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="text-sm text-slate-700">
                                {n.min_stock !== undefined && n.min_stock !== null ? n.min_stock : '-'}
                              </span>
                            </td>

                            {/* 单位 */}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="text-sm text-slate-700">{n.unit ?? '-'}</span>
                            </td>

                            {/* 位置 */}
                            <td className="px-3 py-3">
                              <span className="text-sm text-slate-700">{n.location ?? '-'}</span>
                            </td>

                            {/* 库存口径 — 展示所有 inventory_context 字段 */}
                            <td className="px-3 py-3">
                              <InventoryContextCell context={ctx} />
                            </td>

                            {/* 错误/警告 */}
                            <td className="px-3 py-3">
                              <div className="space-y-1">
                                {Array.isArray(row.errors) && row.errors.map((err, i) => (
                                  <div key={`e-${i}`} className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">
                                    {err}
                                  </div>
                                ))}
                                {Array.isArray(row.warnings) && row.warnings.map((warn, i) => (
                                  <div key={`w-${i}`} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                    {warn}
                                  </div>
                                ))}
                                {(!Array.isArray(row.errors) || row.errors.length === 0) && (!Array.isArray(row.warnings) || row.warnings.length === 0) && (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* 有 previewResult 但无 rows 时的提示 */
            <div className="mb-6 p-6 bg-white border border-slate-200 rounded-lg text-center">
              <div className="text-slate-400 text-3xl mb-3">📋</div>
              <div className="text-sm font-medium text-slate-600 mb-1">暂无行级预览数据</div>
              <div className="text-sm text-slate-500">
                {globalErrors.length > 0
                  ? 'CSV 存在结构性错误（缺少必填字段或数据行为空），请查看上方错误信息。'
                  : previewResult?.filename
                    ? 'CSV 文件仅包含表头，没有数据行。请检查文件内容。'
                    : '请确认 CSV 文件包含有效的表头行和数据行。'}
              </div>
            </div>
          )}

          {/* ── 底部操作区 ── */}
          <div className="mt-8 p-4 md:p-6 bg-white border border-slate-200 rounded-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  预览完成
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded border border-slate-200 font-normal">
                    只读模式
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {previewResult?.filename && (
                    <span>文件: <span className="font-mono">{previewResult.filename}</span></span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={handleOpenConfirmDialog}
                  disabled={!canExecute}
                  title={executeDisabledReason || ''}
                  className={`px-6 py-2.5 rounded-md transition-colors font-medium ${
                    canExecute
                      ? 'bg-slate-800 text-white hover:bg-slate-900'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  }`}
                >
                  {canExecute ? '执行正式导入' : (executeDisabledReason || '暂不可导入')}
                </button>
                {!canWrite && (
                  <span className="text-xs text-slate-400">
                    仅管理员可执行正式导入
                  </span>
                )}
                {canWrite && !stats?.canImport && stats && (
                  <span className="text-xs text-rose-500 font-medium">
                    存在错误 · 请修正后重新预览
                  </span>
                )}
                {canWrite && stats?.canImport && (stats.warning > 0 || stats.error > 0) && (
                  <span className="text-xs text-amber-600 font-medium">
                    预览通过 · 建议补全字段后可执行正式导入
                  </span>
                )}
                {canWrite && stats?.canImport && stats.warning === 0 && stats.error === 0 && (
                  <span className="text-xs text-emerald-600 font-medium">
                    预览通过 · 可执行正式导入
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── 正式导入中状态 ── */}
          {isExecuting && (
            <div className="mt-6 p-6 bg-white border border-slate-200 rounded-lg text-center">
              <div className="inline-block w-10 h-10 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-4"></div>
              <div className="text-base font-medium text-slate-700 mb-1">正在正式导入，请勿关闭页面</div>
              <div className="text-sm text-slate-500">
                正在将 CSV 数据写入数据库，导入完成后将展示结果。
              </div>
            </div>
          )}

          {/* ── 正式导入结果展示 ── */}
          <div ref={executeResultRef} className="scroll-mt-4" />
          {executeResult && !isExecuting && (
            <div className={`mt-6 border rounded-lg overflow-hidden ${
              executeResult.success
                ? 'border-emerald-200'
                : 'border-rose-200'
            }`}>
              {/* 结果标题栏 */}
              <div className={`px-6 py-3 flex items-center justify-between ${
                executeResult.success ? 'bg-emerald-50' : 'bg-rose-50'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`text-lg ${executeResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {executeResult.success ? '✓' : '✗'}
                  </span>
                  <div>
                    <div className={`text-sm font-semibold ${executeResult.success ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {executeResult.success ? '导入成功' : '导入失败'}
                    </div>
                    {executeResult.detail && (
                      <div className="text-xs text-slate-600 mt-0.5">{executeResult.detail}</div>
                    )}
                  </div>
                </div>
                {executeResult.batch_id && (
                  <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 text-xs rounded font-mono">
                    批次: {executeResult.batch_id}
                  </span>
                )}
              </div>

              {/* 统计卡片 */}
              <div className="p-4 md:p-6 bg-white">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
                    <div className="text-xs text-slate-500 mb-1">总行数</div>
                    <div className="text-xl font-semibold text-slate-800">{executeResult.total_rows ?? 0}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-center">
                    <div className="text-xs text-emerald-600 mb-1">新增</div>
                    <div className="text-xl font-semibold text-emerald-700">{executeResult.created_count ?? 0}</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-center">
                    <div className="text-xs text-amber-600 mb-1">跳过</div>
                    <div className="text-xl font-semibold text-amber-700">{executeResult.skipped_count ?? 0}</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-center">
                    <div className="text-xs text-amber-600 mb-1">警告</div>
                    <div className="text-xl font-semibold text-amber-700">{executeResult.warning_count ?? 0}</div>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded p-3 text-center">
                    <div className="text-xs text-rose-600 mb-1">错误</div>
                    <div className="text-xl font-semibold text-rose-700">{executeResult.error_count ?? 0}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
                    <div className="text-xs text-slate-500 mb-1">模式</div>
                    <div className="text-sm font-medium text-slate-700">{executeResult.mode ?? '-'}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
                    <div className="text-xs text-slate-500 mb-1">文件</div>
                    <div className="text-xs font-medium text-slate-700 truncate" title={executeResult.file_name}>{executeResult.file_name ?? '-'}</div>
                  </div>
                </div>

                {/* ── 导入结果提示 ── */}
                {executeResult.success && executeResult.created_count > 0 && (
                  <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-emerald-700 flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                        <span>
                          导入已完成，新增 <strong>{executeResult.created_count}</strong> 个产品。
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/products')}
                        className="shrink-0 ml-4 px-4 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 transition-colors"
                      >
                        去产品管理查看
                      </button>
                    </div>
                  </div>
                )}

                {executeResult.success && executeResult.created_count === 0 && executeResult.skipped_count > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="text-sm text-amber-700 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                      <span>
                        <strong>所有产品均已存在（七字段复合键匹配），本次导入无新增。</strong>
                        {' '}共 {executeResult.skipped_count} 条均已跳过，原产品数据保持不变。
                      </span>
                    </div>
                  </div>
                )}

                {executeResult.skipped_count > 0 && executeResult.created_count > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="text-sm text-amber-700 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                      <span>
                        <strong>部分产品已存在（七字段复合键匹配），系统已跳过，未覆盖原数据。</strong>
                        {' '}共跳过 {executeResult.skipped_count} 条，原产品数据保持不变。下方「跳过产品」表格可查看明细。
                      </span>
                    </div>
                  </div>
                )}

                {executeResult.success && executeResult.warning_count > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="text-sm text-amber-700 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                      <span>
                        导入完成但存在警告，请核对下方 warning 列表。
                      </span>
                    </div>
                  </div>
                )}

                {(!executeResult.success || executeResult.error_count > 0) && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-md">
                    <div className="text-sm text-rose-700 flex items-start gap-2">
                      <span className="text-rose-500 mt-0.5 shrink-0">✗</span>
                      <span>
                        <strong>导入未完成，系统未写入任何新增产品或已回滚。</strong>
                        {' '}请查看下方错误详情，修正 CSV 后重新预览并导入。
                      </span>
                    </div>
                  </div>
                )}

                {/* 新增产品列表 */}
                {Array.isArray(executeResult.created_items) && executeResult.created_items.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">
                      新增产品
                      <span className="font-normal text-slate-500 ml-2">{executeResult.created_items.length} 条</span>
                    </h4>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-emerald-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-emerald-700">行号</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-emerald-700">SKU</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-emerald-700">产品名称</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-emerald-700">产品 ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-200">
                          {executeResult.created_items.slice(0, 20).map((item, i) => (
                            <tr key={i} className="hover:bg-emerald-50/50">
                              <td className="px-3 py-2 text-xs text-slate-600 font-mono">{item.row_number}</td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-800 font-mono">{item.sku}</td>
                              <td className="px-3 py-2 text-xs text-slate-700">{item.name}</td>
                              <td className="px-3 py-2 text-xs text-slate-600 font-mono">{item.product_id}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {executeResult.created_items.length > 20 && (
                        <div className="px-4 py-2 bg-emerald-100/50 text-xs text-emerald-700">
                          … 仅显示前 20 条，共 {executeResult.created_items.length} 条
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 跳过产品列表 */}
                {Array.isArray(executeResult.skipped_items) && executeResult.skipped_items.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">
                      跳过产品
                      <span className="font-normal text-slate-500 ml-2">{executeResult.skipped_items.length} 条</span>
                    </h4>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-amber-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-amber-700">行号</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-amber-700">SKU</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-amber-700">名称</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-amber-700">跳过原因</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-200">
                          {executeResult.skipped_items.slice(0, 20).map((item, i) => (
                            <tr key={i} className="hover:bg-amber-50/50">
                              <td className="px-3 py-2 text-xs text-slate-600 font-mono">{item.row_number}</td>
                              <td className="px-3 py-2 text-xs font-medium text-slate-800 font-mono">{item.sku}</td>
                              <td className="px-3 py-2 text-xs text-slate-700">{item.name}</td>
                              <td className="px-3 py-2 text-xs text-amber-700">{item.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {executeResult.skipped_items.length > 20 && (
                        <div className="px-4 py-2 bg-amber-100/50 text-xs text-amber-700">
                          … 仅显示前 20 条，共 {executeResult.skipped_items.length} 条
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 错误列表 */}
                {Array.isArray(executeResult.errors) && executeResult.errors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-rose-700 mb-2">
                      错误
                      <span className="font-normal ml-2">{executeResult.errors.length} 条</span>
                    </h4>
                    <div className="space-y-1.5">
                      {executeResult.errors.map((err, i) => (
                        <div key={`exec-err-${i}`} className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
                          {err}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 警告列表 */}
                {Array.isArray(executeResult.warnings) && executeResult.warnings.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-amber-700 mb-2">
                      警告
                      <span className="font-normal ml-2">{executeResult.warnings.length} 条</span>
                    </h4>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {executeResult.warnings.map((warn, i) => (
                        <div key={`exec-warn-${i}`} className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                          {warn}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 无数据提示 */}
                {(!Array.isArray(executeResult.created_items) || executeResult.created_items.length === 0)
                  && (!Array.isArray(executeResult.skipped_items) || executeResult.skipped_items.length === 0)
                  && executeResult.success && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded text-center">
                    <div className="text-sm text-slate-600">导入完成，无新增或跳过产品。</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 正式导入错误（网络/鉴权等非后端业务错误） ── */}
          {executeError && !isExecuting && (
            <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-lg">
              <div className="text-sm font-medium text-rose-800 mb-1">正式导入请求失败</div>
              <div className="text-sm text-rose-700">{executeError}</div>
            </div>
          )}
        </>
      )}

      {/* 无预览结果时的空状态提示 */}
      {!previewResult && !apiError && (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-lg">
          <div className="text-slate-300 text-4xl mb-3">
            {canWrite ? '📂' : '🔒'}
          </div>
          <div className="text-slate-500 text-sm font-medium mb-1">
            {canWrite
              ? '选择 CSV 文件并点击「开始预览」查看解析结果'
              : '仅管理员可进行数据导入预览'}
          </div>
          <div className="text-slate-400 text-xs">
            {canWrite
              ? '预览过程不会写入数据库，可安全操作'
              : '当前角色为只读用户，请切换至管理员账号操作'}
          </div>
        </div>
      )}

      {/* 底部信息 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：导入预览功能支持 UTF-8 / UTF-8 BOM 编码，并兼容 GBK / GB18030 编码的 CSV 文件。
          预览结果仅展示解析和校验信息，不会对系统数据产生任何影响。
          库存数据以本地真实库存为准，低库存预警在导入完成后由系统自动计算。
          正式导入仅管理员可操作，需先完成数据库备份确认。
        </div>
      </div>

      {/* ── 正式导入确认弹窗 ── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 半透明遮罩 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleCloseConfirmDialog}
          ></div>

          {/* 弹窗内容 */}
          <div className="relative bg-white rounded-lg shadow-xl border border-slate-300 w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
            {/* 弹窗标题 */}
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <span className="text-amber-500 text-xl">⚠</span>
                <h3 className="text-lg font-semibold text-slate-800">确认正式导入</h3>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                即将对 CSV 解析结果执行正式导入，请确认以下事项：
              </p>
            </div>

            {/* 弹窗内容 */}
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-emerald-500 mt-0.5 shrink-0">✅</span>
                <div>
                  <div className="text-sm font-medium text-slate-700">即将写入数据库</div>
                  <div className="text-sm text-slate-500">
                    将新增 {stats?.valid ?? '?'} 个产品到数据库（create_only 模式）
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                <div>
                  <div className="text-sm font-medium text-slate-700">仅导入本地真实库存（current_stock）</div>
                  <div className="text-sm text-slate-500">
                    异地库存、虚拟库存、总可售库存不会写入，也不会计入低库存判断。
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                <div>
                  <div className="text-sm font-medium text-slate-700">已存在的产品（七字段复合键匹配）将被跳过</div>
                  <div className="text-sm text-slate-500">
                    不会覆盖已有产品的任何字段（库存、名称、分类等），仅以 skipped 记录。
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                <div>
                  <div className="text-sm font-medium text-slate-700">建议已在设置页完成数据库备份</div>
                  <div className="text-sm text-slate-500">
                    备份文件可在 设置 → 备份管理 → 下载。导入后无法撤销单条记录，
                    如需回滚需使用备份文件恢复整个数据库。
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-rose-500 mt-0.5 shrink-0">⚠</span>
                <div>
                  <div className="text-sm font-medium text-slate-700">导入后无法撤销单条记录</div>
                  <div className="text-sm text-slate-500">
                    如需回滚，需使用备份文件恢复整个数据库。
                  </div>
                </div>
              </div>

              {/* 确认勾选框 */}
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-slate-700 focus:ring-slate-500"
                  />
                  <span className="text-sm text-slate-700">
                    我已确认上述信息，并已在导入前完成数据库备份
                  </span>
                </label>
              </div>
            </div>

            {/* 弹窗底部按钮 */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={handleCloseConfirmDialog}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={!confirmChecked}
                title={!confirmChecked ? '请先确认已完成数据库备份' : ''}
                className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                  confirmChecked
                    ? 'bg-slate-800 text-white hover:bg-slate-900'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                确认导入，写入数据库
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductImportPreview;
