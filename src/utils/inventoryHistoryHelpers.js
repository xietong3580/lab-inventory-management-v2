// 库存历史台账工具函数
// 负责将交易记录和审计日志整理成统一的台账列表

/**
 * 计算台账事件的库存变动量（正数表示增加，负数表示减少）
 * @param {Object} entry - 台账条目
 * @returns {number} 库存变动量
 */
const calculateQuantityChange = (entry) => {
  const quantity = Number(entry.quantity) || 0;

  switch (entry.type) {
    case '入库':
      return quantity; // 增加
    case '出库':
      return -quantity; // 减少
    case '撤销入库':
      return -quantity; // 撤销入库等于出库（减少）
    case '撤销出库':
      return quantity; // 撤销出库等于入库（增加）
    case '产品新增':
      return quantity; // 初始库存（从0增加到quantity）
    case '库存编辑':
      return quantity; // quantity已经是差值
    default:
      return 0;
  }
};

/**
 * 将交易记录转换为台账条目
 * @param {Object} transaction - 交易记录对象
 * @param {string} productId - 产品ID（用于匹配审计日志）
 * @returns {Object|null} 台账条目或null（如果无法转换）
 */
const transactionToLedgerEntry = (transaction, productId) => {
  if (!transaction || !transaction.date) return null;

  // 从交易记录中提取信息
  const entry = {
    id: transaction.id,
    timestamp: transaction.date,
    type: transaction.type === '入库' ? '入库' : '出库',
    quantity: Number(transaction.quantity) || 0,
    unit: transaction.unit || '个',
    operator: transaction.operator || '',
    notes: transaction.notes || '',
    source: 'transaction',
    status: transaction.status || 'completed'
  };

  // 为撤销的交易记录添加特殊标记
  if (transaction.status === 'reversed') {
    entry.type = `撤销${transaction.type}`;
    entry.isReversed = true;
  }

  return entry;
};

/**
 * 将审计日志转换为台账条目
 * @param {Object} auditLog - 审计日志对象
 * @returns {Object|null} 台账条目或null（如果无法转换为库存变动记录）
 */
const auditLogToLedgerEntry = (auditLog) => {
  if (!auditLog || !auditLog.timestamp) return null;

  const { actionType, productName, productId, operator, timestamp, details } = auditLog;

  // 只处理与库存变动相关的审计日志类型
  const inventoryRelatedActions = ['PRODUCT_ADD', 'PRODUCT_UPDATE', 'TRANSACTION_ADD', 'TRANSACTION_REVERSE'];
  if (!inventoryRelatedActions.includes(actionType)) {
    return null;
  }

  const entry = {
    id: auditLog.id,
    timestamp,
    operator: operator || '',
    source: 'audit',
    actionType,
    productName,
    productId,
    details
  };

  // 根据不同的操作类型设置台账条目信息
  switch (actionType) {
    case 'PRODUCT_ADD':
      entry.type = '产品新增';
      entry.quantity = details?.newProduct?.currentStock || 0;
      entry.unit = details?.newProduct?.unit || '个';
      entry.notes = `新增产品「${productName}」，初始库存 ${entry.quantity} ${entry.unit}`;
      break;

    case 'PRODUCT_UPDATE':
      // 检查是否有库存变动
      const stockChange = details?.changedFields?.currentStock;
      if (stockChange) {
        const oldStock = Number(stockChange.old) || 0;
        const newStock = Number(stockChange.new) || 0;
        entry.type = '库存编辑';
        entry.quantity = newStock - oldStock;
        entry.unit = details?.newProduct?.unit || '个';
        entry.notes = `库存调整：从 ${oldStock} 变更为 ${newStock} ${entry.unit}`;
        entry.oldStock = oldStock;
        entry.newStock = newStock;
      } else {
        // 没有库存变动，不记录到台账
        return null;
      }
      break;

    case 'TRANSACTION_ADD':
      entry.type = details?.transaction?.type === '入库' ? '入库' : '出库';
      entry.quantity = details?.transaction?.quantity || 0;
      entry.unit = details?.transaction?.unit || '个';
      entry.notes = details?.summary || `${entry.type} ${entry.quantity} ${entry.unit}`;
      entry.oldStock = details?.stockChange?.oldStock;
      entry.newStock = details?.stockChange?.newStock;
      break;

    case 'TRANSACTION_REVERSE':
      entry.type = `撤销${details?.transaction?.originalType || '交易'}`;
      entry.quantity = details?.transaction?.quantity || 0;
      entry.unit = details?.transaction?.unit || '个';
      entry.notes = details?.summary || `撤销${details?.transaction?.originalType || '交易'} ${entry.quantity} ${entry.unit}`;
      entry.oldStock = details?.stockRollback?.oldStock;
      entry.newStock = details?.stockRollback?.newStock;
      break;

    default:
      entry.type = '其他操作';
      entry.quantity = 0;
      entry.unit = '个';
      entry.notes = actionType;
  }

  // 确保数值类型和默认值
  entry.quantity = Number(entry.quantity) || 0;
  entry.unit = entry.unit || '个';
  if (entry.oldStock !== undefined) entry.oldStock = Number(entry.oldStock);
  if (entry.newStock !== undefined) entry.newStock = Number(entry.newStock);

  return entry;
};

