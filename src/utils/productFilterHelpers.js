// 产品筛选工具函数

/**
 * 产品核对状态计算（纯函数，基于现有字段）
 * 返回值：'信息完整' | '建议补充' | '需核对'
 * 注意：采购价、售价不影响核对状态，仅用于弹窗温和提示
 */
export const calculateVerificationStatus = (product) => {
  // 需核对：缺少核心字段或数据异常
  if (!product.name || !String(product.name).trim()) return '需核对';
  if (!product.sku || !String(product.sku).trim()) return '需核对';
  if (typeof product.currentStock === 'number' && product.currentStock < 0) return '需核对';
  const min = product.minStock;
  if (min === '' || min === null || min === undefined || isNaN(Number(min)) || Number(min) < 0) return '需核对';

  // 建议补充：缺少常用管理字段（不含价格）
  if (!product.category || !String(product.category).trim()) return '建议补充';
  if (!product.location || !String(product.location).trim()) return '建议补充';
  if (!product.unit || !String(product.unit).trim()) return '建议补充';

  return '信息完整';
};

/**
 * 关键词搜索产品（多关键词 AND + 优先级排序）
 *
 * 搜索字段：SKU / 产品名称 / 品牌 / 规格 / 供应商
 *   notes 不参与搜索
 *
 * 规则：
 *   - 输入 trim + 连续空格归一化后按空格拆分为多个关键词
 *   - 多个关键词之间采用 AND（每个关键词必须命中至少一个字段）
 *   - 英文大小写不敏感
 *   - null / undefined 字段安全处理
 *
 * 单关键词匹配优先级（用于排序）：
 *   SKU 完全匹配 > SKU 开头匹配 > SKU 包含匹配 > 产品名称包含匹配 > 品牌包含匹配
 *   specification / supplier 作为低优先级辅助匹配
 *
 * @param {Array} products - 产品数组
 * @param {string} keyword - 搜索关键词
 * @returns {Array} 匹配的产品数组（按匹配度降序）
 */
