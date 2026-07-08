/**
 * 库存通用工具函数
 * 供 Dashboard、Alerts 等多页面复用，避免重复定义。
 */

/**
 * 计算产品紧急程度（根据库存百分比）
 * @param {Object} product - 产品对象，需含 currentStock、minStock
 * @returns {'high'|'medium'|'low'} 紧急程度
 */
export const calculateUrgency = (product) => {
  const current = Number(product.currentStock) || 0;
  const min = Number(product.minStock) || 1; // 避免除以 0
  const ratio = current / min;
  if (ratio <= 0.2) return 'high';
  if (ratio <= 0.5) return 'medium';
  return 'low';
};

/**
 * 获取最近 N 天的日期数组（YYYY-MM-DD）
 * @param {number} [days=7]
 * @returns {string[]}
 */
export const getRecentDates = (days = 7) => {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
};

/**
 * 从日期时间字符串中提取日期部分（YYYY-MM-DD）
 * 支持: "2026-03-29 14:30"、"2026-03-29"、"2026-03-29T14:30:00Z"
 * @param {string} dateTimeStr
 * @returns {string}
 */
export const extractDatePart = (dateTimeStr) => {
  if (!dateTimeStr) return '';
  if (dateTimeStr.includes(' ')) {
    return dateTimeStr.split(' ')[0];
  } else if (dateTimeStr.includes('T')) {
    return dateTimeStr.split('T')[0];
  }
  return dateTimeStr;
};
