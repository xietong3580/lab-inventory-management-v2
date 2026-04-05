/**
 * 导出辅助函数 - CSV 导出功能
 */

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

    // 处理特殊字符：CSV 中需要转义引号和逗号
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // 如果包含逗号、换行或双引号，需要用双引号包裹并转义内部的双引号
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

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