// 产品数据服务 - 轻量实现，不引入复杂异步逻辑
import { products } from '../constants/mockData';

/**
 * 获取所有产品列表
 * @returns {Array} 产品数组
 */
export const getAllProducts = () => {
  return [...products]; // 返回副本，避免直接修改原始数据
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
 * 添加新产品（当前阶段为占位实现）
 * @param {Object} productData - 新产品数据
 * @returns {Object} 添加的产品（带模拟 ID）
 */
export const addProduct = (productData) => {
  console.log('[productService] 添加产品:', productData);
  // 模拟添加操作，实际应生成唯一ID并加入数组
  const newProduct = {
    id: `prod-new-${Date.now()}`,
    ...productData
  };
  console.log('[productService] 模拟添加的产品:', newProduct);
  return newProduct;
};

/**
 * 更新产品信息（当前阶段为占位实现）
 * @param {string} id - 产品 ID
 * @param {Object} updates - 要更新的字段
 * @returns {Object|null} 更新后的产品或 null
 */
export const updateProduct = (id, updates) => {
  console.log('[productService] 更新产品:', id, updates);
  const product = getProductById(id);
  if (!product) {
    console.warn(`[productService] 未找到产品 ID: ${id}`);
    return null;
  }
  const updated = { ...product, ...updates };
  console.log('[productService] 模拟更新后的产品:', updated);
  return updated;
};

/**
 * 删除产品（当前阶段为占位实现）
 * @param {string} id - 产品 ID
 * @returns {boolean} 是否成功
 */
export const deleteProduct = (id) => {
  console.log('[productService] 删除产品:', id);
  const product = getProductById(id);
  if (!product) {
    console.warn(`[productService] 未找到产品 ID: ${id}`);
    return false;
  }
  console.log(`[productService] 模拟删除产品: ${product.name} (${product.sku})`);
  return true;
};