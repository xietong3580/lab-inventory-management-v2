// 产品数据服务 - 轻量实现，不引入复杂异步逻辑
import { products as initialProducts, transactionRecords as initialTransactionRecords } from '../constants/mockData';
import { getProductInventoryHistory } from '../utils/inventoryHistoryHelpers';

// 本地存储键定义
const STORAGE_KEYS = {
  PRODUCTS: 'lab-inventory-v2-products',
  TRANSACTIONS: 'lab-inventory-v2-transactions',
  AUDIT_LOGS: 'lab-inventory-v2-audit-logs'
};

/**
 * 从 localStorage 加载数据，如果不存在或解析失败则使用初始数据
 * @param {string} key - 存储键
 * @param {Array} initialData - 初始数据
 * @returns {Array} 加载的数据数组
 */
const loadFromStorage = (key, initialData) => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        console.log(`[productService] 从 localStorage 加载 ${key}:`, parsed.length, '条记录');
        return parsed;
      }
    }
  } catch (error) {
    console.error(`[productService] 加载 ${key} 失败:`, error);
  }

  console.log(`[productService] 使用初始 mock 数据: ${key}`);
  return [...initialData];
};

/**
 * 保存数据到 localStorage
 * @param {string} key - 存储键
 * @param {Array} data - 要保存的数据
 */
const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`[productService] 保存 ${key}:`, data.length, '条记录');
  } catch (error) {
    console.error(`[productService] 保存 ${key} 失败:`, error);
  }
};

// 从 localStorage 或初始 mock 数据加载产品数据
let products = loadFromStorage(STORAGE_KEYS.PRODUCTS, initialProducts);

// 从 localStorage 或初始 mock 数据加载交易记录数据
let transactions = loadFromStorage(STORAGE_KEYS.TRANSACTIONS, initialTransactionRecords);

// 从 localStorage 或初始空数组加载审计日志数据
let auditLogs = loadFromStorage(STORAGE_KEYS.AUDIT_LOGS, []);

/**
 * 获取所有产品列表
 * @returns {Array} 产品数组
 */
export const getAllProducts = () => {
  return [...products]; // 返回副本，避免直接修改内部数据
};

/**
 * 筛选产品列表
 * @param {Array} productList - 要筛选的产品列表
 * @param {string} keyword - 搜索关键词（产品名称、SKU、分类）
 * @param {string} category - 分类筛选条件，'all' 表示全部
 * @returns {Array} 筛选后的产品数组
 */
export const filterProducts = (productList, keyword = '', category = 'all') => {
  let filtered = [...productList];

  // 1. 按分类筛选
  if (category && category !== 'all') {
    filtered = filtered.filter(product => product.category === category);
  }

  // 2. 按关键词搜索
  if (keyword.trim()) {
    const searchTerm = keyword.trim().toLowerCase();
    filtered = filtered.filter(product =>
      product.name.toLowerCase().includes(searchTerm) ||
      product.sku.toLowerCase().includes(searchTerm) ||
      product.category.toLowerCase().includes(searchTerm)
    );
  }

  return filtered;
};

/**
 * 按 ID 查找产品
 * @param {string} id - 产品 ID
 * @returns {Object|null} 产品对象或 null
 */
export const getProductById = (id) => {
  return products.find(product => product.id === id) || null;
};

/**
 * 添加新产品
 * @param {Object} productData - 新产品数据
 * @returns {Object} 添加的产品（带生成的 ID）
 */
export const addProduct = (productData) => {
  console.log('[productService] 添加产品:', productData);
  const newProduct = {
    id: `prod-${Date.now()}`,
    ...productData
  };
  products.push(newProduct);
  console.log('[productService] 产品已添加:', newProduct);

  // 自动保存到 localStorage
  saveToStorage(STORAGE_KEYS.PRODUCTS, products);

  // 记录审计日志
  logAuditAction(
    'PRODUCT_ADD',
    newProduct.name,
    newProduct.id,
    '',
    {
      newProduct: {
        name: newProduct.name,
        sku: newProduct.sku,
        category: newProduct.category,
        currentStock: newProduct.currentStock,
        minStock: newProduct.minStock,
        unit: newProduct.unit,
        location: newProduct.location || ''
      }
    }
  );

  return newProduct;
};