/**
 * 计算台账条目的库存变动和变更后库存（正向推导，从最早到最新）
 * @param {Array} entries - 台账条目数组
 * @returns {Array} 补充了库存信息的台账条目数组（按时间倒序排列，最新在前）
 */
const calculateStockChain = (entries) => {
  if (!entries || entries.length === 0) {
    return [];
  }

  // 1. 按时间正序排列（从最早到最新）
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  const result = [];
  let previousStock = null; // 上一个事件后的库存

  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    const entryCopy = { ...entry };
    const quantityChange = calculateQuantityChange(entry);

    // 确定变更前库存
    let beforeStock = null;
    let afterStock = null;

    // 情况1：审计日志中已有明确的库存值（最高优先级）
    if (entry.oldStock !== undefined && entry.newStock !== undefined) {
      beforeStock = Number(entry.oldStock);
      afterStock = Number(entry.newStock);
    }
    // 情况2：这是第一条记录
    else if (i === 0) {
      // 如果是产品新增，变更前库存为0，变更后库存为初始库存
      if (entry.type === '产品新增') {
        beforeStock = 0;
        afterStock = Number(entry.quantity) || 0;
      } else {
        // 其他类型的第一条记录，假设变更前库存为0
        beforeStock = 0;
        afterStock = beforeStock + quantityChange;
      }
    }
    // 情况3：有上一条记录的库存信息
    else if (previousStock !== null) {
      beforeStock = previousStock;
      afterStock = beforeStock + quantityChange;
    }
    // 情况4：无法确定
    else {
      beforeStock = null;
      afterStock = null;
    }

    // 记录结果
    entryCopy.oldStock = beforeStock;
    entryCopy.newStock = afterStock;
    entryCopy.stockChange = quantityChange;

    // 添加变动方向标识
    if (quantityChange > 0) {
      entryCopy.changeDirection = 'increase';
    } else if (quantityChange < 0) {
      entryCopy.changeDirection = 'decrease';
    } else {
      entryCopy.changeDirection = 'none';
    }

    result.push(entryCopy);
    previousStock = afterStock;
  }

  // 返回倒序排列（最新在前）
  return result.reverse();
};

/**
 * 获取产品的库存台账历史
 * @param {Array} transactions - 所有交易记录数组
 * @param {Array} auditLogs - 所有审计日志数组
 * @param {string} productId - 产品ID
 * @param {string} productName - 产品名称（用于匹配交易记录）
 * @param {number} currentStock - 产品当前库存（必须提供）
 * @returns {Array} 该产品的库存台账历史记录（按时间倒序排列）
 */
export const getProductInventoryHistory = (transactions, auditLogs, productId, productName, currentStock) => {
  if (!transactions || !auditLogs) {
    console.warn('[inventoryHistoryHelpers] transactions 或 auditLogs 为空');
    return [];
  }

  // 1. 过滤出该产品的交易记录
  const productTransactions = transactions.filter(tx =>
    tx.productName === productName
  );

  // 2. 过滤出该产品的审计日志
  const productAuditLogs = auditLogs.filter(log =>
    log.productId === productId || log.productName === productName
  );

  // 3. 转换为台账条目
  const transactionEntries = productTransactions
    .map(tx => transactionToLedgerEntry(tx, productId))
    .filter(entry => entry !== null);

  const auditLogEntries = productAuditLogs
    .map(auditLogToLedgerEntry)
    .filter(entry => entry !== null);

  // 4. 合并所有条目
  const allEntries = [...transactionEntries, ...auditLogEntries];

  if (allEntries.length === 0) {
    return [];
  }

  // 5. 计算库存变动（使用反向推导，需要当前库存作为基准）
  const entriesWithStock = calculateStockChainWithCurrentStock(allEntries, currentStock);

  return entriesWithStock;
};

/**
 * 获取台账类型的中文显示标签和样式
 * @param {string} type - 台账类型
 * @returns {Object} 包含label和color的对象
 */
