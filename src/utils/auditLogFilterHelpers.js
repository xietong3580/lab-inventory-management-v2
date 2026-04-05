// 审计日志筛选工具函数
import { filterLogsByTimeRange } from './auditLogHelpers';

/**
 * 筛选审计日志
 * @param {Array} logs - 原始审计日志数组
 * @param {string} selectedTimeRange - 快捷时间范围：'all', 'today', 'week', 'month'
 * @param {Object} dateRange - 自定义日期范围：{ start: string, end: string }
 * @param {string} selectedActionType - 选中的操作类型
 * @param {string} searchKeyword - 产品名称关键词
 * @param {string} operatorSearch - 操作人关键词
 * @returns {Array} 筛选后的日志数组
 */
export const filterAuditLogs = (
  logs,
  selectedTimeRange,
  dateRange,
  selectedActionType,
  searchKeyword,
  operatorSearch
) => {
  let filtered = [...logs];

  // 1. 按快捷时间范围筛选
  filtered = filterLogsByTimeRange(filtered, selectedTimeRange);

  // 2. 按自定义日期范围筛选（可与快捷时间范围叠加）
  if (dateRange.start) {
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    filtered = filtered.filter(log => {
      if (!log.timestamp) return false;
      try {
        const logDate = new Date(log.timestamp);
        return logDate >= start;
      } catch {
        return false;
      }
    });
  }

  if (dateRange.end) {
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter(log => {
      if (!log.timestamp) return false;
      try {
        const logDate = new Date(log.timestamp);
        return logDate <= end;
      } catch {
        return false;
      }
    });
  }

  // 3. 按操作类型筛选
  if (selectedActionType) {
    filtered = filtered.filter(log => log.actionType === selectedActionType);
  }

  // 4. 按产品名称关键词搜索（仅匹配 productName 字段）
  if (searchKeyword.trim()) {
    const keyword = searchKeyword.trim().toLowerCase();
    filtered = filtered.filter(log =>
      log.productName && log.productName.toLowerCase().includes(keyword)
    );
  }

  // 5. 按操作人关键词搜索
  if (operatorSearch.trim()) {
    const keyword = operatorSearch.trim().toLowerCase();
    filtered = filtered.filter(log =>
      log.operator && log.operator.toLowerCase().includes(keyword)
    );
  }

  return filtered;
};

/**
 * 检查是否有活跃的筛选条件
 * @param {Object} filterParams - 筛选参数对象
 * @returns {boolean} 是否有活跃筛选
 */
export const hasActiveFilters = ({
  searchKeyword,
  selectedActionType,
  selectedTimeRange,
  dateRange,
  operatorSearch
}) => {
  return Boolean(
    searchKeyword ||
    selectedActionType ||
    selectedTimeRange !== 'all' ||
    dateRange.start ||
    dateRange.end ||
    operatorSearch
  );
};

/**
 * 重置所有筛选条件到默认值
 * @returns {Object} 默认筛选状态
 */
export const getDefaultFilterState = () => ({
  searchKeyword: '',
  selectedActionType: '',
  selectedTimeRange: 'all',
  dateRange: { start: '', end: '' },
  operatorSearch: ''
});