// 产品筛选工具函数

/**
 * 筛选产品列表
 * @param {Array} products - 产品数组
 * @param {string} keyword - 搜索关键词（产品名称、SKU、分类）
 * @param {string} category - 分类筛选条件，'all' 表示全部
 * @param {string} status - 库存状态筛选：'all'（全部）、'正常'、'低库存'
 * @param {number|null} minStock - 当前库存最小值（可为空或null）
 * @param {number|null} maxStock - 当前库存最大值（可为空或null）
 * @returns {Array} 筛选后的产品数组
 */
export const filterProducts = (
  products,
  keyword = '',
  category = 'all',
  status = 'all',
  minStock = null,
  maxStock = null
) => {
  let filtered = [...products];

  // 1. 按分类筛选
  if (category && category !== 'all') {
    filtered = filtered.filter(product => product.category === category);
  }

  // 2. 按库存状态筛选
  if (status && status !== 'all') {
    filtered = filtered.filter(product => product.status === status);
  }

  // 3. 按当前库存区间筛选
  if (minStock !== null && minStock !== '') {
    const min = Number(minStock);
    if (!isNaN(min)) {
      filtered = filtered.filter(product => {
        const stock = Number(product.currentStock) || 0;
        return stock >= min;
      });
    }
  }

  if (maxStock !== null && maxStock !== '') {
    const max = Number(maxStock);
    if (!isNaN(max)) {
      filtered = filtered.filter(product => {
        const stock = Number(product.currentStock) || 0;
        return stock <= max;
      });
    }
  }

  // 4. 按关键词搜索（最后执行，因为关键词搜索涉及字符串匹配，放在后面可减少匹配次数）
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
 * 检查是否有活跃的筛选条件
 * @param {Object} filterParams - 筛选参数对象
 * @returns {boolean} 是否有活跃筛选
 */
export const hasActiveFilters = ({
  keyword,
  category,
  status,
  minStock,
  maxStock
}) => {
  return Boolean(
    keyword ||
    (category && category !== 'all') ||
    (status && status !== 'all') ||
    (minStock !== null && minStock !== '') ||
    (maxStock !== null && maxStock !== '')
  );
};

/**
 * 重置所有筛选条件到默认值
 * @returns {Object} 默认筛选状态
 */
export const getDefaultFilterState = () => ({
  keyword: '',
  category: 'all',
  status: 'all',
  minStock: '',
  maxStock: ''
});