/**
 * 更新产品信息
 * @param {string} id - 产品 ID
 * @param {Object} updates - 要更新的字段
 * @returns {Object|null} 更新后的产品或 null
 */
export const updateProduct = (id, updates) => {
  console.log('[productService] 更新产品:', id, updates);
  const index = products.findIndex(product => product.id === id);
  if (index === -1) {
    console.warn(`[productService] 未找到产品 ID: ${id}`);
    return null;
  }

  // 保存更新前的产品状态（用于审计日志）
  const oldProduct = { ...products[index] };

  const updatedProduct = { ...oldProduct, ...updates };
  products[index] = updatedProduct;
  console.log('[productService] 产品已更新:', updatedProduct);

  // 自动保存到 localStorage
  saveToStorage(STORAGE_KEYS.PRODUCTS, products);

  // 记录审计日志
  // 计算变化的字段
  const changedFields = {};
  Object.keys(updates).forEach(key => {
    if (JSON.stringify(oldProduct[key]) !== JSON.stringify(updatedProduct[key])) {
      changedFields[key] = {
        old: oldProduct[key],
        new: updatedProduct[key]
      };
    }
  });

  logAuditAction(
    'PRODUCT_UPDATE',
    updatedProduct.name,
    updatedProduct.id,
    '',
    {
      oldProduct: {
        name: oldProduct.name,
        sku: oldProduct.sku,
        category: oldProduct.category,
        currentStock: oldProduct.currentStock,
        minStock: oldProduct.minStock,
        unit: oldProduct.unit,
        location: oldProduct.location || ''
      },
      newProduct: {
        name: updatedProduct.name,
        sku: updatedProduct.sku,
        category: updatedProduct.category,
        currentStock: updatedProduct.currentStock,
        minStock: updatedProduct.minStock,
        unit: updatedProduct.unit,
        location: updatedProduct.location || ''
      },
      changedFields,
      updateSummary: Object.keys(changedFields).length > 0
        ? `更新了 ${Object.keys(changedFields).length} 个字段: ${Object.keys(changedFields).join(', ')}`
        : '无实质性字段变化'
    }
  );

  return updatedProduct;
};

/**
 * 删除产品
 * @param {string} id - 产品 ID
 * @returns {boolean} 是否成功
 */
export const deleteProduct = (id) => {
  console.log('[productService] 删除产品:', id);

  // 查找要删除的产品（用于审计日志）
  const productToDelete = products.find(product => product.id === id);

  const initialLength = products.length;
  products = products.filter(product => product.id !== id);
  const deleted = initialLength > products.length;

  if (deleted) {
    console.log(`[productService] 产品已删除: ID ${id}`);
    // 自动保存到 localStorage
    saveToStorage(STORAGE_KEYS.PRODUCTS, products);

    // 记录审计日志
    if (productToDelete) {
      logAuditAction(
        'PRODUCT_DELETE',
        productToDelete.name,
        productToDelete.id,
        '',
        {
          deletedProduct: {
            name: productToDelete.name,
            sku: productToDelete.sku,
            category: productToDelete.category,
            currentStock: productToDelete.currentStock,
            minStock: productToDelete.minStock,
            unit: productToDelete.unit,
            location: productToDelete.location || '',
            lastUpdated: productToDelete.lastUpdated || ''
          },
          deletionTime: getCurrentDateTimeWithSeconds()
        }
      );
    }
  } else {
    console.warn(`[productService] 未找到产品 ID: ${id}`);
  }

  return deleted;
};

/**
 * 根据库存数量计算产品状态
 * @param {Object} product - 产品对象
 * @returns {string} '正常' 或 '低库存'
 */
export const calculateProductStatus = (product) => {
  const current = Number(product.currentStock) || 0;
  const min = Number(product.minStock) || 0;
  // 当 currentStock <= minStock 时标记为低库存
  return current <= min ? '低库存' : '正常';
};

