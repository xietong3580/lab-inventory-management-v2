// 产品筛选工具函数

/**
 * 关键词搜索产品（SKU 优先级排序）
 *
 * 搜索优先级：
 *   SKU 完全匹配 > SKU 开头匹配 > SKU 包含匹配 > 产品名称包含匹配 > 品牌包含匹配
 *   specification / supplier 作为低优先级辅助匹配
 *   notes 不参与搜索
 *
 * @param {Array} products - 产品数组
 * @param {string} keyword - 搜索关键词（货号/SKU/产品名称/品牌）
 * @returns {Array} 匹配的产品数组（按匹配度降序）
 */
export const searchProducts = (products, keyword) => {
  if (!keyword || !keyword.trim()) return [];

  const searchTerm = keyword.trim().toLowerCase();
  const scored = [];

  for (const product of products) {
    const sku = (product.sku || '').toLowerCase();
    const name = (product.name || '').toLowerCase();
    const brand = (product.brand || '').toLowerCase();
    let score = 0;

    // SKU 完全匹配（最高优先级）
    if (sku === searchTerm) {
      score = 100;
    } else if (sku.startsWith(searchTerm)) {
      // SKU 开头匹配
      score = 80;
    } else if (sku.includes(searchTerm)) {
      // SKU 包含匹配
      score = 60;
    } else if (name.includes(searchTerm)) {
      // 产品名称包含匹配
      score = 40;
    } else if (brand.includes(searchTerm)) {
      // 品牌包含匹配
      score = 20;
    }

    // 辅助低优先级匹配（specification / supplier）
    if (score === 0) {
      const spec = (product.specification || '').toLowerCase();
      const supplier = (product.supplier || '').toLowerCase();
      if (spec.includes(searchTerm) || supplier.includes(searchTerm)) {
        score = 10;
      }
    }

    if (score > 0) {
      scored.push({ product, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(item => item.product);
};

/**
 * 筛选产品列表（含 SKU 优先级搜索、库位筛选、品牌筛选）
 *
 * 搜索优先级：
 *   SKU 完全匹配 > SKU 开头匹配 > SKU 包含匹配 > 产品名称包含匹配
 *   brand / specification / supplier 不参与主搜索（仅作为辅助关键词）
 *   notes 不参与搜索
 *
 * @param {Array} products - 产品数组
 * @param {string} keyword - 搜索关键词（货号/SKU/产品名称）
 * @param {string} category - 分类筛选条件，'all' 表示全部
 * @param {string} status - 库存状态筛选：'all'（全部）、'正常'、'低库存'
 * @param {number|null} minStock - 当前库存最小值（可为空或null）
 * @param {number|null} maxStock - 当前库存最大值（可为空或null）
 * @param {string} location - 库位筛选条件，'all' 或空字符串表示全部
 * @param {string} brand - 品牌筛选条件，'all' 或空字符串表示全部
 * @returns {Array} 筛选后的产品数组（按搜索匹配度排序）
 */
export const filterProducts = (
  products,
  keyword = '',
  category = 'all',
  status = 'all',
  minStock = null,
  maxStock = null,
  location = 'all',
  brand = 'all',
  verificationFilter = 'all'
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

  // 3. 按库存区间筛选
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

  // 4. 按库位筛选
  if (location && location !== 'all' && location !== '') {
    filtered = filtered.filter(product => product.location === location);
  }

  // 5. 按品牌筛选
  if (brand && brand !== 'all' && brand !== '') {
    filtered = filtered.filter(product => product.brand === brand);
  }

  // 5b. 按核对状态筛选
  if (verificationFilter && verificationFilter !== 'all') {
    filtered = filtered.filter(product => {
      const nameOk = product.name && String(product.name).trim();
      const skuOk = product.sku && String(product.sku).trim();
      const stockOk = !(typeof product.currentStock === 'number' && product.currentStock < 0);
      const min = product.minStock;
      const minOk = !(min === '' || min === null || min === undefined || isNaN(Number(min)) || Number(min) < 0);
      const categoryOk = product.category && String(product.category).trim();
      const locationOk = product.location && String(product.location).trim();
      const unitOk = product.unit && String(product.unit).trim();

      if (verificationFilter === '需核对') {
        return !nameOk || !skuOk || !stockOk || !minOk;
      }
      if (verificationFilter === '建议补充') {
        return nameOk && skuOk && stockOk && minOk && (!categoryOk || !locationOk || !unitOk);
      }
      if (verificationFilter === '信息完整') {
        return nameOk && skuOk && stockOk && minOk && categoryOk && locationOk && unitOk;
      }
      return true;
    });
  }

  // 6. 按关键词搜索（复用 searchProducts 评分排序）
  if (keyword.trim()) {
    return searchProducts(filtered, keyword);
  }

  // 无搜索关键词时：按最近更新/新增靠前排列
  sortProductsByRecent(filtered);

  return filtered;
};

/**
 * 按最近更新/新增靠前排序（原地排序）
 *
 * 优先使用 updatedAt，其次 createdAt。
 * 如果字段都不存在，保持原有顺序，避免异常。
 *
 * @param {Array} products - 产品数组
 */
const sortProductsByRecent = (products) => {
  products.sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt || '';
    const bTime = b.updatedAt || b.createdAt || '';
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return (bTime > aTime ? 1 : bTime < aTime ? -1 : 0);
  });
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
  maxStock,
  location,
  brand,
  verificationFilter
}) => {
  return Boolean(
    keyword ||
    (category && category !== 'all') ||
    (status && status !== 'all') ||
    (minStock !== null && minStock !== '') ||
    (maxStock !== null && maxStock !== '') ||
    (location && location !== 'all' && location !== '') ||
    (brand && brand !== 'all' && brand !== '') ||
    (verificationFilter && verificationFilter !== 'all')
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
  maxStock: '',
  location: 'all',
  brand: 'all'
});