export const getLedgerTypeConfig = (type) => {
  const configs = {
    '入库': { label: '入库', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    '出库': { label: '出库', color: 'bg-rose-50 text-rose-700 border-rose-200' },
    '撤销入库': { label: '撤销入库', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    '撤销出库': { label: '撤销出库', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    '产品新增': { label: '产品新增', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    '库存编辑': { label: '库存编辑', color: 'bg-slate-50 text-slate-700 border-slate-200' },
    '其他操作': { label: '其他操作', color: 'bg-slate-50 text-slate-700 border-slate-200' }
  };

  return configs[type] || { label: type, color: 'bg-slate-50 text-slate-700 border-slate-200' };
};

/**
 * 计算台账条目的库存变动链（反向推导，从当前库存向历史推导）
 * @param {Array} entries - 台账条目数组（原始顺序，可能未排序）
 * @param {number} currentStock - 产品当前库存
 * @returns {Array} 补充了库存信息的台账条目数组（按时间倒序排列，最新在前）
 */
const calculateStockChainWithCurrentStock = (entries, currentStock) => {
  if (!entries || entries.length === 0) {
    return [];
  }

  // 1. 按时间倒序排列（最新在前）以便反向推导
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  // 2. 反向推导：从当前库存开始，逐步计算每个事件前后的库存
  let runningStock = currentStock;
  const entriesWithStock = [];

  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    const entryCopy = { ...entry };
    const quantityChange = calculateQuantityChange(entry);

    // 确定变更后库存和变更前库存
    let afterStock = null;
    let beforeStock = null;

    // 情况1：审计日志中已有明确的库存值（最高优先级）
    const hasExplicitValues = entry.oldStock !== undefined && entry.newStock !== undefined;
    if (hasExplicitValues) {
      // 如果明确的新库存与当前运行库存一致，采用明确值
      // 允许微小误差（例如浮点数计算）
      if (Math.abs(entry.newStock - runningStock) <= 1) {
        afterStock = entry.newStock;
        beforeStock = entry.oldStock;
        runningStock = entry.oldStock;
      } else {
        // 如果不一致，仍采用明确值，但调整 runningStock 以保持连续性
        // 这表示明确值可能来自不同的库存基准，我们尊重明确值
        afterStock = entry.newStock;
        beforeStock = entry.oldStock;
        runningStock = entry.oldStock;
      }
    }
    // 情况2：产品新增事件，通常没有明确值，但有初始库存 quantity
    else if (entry.type === '产品新增') {
      // 产品新增：变更前库存为0，变更后库存为初始库存
      beforeStock = 0;
      afterStock = entry.quantity || 0;
      runningStock = beforeStock;
    }
    // 情况3：普通事件，没有明确值
    else {
      afterStock = runningStock;
      beforeStock = afterStock - quantityChange;
      runningStock = beforeStock;
    }

    // 确保库存不为负数（保护性逻辑）
    if (beforeStock !== null && beforeStock < 0) {
      console.warn(`[inventoryHistoryHelpers] 计算出负库存，事件ID: ${entry.id}, beforeStock: ${beforeStock}`);
      // 不修正，保持计算值，UI会显示负值（可能表示数据异常）
    }

    // 记录结果
    entryCopy.oldStock = beforeStock;
    entryCopy.newStock = afterStock;
    entryCopy.stockChange = quantityChange;

    // 添加变动方向标识
    if (quantityChange > 0) {
      entryCopy.changeDirection = 'increase';
    } else if (quantityChange < 0) {
      entryCopy.changeDirection = 'decrease';
    } else {
      entryCopy.changeDirection = 'none';
    }

    entriesWithStock.push(entryCopy);
  }

  // 3. 将结果反转回时间倒序（最新在前）
  return entriesWithStock.reverse();
};

/**
 * 格式化台账时间显示
 * @param {string} timestamp - 时间戳字符串
 * @returns {string} 格式化后的时间
 */
export const formatLedgerTime = (timestamp) => {
  if (!timestamp) return '';

  try {
    // 如果已经包含秒数，直接显示
    if (timestamp.includes(':')) {
      const timePart = timestamp.split(' ')[1] || '';
      const hasSeconds = timePart.split(':').length === 3;

      if (hasSeconds) {
        // 格式: YYYY-MM-DD HH:MM:SS
        return timestamp;
      } else {
        // 格式: YYYY-MM-DD HH:MM
        return `${timestamp}:00`;
      }
    }

    return timestamp;
  } catch {
    return timestamp;
  }
};