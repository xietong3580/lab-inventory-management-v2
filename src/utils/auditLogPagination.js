// 审计日志分页与筛选参数序列化 / 分页响应规范化（纯函数，便于测试）

// 与后端边界保持一致
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// 导出（全量拉取）时使用的受控分页大小与安全上限
export const EXPORT_PAGE_SIZE = 100;
export const MAX_EXPORT_PAGES = 10000;

/**
 * 将前端分页 + 筛选参数序列化为后端查询字符串（不含前导 "?"）。
 * 参数使用 camelCase（前端约定），序列化时转换为后端 snake_case 字段。
 *
 * @param {Object} params - {
 *   page?: number,
 *   pageSize?: number,
 *   actionType?: string,
 *   productName?: string,
 *   operator?: string,
 *   timeRange?: string,   // 'all' | 'today' | 'week' | 'month'
 *   startDate?: string,   // YYYY-MM-DD
 *   endDate?: string,     // YYYY-MM-DD
 * }
 * @returns {string} 查询字符串（不含 "?"）
 */
export function buildAuditLogQuery(params = {}) {
  const {
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    actionType = '',
    productName = '',
    operator = '',
    timeRange = 'all',
    startDate = '',
    endDate = '',
  } = params || {};

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('page_size', String(pageSize));

  if (actionType) query.set('action_type', actionType);
  if (productName) query.set('product_name', productName);
  if (operator) query.set('operator', operator);
  if (timeRange && timeRange !== 'all') query.set('time_range', timeRange);
  if (startDate) query.set('start_date', startDate);
  if (endDate) query.set('end_date', endDate);

  return query.toString();
}

/**
 * 规范化后端分页响应为前端 camelCase 结构。
 * 兼容后端返回数组（旧格式）与分页对象（新格式）。
 *
 * @param {Array|Object} data - 后端返回（分页对象或旧数组）
 * @param {Function} normalizeItem - 单项规范化函数（默认透传）
 * @returns {Object} { items, total, page, pageSize, totalPages }
 */
export function normalizeAuditLogPage(data, normalizeItem = (x) => x) {
  // 旧格式：直接返回数组 -> 全部视为单页
  if (Array.isArray(data)) {
    const items = data.map(normalizeItem);
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: items.length || DEFAULT_PAGE_SIZE,
      totalPages: items.length > 0 ? 1 : 0,
    };
  }

  const obj = data && typeof data === 'object' ? data : {};
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items = rawItems.map(normalizeItem);
  const total = Number(obj.total) || 0;
  const page = Number(obj.page) || 1;
  const pageSize = Number(obj.page_size) || DEFAULT_PAGE_SIZE;
  const totalPages = Number(obj.total_pages) || 0;

  return { items, total, page, pageSize, totalPages };
}
