import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';

/**
 * Excel / 腾讯文档式多选筛选组件
 *
 * 用于替换普通 <select> 下拉框，支持：
 * - 搜索筛选项
 * - 多选勾选（checkbox）
 * - 全选 / 反选 / 清空
 * - 显示每个选项的数量
 * - 确定 / 取消 / 重置
 * - 点击外部关闭
 * - 选项列表可滚动
 *
 * Step 10-29A-fix1: React.memo 包裹，避免父组件无关重渲染
 */
const MultiSelectFilter = memo(function MultiSelectFilter({
  label = '筛选',
  placeholder = '全部',
  options = [],
  selectedValues = [],
  onChange,
  optionCounts = null,
  searchable = true,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState([...selectedValues]);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);

  // 同步外部选中值到 draft
  useEffect(() => {
    setDraft([...selectedValues]);
  }, [selectedValues]);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 过滤后的选项
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((opt) => String(opt).toLowerCase().includes(q));
  }, [options, search]);

  // 是否全选
  const allSelected = draft.length === options.length && options.length > 0;

  // 按钮显示文字
  const buttonLabel = useMemo(() => {
    if (selectedValues.length === 0) return placeholder || `全部${label}`;
    if (selectedValues.length === 1) return selectedValues[0];
    return `已选 ${selectedValues.length} 项`;
  }, [selectedValues, placeholder, label]);

  const hasSelection = selectedValues.length > 0;

  const handleToggle = useCallback(
    (value) => {
      setDraft((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
      );
    },
    []
  );

  const handleSelectAll = () => setDraft([...options]);
  const handleInvert = () => setDraft(options.filter((o) => !draft.includes(o)));
  const handleClear = () => setDraft([]);
  const handleConfirm = () => {
    onChange([...draft]);
    setOpen(false);
    setSearch('');
  };
  const handleCancel = () => {
    setDraft([...selectedValues]);
    setOpen(false);
    setSearch('');
  };
  const handleReset = () => {
    setDraft([]);
    onChange([]);
    setOpen(false);
    setSearch('');
  };

  const toggleOpen = () => {
    if (open) {
      setDraft([...selectedValues]);
      setSearch('');
      setOpen(false);
    } else {
      setOpen(true);
    }
  };

  return (
    <div className="relative">
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className={`w-full px-3 py-2 border rounded-md text-sm text-left focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white transition-colors ${
          hasSelection
            ? 'border-slate-400 bg-slate-50 font-medium text-slate-800'
            : 'border-slate-300 text-slate-600'
        }`}
      >
        <span className="block truncate pr-4">{buttonLabel}</span>
        {/* 下拉箭头 + 选中标记 */}
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasSelection && (
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          )}
          <svg
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* 浮层面板 */}
      {open && (
        <div
          ref={panelRef}
          className="absolute z-30 mt-1 w-72 sm:w-80 bg-white border border-slate-200 rounded-lg shadow-lg"
          style={{ minWidth: 280, maxWidth: 420 }}
        >
          {/* 面板头部 */}
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-xs font-medium text-slate-500 mb-1.5">{label}</div>
            {searchable && options.length > 6 && (
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索…"
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-transparent"
              />
            )}
          </div>

          {/* 操作按钮行 */}
          <div className="px-2 py-1.5 flex items-center gap-1 text-xs border-b border-slate-100">
            <button type="button" onClick={handleSelectAll} className="px-2 py-0.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors">全选</button>
            <button type="button" onClick={handleInvert} className="px-2 py-0.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors">反选</button>
            <button type="button" onClick={handleClear} className="px-2 py-0.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors">清空</button>
            <span className="ml-auto text-slate-400">{draft.length}/{options.length}</span>
          </div>

          {/* 选项列表 */}
          <div className="max-h-72 overflow-y-auto" style={{ maxHeight: 300 }}>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">无匹配选项</div>
            ) : (
              filteredOptions.map((value) => {
                const checked = draft.includes(value);
                const count = optionCounts ? optionCounts[value] : undefined;
                return (
                  <label
                    key={value}
                    className={`flex items-center px-3 py-1.5 cursor-pointer hover:bg-slate-50 transition-colors text-sm ${
                      checked ? 'bg-slate-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(value)}
                      className="w-3.5 h-3.5 text-slate-700 border-slate-300 rounded focus:ring-slate-500 shrink-0"
                    />
                    <span className={`ml-2 truncate ${checked ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                      {value || '(空)'}
                    </span>
                    {count !== undefined && (
                      <span className="ml-auto text-xs text-slate-400 shrink-0">{count}</span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          {/* 底部操作按钮 */}
          <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
            >
              重置
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-3 py-1 text-xs text-white bg-slate-700 rounded hover:bg-slate-800 transition-colors font-medium"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default MultiSelectFilter;
