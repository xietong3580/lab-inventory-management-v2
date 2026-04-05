/**
 * 导出辅助函数 - CSV 导出功能
 */

/**
 * CSV 值转义函数
 * @param {any} value - 需要转义的值
 * @returns {string} 转义后的 CSV 字符串
 */
const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  // 如果包含逗号、换行或双引号，需要用双引号包裹并转义内部的双引号
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

/**
 * 将交易记录导出为 CSV 格式
 * @param {Array} records - 交易记录数组
 * @param {Array} products - 产品数组（用于获取 SKU）
 * @param {string} fileName - 导出的文件名（不含扩展名）
 */
export const exportTransactionsToCSV = (records, products, fileName = 'transactions-export') => {
  if (!records || records.length === 0) {
    alert('没有可导出的数据，请先筛选或等待数据加载。');
    return;
  }

  // 构建 CSV 标题行
  const headers = [
    '时间',
    '记录类型',
    '产品名称',
    'SKU',
    '数量',
    '单位',
    '操作人',
    '状态',
    '备注'
  ];

  // 根据产品名称查找 SKU 的辅助函数
  const findSkuByProductName = (productName) => {
    const product = products.find(p => p.name === productName);
    return product ? product.sku : '';
  };

  // 构建数据行
  const rows = records.map(record => {
    const sku = findSkuByProductName(record.productName);

    // 使用外部 escapeCSV 函数处理特殊字符

    return [
      escapeCSV(record.date || ''),
      escapeCSV(record.type || ''),
      escapeCSV(record.productName || ''),
      escapeCSV(sku),
      escapeCSV(record.quantity || 0),
      escapeCSV(record.unit || ''),
      escapeCSV(record.operator || ''),
      escapeCSV(record.status === 'completed' ? '已完成' :
                record.status === 'reversed' ? '已撤销' :
                record.status === 'pending' ? '处理中' : record.status),
      escapeCSV(record.notes || '')
    ];
  });

  // 将标题和数据合并为完整的 CSV 内容
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // 创建 Blob 对象
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });

  // 生成文件名（包含当前日期时间）
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const fullFileName = `${fileName}-${dateStr}-${timeStr}.csv`;

  // 创建下载链接
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fullFileName;

  // 触发下载
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 清理 URL 对象
  URL.revokeObjectURL(link.href);
};

/**
 * 将审计日志导出为 CSV 格式
 * @param {Array} records - 审计日志数组（每条记录应包含以下字段：time, actionType, productName, operator, summary）
 * @param {string} fileName - 导出的文件名（不含扩展名）
 */
export const exportAuditLogsToCSV = (records, fileName = 'audit-log-export') => {
  if (!records || records.length === 0) {
    alert('没有可导出的审计日志数据，请先筛选或等待数据加载。');
    return;
  }

  // 构建 CSV 标题行
  const headers = [
    '时间',
    '操作类型',
    '产品名称',
    '操作人',
    '摘要'
  ];

  // 构建数据行
  const rows = records.map(record => [
    escapeCSV(record.time || ''),
    escapeCSV(record.actionType || ''),
    escapeCSV(record.productName || ''),
    escapeCSV(record.operator || ''),
    escapeCSV(record.summary || '')
  ]);

  // 将标题和数据合并为完整的 CSV 内容
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // 创建 Blob 对象
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });

  // 生成文件名（包含当前日期时间）
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const fullFileName = `${fileName}-${dateStr}-${timeStr}.csv`;

  // 创建下载链接
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fullFileName;

  // 触发下载
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 清理 URL 对象
  URL.revokeObjectURL(link.href);
};

/**
 * 将产品列表导出为 CSV 格式
 * @param {Array} products - 产品数组
 * @param {string} fileName - 导出的文件名（不含扩展名）
 */
export const exportProductsToCSV = (products, fileName = 'products-export') => {
  if (!products || products.length === 0) {
    alert('没有可导出的产品数据，请先筛选或等待数据加载。');
    return;
  }

  // 构建 CSV 标题行
  const headers = [
    '产品名称',
    'SKU',
    '分类',
    '当前库存',
    '最低库存',
    '状态',
    '单位',
    '存储位置',
    '最后更新'
  ];

  // 构建数据行
  const rows = products.map(product => [
    escapeCSV(product.name || ''),
    escapeCSV(product.sku || ''),
    escapeCSV(product.category || ''),
    escapeCSV(product.currentStock || 0),
    escapeCSV(product.minStock || 0),
    escapeCSV(product.status === '低库存' ? '低库存' : '正常'),
    escapeCSV(product.unit || ''),
    escapeCSV(product.location || ''),
    escapeCSV(product.lastUpdated || '')
  ]);

  // 将标题和数据合并为完整的 CSV 内容
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // 创建 Blob 对象
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });

  // 生成文件名（包含当前日期时间）
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const fullFileName = `${fileName}-${dateStr}-${timeStr}.csv`;

  // 创建下载链接
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fullFileName;

  // 触发下载
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 清理 URL 对象
  URL.revokeObjectURL(link.href);
};

/**
 * 获取当前日期时间字符串（用于文件名）
 * @returns {string} 格式化日期时间字符串
 */
export const getCurrentDateTimeForFilename = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}-${minutes}`;
};