/**
 * 真实库存分类与库位联动配置
 *
 * 背景：公司实际库存按库存区域和库位管理，而非"耗材/试剂/设备"通用分类。
 * 本文件提供库存分类常量、库位选项、联动辅助函数。
 */

/** 公司真实库存分类（4 类） */
export const INVENTORY_CATEGORIES = [
  '2楼库存',
  '3楼库存',
  '刘晓冬安捷伦库存',
  '尚工安捷伦库存',
];

/** 各库存分类对应的可选库位 */
export const INVENTORY_LOCATION_OPTIONS = {
  '2楼库存': [
    'A1', 'A2', 'A3', 'A4',
    'B1', 'B2', 'B3', 'B4',
    'C1', 'C2', 'C3', 'C4',
    'D1', 'D2', 'D3', 'D4',
    'E1', 'E2', 'E3', 'E4',
    'F1', 'F2', 'F3', 'F4',
  ],
  '3楼库存': [
    '3-1', '3-2', '3-3', '3-4', '3-5',
  ],
  '刘晓冬安捷伦库存': ['专用区域'],
  '尚工安捷伦库存': ['专用区域'],
};

/**
 * 根据库存分类获取可选库位列表
 * @param {string} category - 库存分类
 * @returns {string[]} 库位列表，未知分类返回空数组
 */
export function getLocationOptionsByCategory(category) {
  if (!category) return [];
  return INVENTORY_LOCATION_OPTIONS[category] || [];
}

/**
 * 根据库存分类获取默认库位
 *
 * 规则：
 * - 2楼库存 / 3楼库存：不预设，返回空字符串（用户自行选择）
 * - 刘晓冬安捷伦库存 / 尚工安捷伦库存：默认"专用区域"
 * - 其他分类：返回空字符串
 *
 * @param {string} category - 库存分类
 * @returns {string} 默认库位
 */
export function getDefaultLocationByCategory(category) {
  if (
    category === '刘晓冬安捷伦库存' ||
    category === '尚工安捷伦库存'
  ) {
    return '专用区域';
  }
  return '';
}

/**
 * 判断库存分类是否为真实库存分类（而非旧通用分类）
 * @param {string} category - 分类值
 * @returns {boolean}
 */
export function isRealInventoryCategory(category) {
  return INVENTORY_CATEGORIES.includes(category);
}

/**
 * 构建筛选下拉的分类选项
 *
 * 优先显示 4 个真实库存分类，再追加系统中已存在但不在真实分类中的旧分类
 * （如"耗材""试剂""设备"），确保旧数据仍可被筛选。
 *
 * @param {Array} existingProducts - 当前系统中所有产品
 * @returns {Array<{value: string, label: string}>} 下拉选项
 */
export function buildCategoryOptions(existingProducts) {
  const options = [
    { value: 'all', label: '全部库存分类' },
  ];

  // 先添加 4 个真实库存分类
  for (const cat of INVENTORY_CATEGORIES) {
    options.push({ value: cat, label: cat });
  }

  // 收集系统中已有的旧分类（不在 4 个真实分类中的）
  if (existingProducts && existingProducts.length > 0) {
    const legacyCategories = new Set();
    for (const p of existingProducts) {
      if (p.category && !INVENTORY_CATEGORIES.includes(p.category)) {
        legacyCategories.add(p.category);
      }
    }
    if (legacyCategories.size > 0) {
      for (const cat of [...legacyCategories].sort()) {
        options.push({ value: cat, label: cat });
      }
    }
  }

  return options;
}
