// 产品数据服务 - 轻量实现，不引入复杂异步逻辑
import { products as initialProducts, transactionRecords as initialTransactionRecords } from '../constants/mockData';

// 可变的产品列表，初始为 mock 数据，支持运行时更新
let products = [...initialProducts];

// 可变的交易记录列表，初始为 mock 数据，支持运行时更新
let transactions = [...initialTransactionRecords];

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
  const updatedProduct = { ...products[index], ...updates };
  products[index] = updatedProduct;
  console.log('[productService] 产品已更新:', updatedProduct);
  return updatedProduct;
};

/**
 * 删除产品
 * @param {string} id - 产品 ID
 * @returns {boolean} 是否成功
 */
export const deleteProduct = (id) => {
  console.log('[productService] 删除产品:', id);
  const initialLength = products.length;
  products = products.filter(product => product.id !== id);
  const deleted = initialLength > products.length;
  if (deleted) {
    console.log(`[productService] 产品已删除: ID ${id}`);
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

  return newTransaction;
};