/**
 * 获取所有产品，并确保状态根据库存数量自动计算
 * @returns {Array} 产品数组（状态已自动计算）
 */
export const getProductsWithCalculatedStatus = () => {
  const products = getAllProducts();
  return products.map(product => ({
    ...product,
    status: calculateProductStatus(product)
  }));
};

/**
 * 获取所有交易记录
 * @returns {Array} 交易记录数组
 */
export const getTransactions = () => {
  return [...transactions]; // 返回副本，避免直接修改内部数据
};

/**
 * 获取所有审计日志记录
 * @returns {Array} 审计日志数组（按时间倒序排列，最新在前）
 */
export const getAuditLogs = () => {
  // 返回副本并按时间倒序排列（最新日志在前）
  return [...auditLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

/**
 * 获取当前日期时间字符串（格式：YYYY-MM-DD HH:MM）
 * @returns {string} 格式化日期时间
 */
const getCurrentDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

/**
 * 获取当前日期时间字符串（格式：YYYY-MM-DD HH:MM:SS）
 * @returns {string} 包含秒数的格式化日期时间
 */
const getCurrentDateTimeWithSeconds = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 记录审计日志
 * @param {string} actionType - 操作类型
 * @param {string} productName - 产品名称（如适用）
 * @param {string} productId - 产品ID（如适用）
 * @param {string} operator - 操作人
 * @param {Object} details - 操作详情
 */
const logAuditAction = (actionType, productName, productId, operator, details) => {
  const logEntry = {
    id: `log-${Date.now()}`,
    actionType,
    productName: productName || '',
    productId: productId || '',
    operator: operator || '',
    timestamp: getCurrentDateTimeWithSeconds(),
    details
  };

  console.log('[productService] 记录审计日志:', logEntry);

  // 添加到日志数组开头（最新在前）
  auditLogs.unshift(logEntry);

  // 自动保存到 localStorage
  saveToStorage(STORAGE_KEYS.AUDIT_LOGS, auditLogs);
};

/**
 * 添加交易记录并自动更新产品库存
 * @param {Object} transactionData - 交易数据
 * @param {string} transactionData.productId - 产品 ID
 * @param {'入库'|'出库'} transactionData.type - 交易类型
 * @param {number} transactionData.quantity - 数量
 * @param {string} transactionData.operator - 操作人
 * @param {string} [transactionData.notes] - 备注
 * @returns {Object} 创建的交易记录
 * @throws {Error} 如果产品不存在或库存不足
 */
export const addTransaction = (transactionData) => {
  console.log('[productService] 添加交易记录:', transactionData);

  const { productId, type, quantity, operator, notes = '' } = transactionData;

  // 1. 验证产品存在
  const product = getProductById(productId);
  if (!product) {
    throw new Error(`产品不存在 (ID: ${productId})`);
  }

  // 2. 校验数量有效性
  if (!quantity || quantity <= 0) {
    throw new Error('数量必须大于0');
  }

  // 3. 出库校验：库存不能为负数
  if (type === '出库') {
    if (product.currentStock < quantity) {
      throw new Error(`库存不足。当前库存: ${product.currentStock} ${product.unit}，出库数量: ${quantity} ${product.unit}`);
    }
  }

  // 4. 计算库存变化
  const stockDelta = type === '入库' ? quantity : -quantity;
  const newStock = product.currentStock + stockDelta;

  // 5. 更新产品库存
  const updatedProduct = updateProduct(productId, {
    currentStock: newStock,
    lastUpdated: getCurrentDateTime().split(' ')[0] // 只取日期部分
  });

  if (!updatedProduct) {
    throw new Error('更新产品库存失败');
  }

  // 6. 创建交易记录
  const newTransaction = {
    id: `txn-${Date.now()}`,
    productName: product.name,
    type,
    quantity,
    unit: product.unit,
    date: getCurrentDateTime(),
    operator,
    status: 'completed',
    notes: notes || ''
  };

  // 7. 保存交易记录
  transactions.unshift(newTransaction); // 添加到数组开头，便于最新记录显示在前面
  console.log('[productService] 交易记录已添加:', newTransaction);

  // 自动保存交易记录到 localStorage
  saveToStorage(STORAGE_KEYS.TRANSACTIONS, transactions);

  // 记录审计日志
  logAuditAction(
    'TRANSACTION_ADD',
    product.name,
    product.id,
    operator,
    {
      transaction: {
        id: newTransaction.id,
        type: newTransaction.type,
        quantity: newTransaction.quantity,
        unit: newTransaction.unit,
        date: newTransaction.date,
        status: newTransaction.status,
        notes: newTransaction.notes || ''
      },
      stockChange: {
        oldStock: product.currentStock,
        newStock: updatedProduct.currentStock,
        delta: stockDelta,
        direction: stockDelta > 0 ? '增加' : '减少'
      },
      summary: `${type} ${quantity} ${product.unit}，库存从 ${product.currentStock} 变更为 ${updatedProduct.currentStock} ${product.unit}`
    }
  );

  return newTransaction;
};

/**
 * 撤销交易记录并回滚库存
 * @param {string} transactionId - 交易记录 ID
 * @param {string} [reversedBy] - 撤销操作人，默认 '系统'
 * @returns {Object} 更新后的交易记录
 * @throws {Error} 如果交易不存在、已撤销、或库存回滚失败
 */
export const reverseTransaction = (transactionId, reversedBy = '系统') => {
  console.log('[productService] 撤销交易记录:', transactionId, '操作人:', reversedBy);

  // 1. 查找交易记录
  const transactionIndex = transactions.findIndex(t => t.id === transactionId);
  if (transactionIndex === -1) {
    throw new Error(`未找到交易记录 (ID: ${transactionId})，可能已被删除或ID不正确`);
  }

  const transaction = transactions[transactionIndex];

  // 2. 验证交易状态
  if (transaction.status !== 'completed') {
    if (transaction.status === 'reversed') {
      throw new Error(`此交易记录状态已是"已撤销"，不能重复撤销 (ID: ${transactionId})`);
    }
    throw new Error(`只能撤销状态为"已完成"的交易记录。当前状态: ${transaction.status} (ID: ${transactionId})`);
  }

  // 3. 查找对应产品
  const product = getProductByName(transaction.productName);
  if (!product) {
    throw new Error(
      `无法找到对应产品：交易记录中的产品"${transaction.productName}"不存在。\n` +
      `可能原因：产品已被删除，或产品名称不匹配。\n` +
      `请检查产品管理页面确认产品状态。`
    );
  }

  // 4. 计算回滚库存量
  // 原类型为'入库' → 撤销时库存减少 quantity
  // 原类型为'出库' → 撤销时库存增加 quantity
  const stockDelta = transaction.type === '入库' ? -transaction.quantity : transaction.quantity;
  const newStock = product.currentStock + stockDelta;

  // 5. 安全校验：撤销入库时，确保当前库存足够扣减（不能为负）
  if (newStock < 0) {
    throw new Error(
      `库存安全规则不允许撤销：撤销此${transaction.type}操作会导致库存不足。\n` +
      `当前库存: ${product.currentStock} ${product.unit}，撤销后将减少 ${transaction.quantity} ${product.unit}，\n` +
      `库存将变为 ${newStock} ${product.unit}（不能为负数）。\n` +
      `请先调整库存或联系管理员。`
    );
  }

  // 6. 更新产品库存
  const updatedProduct = updateProduct(product.id, {
    currentStock: newStock,
    lastUpdated: getCurrentDateTime().split(' ')[0] // 只取日期部分
  });

  if (!updatedProduct) {
    throw new Error('更新产品库存失败，撤销操作中止');
  }

  // 7. 更新交易记录状态
  const updatedTransaction = {
    ...transaction,
    status: 'reversed',
    reversedAt: getCurrentDateTime(),
    reversedBy
  };

  transactions[transactionIndex] = updatedTransaction;
  console.log('[productService] 交易记录已撤销:', updatedTransaction);

  // 8. 保存更新后的交易记录到 localStorage
  saveToStorage(STORAGE_KEYS.TRANSACTIONS, transactions);

  // 9. 记录审计日志
  logAuditAction(
    'TRANSACTION_REVERSE',
    product.name,
    product.id,
    reversedBy,
    {
      transaction: {
        id: transaction.id,
        originalType: transaction.type,
        quantity: transaction.quantity,
        unit: transaction.unit,
        originalDate: transaction.date,
        originalOperator: transaction.operator,
        originalStatus: transaction.status,
        notes: transaction.notes || ''
      },
      reversalInfo: {
        reversedAt: updatedTransaction.reversedAt,
        reversedBy: updatedTransaction.reversedBy,
        newStatus: updatedTransaction.status
      },
      stockRollback: {
        oldStock: product.currentStock,
        newStock: updatedProduct.currentStock,
        delta: stockDelta,
        direction: stockDelta > 0 ? '增加' : '减少',
        rollbackType: transaction.type === '入库' ? '撤销入库，库存减少' : '撤销出库，库存增加'
      },
      summary: `撤销${transaction.type}交易 ${transaction.quantity} ${product.unit}，库存从 ${product.currentStock} 回滚为 ${updatedProduct.currentStock} ${product.unit}`
    }
  );

  return updatedTransaction;
};

/**
 * 根据产品名称查找产品（用于撤销交易时匹配产品）
 * @param {string} productName - 产品名称
 * @returns {Object|null} 产品对象或 null
 */
const getProductByName = (productName) => {
  return products.find(product => product.name === productName) || null;
};

/**
 * 重置本地存储数据到初始 mock 数据
 * @returns {Object} 重置结果
 */
export const resetStorageData = () => {
  try {
    // 重置内存数据到初始状态
    products = [...initialProducts];
    transactions = [...initialTransactionRecords];
    auditLogs = [];

    // 保存到 localStorage
    saveToStorage(STORAGE_KEYS.PRODUCTS, products);
    saveToStorage(STORAGE_KEYS.TRANSACTIONS, transactions);
    saveToStorage(STORAGE_KEYS.AUDIT_LOGS, auditLogs);

    // 记录系统重置审计日志
    logAuditAction(
      'SYSTEM_RESET',
      '',
      '',
      '',
      {
        resetTime: getCurrentDateTimeWithSeconds(),
        initialProductsCount: products.length,
        initialTransactionsCount: transactions.length,
        summary: '系统数据已重置为初始 mock 数据'
      }
    );

    console.log('[productService] 本地存储数据已重置为初始 mock 数据');

    return {
      success: true,
      message: '本地存储数据已重置为初始 mock 数据',
      productsCount: products.length,
      transactionsCount: transactions.length,
      auditLogsCount: auditLogs.length
    };
  } catch (error) {
    console.error('[productService] 重置本地存储数据失败:', error);
    return {
      success: false,
      message: `重置失败: ${error.message}`,
      error: error
    };
  }
};

/**
 * 获取产品的库存台账历史记录
 * @param {string} productId - 产品ID
 * @returns {Array} 该产品的库存台账历史记录（按时间倒序排列，最新在前）
 */
export const getProductInventoryLedger = (productId) => {
  console.log('[productService] 获取产品库存台账历史:', productId);

  // 1. 获取产品信息
  const product = getProductById(productId);
  if (!product) {
    console.warn(`[productService] 未找到产品 ID: ${productId}`);
    return [];
  }

  // 2. 获取所有交易记录和审计日志
  const allTransactions = getTransactions();
  const allAuditLogs = getAuditLogs();

  // 3. 调用helper函数生成台账历史
  const ledgerHistory = getProductInventoryHistory(
    allTransactions,
    allAuditLogs,
    productId,
    product.name,
    product.currentStock
  );

  console.log(`[productService] 生成台账历史记录 ${ledgerHistory.length} 条`);
  return ledgerHistory;
};