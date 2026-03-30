// 产品数据服务 - 轻量实现，不引入复杂异步逻辑
import { products as initialProducts } from '../constants/mockData';

// 可变的产品列表，初始为 mock 数据，支持运行时更新
let products = [...initialProducts];

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