export const searchProducts = (products, keyword) => {
  if (!keyword || !keyword.trim()) return [];

  // 规范化：trim + 连续空格归一化 + 小写
  const normalized = keyword.trim().replace(/\s+/g, ' ').toLowerCase();
  const searchTerms = normalized.split(' ').filter(k => k.length > 0);

  if (searchTerms.length === 0) return [];

  const scored = [];

  for (const product of products) {
    let totalScore = 0;
    let allMatch = true;

    for (const term of searchTerms) {
      const sku = (product.sku || '').toLowerCase();
      const name = (product.name || '').toLowerCase();
      const brand = (product.brand || '').toLowerCase();
      const spec = (product.specification || '').toLowerCase();
      const supplier = (product.supplier || '').toLowerCase();
      let termScore = 0;

      // SKU 完全匹配（最高优先级）
      if (sku === term) {
        termScore = 100;
      } else if (sku.startsWith(term)) {
        // SKU 开头匹配
        termScore = 80;
      } else if (sku.includes(term)) {
        // SKU 包含匹配
        termScore = 60;
      } else if (name.includes(term)) {
        // 产品名称包含匹配
        termScore = 40;
      } else if (brand.includes(term)) {
        // 品牌包含匹配
        termScore = 20;
      } else if (spec.includes(term) || supplier.includes(term)) {
        // 辅助低优先级匹配（specification / supplier）
        termScore = 10;
      }

      if (termScore === 0) {
        allMatch = false;
        break;
      }
      totalScore += termScore;
    }

    if (allMatch) {
      scored.push({ product, score: totalScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(item => item.product);
};

/**
 * 筛选产品列表（含多关键词 AND 搜索、多选筛选）
 *
 * 搜索字段：SKU / 产品名称 / 品牌 / 规格 / 供应商
 *   notes 不参与搜索
 *
 * @param {Array} products - 产品数组
 * @param {string} keyword - 搜索关键词（SKU/产品名称/品牌/规格/供应商，多关键词 AND）
 * @param {string|string[]} categories - 库存分类，字符串 'all' 或字符串数组
 * @param {string} status - 库存状态筛选：'all'（全部）、'正常'、'低库存'
 * @param {number|null} minStock - 当前库存最小值（可为空或null）
 * @param {number|null} maxStock - 当前库存最大值（可为空或null）
 * @param {string|string[]} locations - 库位，字符串 'all' 或字符串数组
 * @param {string|string[]} brands - 品牌，字符串 'all' 或字符串数组
 * @param {string} verificationFilter - 核对状态筛选
 * @returns {Array} 筛选后的产品数组（按搜索匹配度排序）
 */
export const filterProducts = (
  products,
  keyword = '',
  categories = 'all',
  status = 'all',
  minStock = null,
  maxStock = null,
  locations = 'all',
  brands = 'all',
  verificationFilter = 'all',
  exclude = null
) => {
  let filtered = [...products];

  // ── Dimension filters (each can be excluded for facet computation) ──

  // 1. 按分类筛选（exclude='categories' 时跳过，用于计算分类候选）
  if (exclude !== 'categories') {
    if (Array.isArray(categories) && categories.length > 0) {
      filtered = filtered.filter(product => categories.includes(product.category));
    } else if (categories && categories !== 'all' && !Array.isArray(categories)) {
      filtered = filtered.filter(product => product.category === categories);
    }
  }

  // 2. 按库存状态筛选（全局条件，不可排除）
  if (status && status !== 'all') {
    filtered = filtered.filter(product => product.status === status);
  }

  // 3. 按库存区间筛选（全局条件，不可排除）
  const minNum = (minStock !== null && minStock !== '') ? Number(minStock) : NaN;
  const maxNum = (maxStock !== null && maxStock !== '') ? Number(maxStock) : NaN;
  if (!isNaN(minNum)) {
    filtered = filtered.filter(p => (Number(p.currentStock) || 0) >= minNum);
  }
  if (!isNaN(maxNum)) {
    filtered = filtered.filter(p => (Number(p.currentStock) || 0) <= maxNum);
  }

  // 4. 按库位筛选（exclude='locations' 时跳过）
  if (exclude !== 'locations') {
    if (Array.isArray(locations) && locations.length > 0) {
      filtered = filtered.filter(product => locations.includes(product.location));
    } else if (locations && locations !== 'all' && locations !== '' && !Array.isArray(locations)) {
      filtered = filtered.filter(product => product.location === locations);
    }
  }

  // 5. 按品牌筛选（exclude='brands' 时跳过）
  if (exclude !== 'brands') {
    if (Array.isArray(brands) && brands.length > 0) {
      filtered = filtered.filter(product => brands.includes(product.brand));
    } else if (brands && brands !== 'all' && brands !== '' && !Array.isArray(brands)) {
      filtered = filtered.filter(product => product.brand === brands);
    }
  }

  // 5b. 按核对状态筛选（全局条件，不可排除）
  if (verificationFilter && verificationFilter !== 'all') {
    filtered = filtered.filter(product => calculateVerificationStatus(product) === verificationFilter);
  }

  // 6. 按关键词搜索
  if (keyword.trim()) {
    return searchProducts(filtered, keyword);
  }

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
  categories,
  status,
  minStock,
  maxStock,
  location,
  locations,
  brand,
  brands,
  verificationFilter
}) => {
  const cats = categories || category;
  const locs = locations || location;
  const brds = brands || brand;
  return Boolean(
    keyword ||
    (Array.isArray(cats) ? cats.length > 0 : (cats && cats !== 'all')) ||
    (status && status !== 'all') ||
    (minStock !== null && minStock !== '') ||
    (maxStock !== null && maxStock !== '') ||
    (Array.isArray(locs) ? locs.length > 0 : (locs && locs !== 'all' && locs !== '')) ||
    (Array.isArray(brds) ? brds.length > 0 : (brds && brds !== 'all' && brds !== '')) ||
    (verificationFilter && verificationFilter !== 'all')
  );
};

/**
 * 构建分面筛选候选项（含数量）。
 * 用于品牌、库存分类、库位的动态候选计算。
 *
 * @param {Array} products - 全量产品
 * @param {string} dimension - 'brand' | 'category' | 'location'
 * @param {Object} filters - 当前筛选条件 { keyword, categories, status, minStock, maxStock, locations, brands, verificationFilter }
 * @returns {{ options: string[], counts: Object.<string, number> }}
 */
export const computeFacetOptions = (products, dimension, filters) => {
  const {
    keyword = '',
    categories = [],
    status = 'all',
    minStock = null,
    maxStock = null,
    locations = [],
    brands = [],
    verificationFilter = 'all',
  } = filters;

  const exclude = dimension === 'brand' ? 'brands'
    : dimension === 'category' ? 'categories'
    : dimension === 'location' ? 'locations'
    : null;

  const scoped = filterProducts(
    products, keyword, categories, status,
    minStock, maxStock, locations, brands, verificationFilter, exclude
  );

  const counts = {};
  scoped.forEach(p => {
    const raw = dimension === 'brand' ? (p.brand || '')
      : dimension === 'category' ? (p.category || '')
      : (p.location || '');
    const v = raw.trim();
    if (v) counts[v] = (counts[v] || 0) + 1;
  });
  return { counts, scoped };
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
