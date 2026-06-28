import { useState, useRef, useMemo } from 'react';
import { usePermission } from '../hooks/usePermission';
import {
  previewProductImport,
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

  // 文件相关状态
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // 预览结果状态
  const [previewResult, setPreviewResult] = useState(null);
  const [apiError, setApiError] = useState('');

  const fileInputRef = useRef(null);

  /**
   * 处理文件选择
   */
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    setApiError('');
    setPreviewResult(null);

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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
        ignored: Array.isArray(columns.ignored) ? columns.ignored : [],
      }
    : null;

  const rows = Array.isArray(previewResult?.rows) ? previewResult.rows : [];
  const globalErrors = Array.isArray(previewResult?.errors) ? previewResult.errors : [];
  const globalWarnings = Array.isArray(previewResult?.warnings) ? previewResult.warnings : [];

  // 库存口径相关 warning 过滤
  const stockCaliberWarnings = useMemo(
    () => globalWarnings.filter(hasStockCaliberKeyword),
    [globalWarnings],
  );
  const otherGlobalWarnings = useMemo(
    () => globalWarnings.filter((w) => !hasStockCaliberKeyword(w)),
    [globalWarnings],
  );

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

      {/* 安全提示区域 */}
      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">安全说明</h2>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5 shrink-0">•</span>
            <span>本轮仅执行 CSV 解析和字段校验，<strong>不会写入数据库</strong>，不会创建产品，不会修改库存。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5 shrink-0">•</span>
            <span>
              <strong>current_stock</strong> 按本地真实库存预览。
              异地库存、虚拟库存、总可售库存不会自动计入本地库存。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5 shrink-0">•</span>
            <span>
              低库存判定以 <strong>本地真实库存（current_stock ≤ min_stock）</strong> 为准。
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5 shrink-0">•</span>
            <span>正式导入功能暂未开放。</span>
          </li>
        </ul>
      </div>

      {/* 上传区域 */}
      <div className="mb-6 bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">上传 CSV 文件</h2>
          <p className="text-sm text-slate-500 mt-1">
            选择 .csv 文件进行解析预览，文件大小建议不超过 2 MB
          </p>
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
            <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-md">
              <span className="text-sm text-slate-500">仅管理员可进行数据导入预览</span>
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

            {/* 正式导入按钮 — 始终禁用 */}
            <button
              disabled
              className="px-6 py-2.5 bg-slate-100 text-slate-400 rounded-md cursor-not-allowed font-medium border border-slate-200"
            >
              正式导入暂未开放
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
                  <span className="text-sm text-rose-700">
                    当前 CSV 存在阻断错误，不能进入正式导入。
                  </span>
                  <span className="text-sm text-rose-600 ml-1">正式导入功能暂未开放。</span>
                </div>
              )}
              {stats.canImport === true && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="text-sm text-slate-600">
                    当前 CSV 通过预览校验，但正式导入功能暂未开放。
                  </span>
                </div>
              )}
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
                              <span className="text-sm font-medium text-slate-800">{n.sku ?? '-'}</span>
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
                              <span className="text-sm font-medium text-slate-800">
                                {n.current_stock !== undefined && n.current_stock !== null ? n.current_stock : '-'}
                              </span>
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
              <div className="text-sm text-slate-500">
                {previewResult?.filename
                  ? '暂无行级预览数据，请查看上方错误或警告信息。'
                  : '暂无行级预览数据。'}
              </div>
            </div>
          )}

          {/* ── 底部操作区 ── */}
          <div className="mt-8 p-4 md:p-6 bg-white border border-slate-200 rounded-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-700">预览完成</div>
                <div className="text-xs text-slate-500 mt-1">
                  {previewResult?.filename && (
                    <span>文件: <span className="font-mono">{previewResult.filename}</span></span>
                  )}
                </div>
              </div>
              <button
                disabled
                className="px-6 py-2.5 bg-slate-100 text-slate-400 rounded-md cursor-not-allowed font-medium border border-slate-200"
              >
                正式导入暂未开放
              </button>
            </div>
          </div>
        </>
      )}

      {/* 无预览结果时的空状态提示 */}
      {!previewResult && !apiError && (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-lg">
          <div className="text-slate-400 text-sm">
            {canWrite
              ? '选择 CSV 文件并点击「开始预览」查看解析结果'
              : '仅管理员可进行数据导入预览'}
          </div>
        </div>
      )}

      {/* 底部信息 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：导入预览功能支持 UTF-8 / UTF-8 BOM 编码，并兼容 GBK / GB18030 编码的 CSV 文件。
          预览结果仅展示解析和校验信息，不会对系统数据产生任何影响。
          库存数据以本地真实库存为准，低库存预警在导入完成后由系统自动计算。
        </div>
      </div>
    </div>
  );
}

export default ProductImportPreview;
