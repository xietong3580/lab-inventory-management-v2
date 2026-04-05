// 审计日志工具函数 - 供 Dashboard 和 AuditLog 页面复用

// 操作类型中文映射
export const actionTypeMap = {
  PRODUCT_ADD: { label: '新增产品', color: 'bg-emerald-50 text-emerald-700' },
  PRODUCT_UPDATE: { label: '编辑产品', color: 'bg-blue-50 text-blue-700' },
  PRODUCT_DELETE: { label: '删除产品', color: 'bg-rose-50 text-rose-700' },
  TRANSACTION_ADD: { label: '出入库', color: 'bg-slate-50 text-slate-700' },
  TRANSACTION_REVERSE: { label: '撤销交易', color: 'bg-amber-50 text-amber-700' },
  SYSTEM_RESET: { label: '系统重置', color: 'bg-violet-50 text-violet-700' }
};

/**
 * 格式化审计日志时间戳
 * @param {string} timestamp - 时间戳字符串 (格式: YYYY-MM-DD HH:MM:SS)
 * @param {string} format - 格式: 'full' 完整时间, 'time' 仅时间, 'date' 仅日期, 'compact' 紧凑格式(MM-DD HH:MM)
 * @returns {string} 格式化后的时间字符串
 */
export const formatAuditTime = (timestamp, format = 'full') => {
  if (!timestamp) return '';

  try {
    if (format === 'time') {
      // 仅显示 HH:MM (Dashboard 使用)
      const match = timestamp.match(/\s(\d{2}:\d{2})/);
      return match ? match[1] : timestamp.substring(11, 16);
    } else if (format === 'date') {
      // 仅显示 YYYY-MM-DD
      return timestamp.substring(0, 10);
    } else if (format === 'compact') {
      // 紧凑格式: MM-DD HH:MM (AuditLog 列表使用)
      const month = timestamp.substring(5, 7);
      const day = timestamp.substring(8, 10);
      const hour = timestamp.substring(11, 13);
      const minute = timestamp.substring(14, 16);
      return `${month}-${day} ${hour}:${minute}`;
    } else {
      // 完整时间 YYYY-MM-DD HH:MM:SS (AuditLog 使用)
      return timestamp;
    }
  } catch {
    return '';
  }
};

/**
 * 生成审计日志摘要
 * @param {Object} log - 审计日志对象
 * @param {string} log.actionType - 操作类型
 * @param {string} log.productName - 产品名称
 * @returns {string} 摘要文本
 */
export const generateAuditSummary = (log, compact = false) => {
  const { actionType, productName } = log;
  const actionLabel = actionTypeMap[actionType]?.label || actionType;

  switch (actionType) {
    case 'PRODUCT_ADD':
      return compact ? `新增产品` : `新增产品「${productName || '未知产品'}」`;
    case 'PRODUCT_UPDATE':
      return compact ? `编辑产品` : `编辑产品「${productName || '未知产品'}」`;
    case 'PRODUCT_DELETE':
      return compact ? `删除产品` : `删除产品「${productName || '未知产品'}」`;
    case 'TRANSACTION_ADD':
      return compact ? `新增出入库记录` : `新增出入库记录「${productName || '未知产品'}」`;
    case 'TRANSACTION_REVERSE':
      return compact ? `撤销交易` : `撤销交易「${productName || '未知产品'}」相关记录`;
    case 'SYSTEM_RESET':
      return `系统数据已重置`;
    default:
      return `${actionLabel}操作`;
  }
};

/**
 * 获取显示用的操作人名称
 * @param {string} operator - 原始操作人字段
 * @returns {string} 显示用的操作人名称
 */
export const getDisplayOperator = (operator) => {
  if (!operator || operator.trim() === '') {
    return '系统';
  }
  return operator;
};

/**
 * 获取操作类型配置
 * @param {string} actionType - 操作类型
 * @returns {Object} 包含 label 和 color 的配置对象
 */
export const getActionConfig = (actionType) => {
  return actionTypeMap[actionType] || { label: actionType, color: 'bg-slate-50 text-slate-700' };
};

/**
 * 根据时间范围筛选审计日志
 * @param {Array} logs - 审计日志数组
 * @param {string} timeRange - 时间范围: 'today', 'week', 'month', 'all'
 * @returns {Array} 筛选后的日志数组
 */
export const filterLogsByTimeRange = (logs, timeRange) => {
  if (timeRange === 'all' || !timeRange) {
    return logs;
  }

  const now = new Date();
  let startDate = new Date();

  switch (timeRange) {
    case 'today':
      // 今日: 从当天0点开始
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      // 近7天: 包括今天往前推7天
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      // 近30天: 包括今天往前推30天
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      return logs;
  }

  return logs.filter(log => {
    if (!log.timestamp) return false;
    try {
      const logDate = new Date(log.timestamp);
      return logDate >= startDate;
    } catch {
      return false;
    }
  });
};