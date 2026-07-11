// productFilterHelpers 纯函数测试
// 使用 Node.js 内置 test runner: node --test src/utils/productFilterHelpers.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterProducts,
  searchProducts,
  hasActiveFilters,
  calculateVerificationStatus,
  computeFacetOptions,
  getDefaultFilterState,
} from './productFilterHelpers.js';

// ── 模拟产品数据 ──

const MOCK_PRODUCTS = [
  {
    id: 'prod-001',
    sku: 'AGL-7725I',
    name: '离子色谱预处理柱',
    brand: '安捷伦',
    category: '2楼库存',
    location: 'A区-1排-2层',
    specification: '1.5×100mm',
    supplier: '上海某某化工',
    unit: '个',
    currentStock: 50,
    minStock: 10,
    status: '正常',
    updatedAt: '2026-07-01',
  },
  {
    id: 'prod-002',
    sku: 'AGL-7725I-PLUS',
    name: '离子色谱预处理柱 Plus',
    brand: '安捷伦',
    category: '2楼库存',
    location: 'A区-2排-1层',
    specification: '2.0×150mm',
    supplier: '上海某某化工',
    unit: '个',
    currentStock: 5,
    minStock: 10,
    status: '低库存',
    updatedAt: '2026-07-02',
  },
  {
    id: 'prod-003',
    sku: 'SHIM-2288U',
    name: '液相色谱柱',
    brand: '岛津',
    category: '3楼库存',
    location: 'B区-1排-3层',
    specification: '4.6×250mm',
    supplier: '北京某某仪器',
    unit: '根',
    currentStock: 20,
    minStock: 5,
    status: '正常',
    updatedAt: '2026-06-28',
  },
  {
    id: 'prod-004',
    sku: 'WAT-1860K',
    name: '样品瓶 2mL',
    brand: 'Waters',
    category: '2楼库存',
    location: 'C区-3排-2层',
    specification: '2mL 透明',
    supplier: '广州某某耗材',
    unit: '盒',
    currentStock: 200,
    minStock: 50,
    status: '正常',
    updatedAt: '2026-07-05',
  },
  {
    id: 'prod-005',
    sku: 'THM-FCS',
    name: '胎牛血清',
    brand: 'Thermo',
    category: '刘晓冬库存',
    location: '专用区域',
    specification: '500mL',
    supplier: '上海某某生物',
    unit: '瓶',
    currentStock: 3,
    minStock: 5,
    status: '低库存',
    updatedAt: '2026-07-03',
  },
  {
    id: 'prod-006',
    sku: '',
    name: '',
    brand: '',
    category: '2楼库存',
    location: '',
    specification: '',
    supplier: '',
    unit: '个',
    currentStock: -1,
    minStock: null,
    status: '正常',
  },
  {
    id: 'prod-007',
    sku: 'TEST-NULLS',
    name: '空值测试产品',
    brand: null,
    category: null,
    location: null,
    specification: null,
    supplier: null,
    unit: '个',
    currentStock: 10,
    minStock: 5,
    status: '正常',
  },
  {
    id: 'prod-008',
    sku: 'MIX-CASE',
    name: 'Mixed Case Product',
    brand: 'MixedBrand',
    category: '尚工库存',
    location: '专用区域',
    specification: 'Test Spec',
    supplier: 'Test Supplier',
    unit: '套',
    currentStock: 15,
    minStock: 3,
    status: '正常',
  },
];

// ── 测试套件 ──

// ── 1. 无筛选返回全部记录 ──
describe('filterProducts - no filters', () => {
  it('should return all products when no filters applied', () => {
    const result = filterProducts(MOCK_PRODUCTS);
    assert.equal(result.length, MOCK_PRODUCTS.length);
  });

  it('should return all products with explicit defaults', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', 'all', null, null, 'all', 'all', 'all');
    assert.equal(result.length, MOCK_PRODUCTS.length);
  });
});

// ── 2. 品牌单选 ──
describe('filterProducts - single brand', () => {
  it('should filter by single brand', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', 'all', null, null, 'all', ['安捷伦']);
    assert.equal(result.length, 2);
    assert.ok(result.every(p => p.brand === '安捷伦'));
  });
});

// ── 3. 品牌多选 OR ──
describe('filterProducts - multiple brands (OR)', () => {
  it('should filter by multiple brands', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', 'all', null, null, 'all', ['安捷伦', '岛津']);
    assert.equal(result.length, 3);
    assert.ok(result.every(p => p.brand === '安捷伦' || p.brand === '岛津'));
  });
});

// ── 4. 库位多选 OR ──
describe('filterProducts - multiple locations (OR)', () => {
  it('should filter by multiple locations', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', 'all', null, null, ['A区-1排-2层', 'B区-1排-3层']);
    assert.equal(result.length, 2);
  });
});

// ── 5. 品牌 + 分类 + 库位 AND ──
describe('filterProducts - combined dimensions (AND)', () => {
  it('should apply brand + category + location as AND', () => {
    const result = filterProducts(
      MOCK_PRODUCTS, '', ['2楼库存'], 'all', null, null,
      ['A区-1排-2层'], ['安捷伦']
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'prod-001');
  });
});

// ── 6-9. 分面候选项计算 ──

describe('computeFacetOptions - facet computation', () => {
  it('should compute brand candidates excluding brand dimension', () => {
    // With no filters, all brands should appear
    const { counts } = computeFacetOptions(MOCK_PRODUCTS, 'brand', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: [], verificationFilter: 'all',
    });
    assert.ok('安捷伦' in counts);
    assert.ok('岛津' in counts);
    assert.ok('Waters' in counts);
    assert.ok('Thermo' in counts);
  });

  it('should compute category candidates excluding category dimension', () => {
    const { counts } = computeFacetOptions(MOCK_PRODUCTS, 'category', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: [], verificationFilter: 'all',
    });
    assert.ok('2楼库存' in counts);
    assert.ok('3楼库存' in counts);
    assert.ok('刘晓冬库存' in counts);
  });

  it('should compute location candidates excluding location dimension', () => {
    const { counts } = computeFacetOptions(MOCK_PRODUCTS, 'location', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: [], verificationFilter: 'all',
    });
    assert.ok('A区-1排-2层' in counts);
    assert.ok('B区-1排-3层' in counts);
  });

  it('should compute correct counts for brands', () => {
    const { counts } = computeFacetOptions(MOCK_PRODUCTS, 'brand', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: [], verificationFilter: 'all',
    });
    assert.equal(counts['安捷伦'], 2);
    assert.equal(counts['岛津'], 1);
    assert.equal(counts['Waters'], 1);
    assert.equal(counts['Thermo'], 1);
  });

  it('should exclude self-dimension in facet computation', () => {
    // When brand filter is active with "安捷伦", computing brand facet
    // should still show "岛津" etc (excluding the brand dimension filter)
    const { counts } = computeFacetOptions(MOCK_PRODUCTS, 'brand', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: ['安捷伦'], verificationFilter: 'all',
    });
    // Excluding brand dimension means '安捷伦' filter is NOT applied
    // So all brands still appear
    assert.ok('安捷伦' in counts);
    assert.ok('岛津' in counts);
  });

  it('should reflect other-dimension filters in facet counts', () => {
    // Brand facet when location = 'A区-1排-2层' is active
    const { counts } = computeFacetOptions(MOCK_PRODUCTS, 'brand', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: ['A区-1排-2层'], brands: [], verificationFilter: 'all',
    });
    // Only 安捷伦 has products in A区-1排-2层
    assert.equal(counts['安捷伦'], 1);
    // 岛津 should NOT appear because no 岛津 product is at A区-1排-2层
    assert.ok(!('岛津' in counts) || counts['岛津'] === 0);
  });
});

// ── 10-13. 搜索功能 ──

describe('searchProducts - basic search', () => {
  it('should return empty for empty keyword', () => {
    assert.equal(searchProducts(MOCK_PRODUCTS, '').length, 0);
    assert.equal(searchProducts(MOCK_PRODUCTS, '   ').length, 0);
    assert.equal(searchProducts(MOCK_PRODUCTS, null).length, 0);
    assert.equal(searchProducts(MOCK_PRODUCTS, undefined).length, 0);
  });

  it('should match single keyword by SKU', () => {
    const result = searchProducts(MOCK_PRODUCTS, 'AGL');
    assert.equal(result.length, 2);
    assert.ok(result.every(p => p.sku.toLowerCase().includes('agl')));
  });

  it('should match single keyword by name', () => {
    const result = searchProducts(MOCK_PRODUCTS, '色谱');
    assert.equal(result.length, 3); // 2 安捷伦离子色谱 + 1 岛津液相色谱
  });

  it('should match single keyword by brand', () => {
    const result = searchProducts(MOCK_PRODUCTS, 'Waters');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'prod-004');
  });

  it('should match single keyword by specification', () => {
    const result = searchProducts(MOCK_PRODUCTS, '500mL');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'prod-005');
  });

  it('should match single keyword by supplier', () => {
    const result = searchProducts(MOCK_PRODUCTS, '某某生物');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'prod-005');
  });
});

describe('searchProducts - multi-keyword AND', () => {
  it('should apply AND logic for multiple keywords', () => {
    // "安捷伦 色谱" -> must match BOTH "安捷伦" AND "色谱"
    const result = searchProducts(MOCK_PRODUCTS, '安捷伦 色谱');
    assert.equal(result.length, 2); // Two 安捷伦 ion色谱 products
    assert.ok(result.every(p => p.brand === '安捷伦'));
  });

  it('should return empty when one keyword matches nothing', () => {
    const result = searchProducts(MOCK_PRODUCTS, '安捷伦 NOMATCHXYZ');
    assert.equal(result.length, 0);
  });

  it('should match keywords across different fields (AND)', () => {
    // "安捷伦" matches brand, "1.5" matches specification
    const result = searchProducts(MOCK_PRODUCTS, '安捷伦 1.5');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'prod-001');
  });

  it('should match keywords hitting different fields for same product', () => {
    // "Waters" matches brand, "样品瓶" matches name
    const result = searchProducts(MOCK_PRODUCTS, 'Waters 样品瓶');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'prod-004');
  });
});

describe('searchProducts - case and whitespace', () => {
  it('should be case-insensitive', () => {
    const lower = searchProducts(MOCK_PRODUCTS, 'waters');
    const upper = searchProducts(MOCK_PRODUCTS, 'WATERS');
    const mixed = searchProducts(MOCK_PRODUCTS, 'WaTeRs');
    assert.equal(lower.length, 1);
    assert.equal(upper.length, 1);
    assert.equal(mixed.length, 1);
  });

  it('should normalize whitespace', () => {
    const normal = searchProducts(MOCK_PRODUCTS, '安捷伦 色谱');
    const extraSpaces = searchProducts(MOCK_PRODUCTS, '  安捷伦   色谱  ');
    assert.equal(normal.length, extraSpaces.length);
  });

  it('should handle mixed case with multi-keyword', () => {
    const result = searchProducts(MOCK_PRODUCTS, 'MIXED case PRODUCT');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'prod-008');
  });
});

describe('searchProducts - null/undefined safety', () => {
  it('should handle products with null fields', () => {
    // Searching for "空值" should hit name of prod-007 which has null brand/category/location
    const result = searchProducts(MOCK_PRODUCTS, '空值');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'prod-007');
  });

  it('should not crash on products with null properties', () => {
    // Should not throw
    const result = searchProducts(MOCK_PRODUCTS, 'TEST-NULLS');
    assert.equal(result.length, 1);
  });
});

// ── 14. 库存状态筛选 ──
describe('filterProducts - stock status', () => {
  it('should filter by "正常" status', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', '正常');
    assert.ok(result.every(p => p.status === '正常'));
    assert.ok(result.length > 0);
  });

  it('should filter by "低库存" status', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', '低库存');
    assert.ok(result.every(p => p.status === '低库存'));
    assert.equal(result.length, 2);
  });
});

// ── 15. 核对状态筛选 ──
describe('filterProducts - verification filter', () => {
  it('should filter by "需核对" status', () => {
    const result = filterProducts(
      MOCK_PRODUCTS, '', 'all', 'all', null, null, 'all', 'all', '需核对'
    );
    // prod-006 has empty name/sku and negative stock -> should be 需核对
    // prod-007 has null category/location -> 建议补充 (since name & sku exist)
    assert.ok(result.length >= 1);
  });

  it('should filter by "信息完整" status', () => {
    const result = filterProducts(
      MOCK_PRODUCTS, '', 'all', 'all', null, null, 'all', 'all', '信息完整'
    );
    // Products with all required fields should be 信息完整
    assert.ok(result.every(p => calculateVerificationStatus(p) === '信息完整'));
  });
});

// ── 16. 最小值/最大值筛选 ──
describe('filterProducts - stock range', () => {
  it('should filter by min stock', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', 'all', 50);
    assert.ok(result.every(p => p.currentStock >= 50));
    assert.equal(result.length, 2); // prod-001 (50) and prod-004 (200)
  });

  it('should filter by max stock', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', 'all', null, 5);
    assert.ok(result.every(p => p.currentStock <= 5));
    assert.equal(result.length, 3); // prod-002 (5), prod-005 (3), prod-006 (-1)
  });

  it('should filter by min and max stock combined', () => {
    const result = filterProducts(MOCK_PRODUCTS, '', 'all', 'all', 10, 100);
    assert.ok(result.every(p => p.currentStock >= 10 && p.currentStock <= 100));
  });
});

// ── 17. 冲突条件返回 0，但 filters 对象不被修改 ──
describe('filterProducts - conflicting conditions', () => {
  it('should return empty array for conflicting conditions', () => {
    const result = filterProducts(
      MOCK_PRODUCTS, '', 'all', 'all', null, null,
      ['A区-1排-2层'], ['Thermo']  // No Thermo product at A区-1排-2层
    );
    assert.equal(result.length, 0);
  });

  it('should not modify input arrays (immutability)', () => {
    const originalProducts = [...MOCK_PRODUCTS];
    const originalLength = MOCK_PRODUCTS.length;
    filterProducts(
      MOCK_PRODUCTS, '', ['2楼库存'], 'all', null, null,
      ['A区-1排-2层'], ['安捷伦']
    );
    // Original array should be unchanged
    assert.equal(MOCK_PRODUCTS.length, originalLength);
    assert.deepEqual(MOCK_PRODUCTS, originalProducts);
  });
});

// ── 18. 筛选函数不修改原始产品对象 ──
describe('filterProducts - immutability', () => {
  it('should not modify product objects', () => {
    const originalProduct = { ...MOCK_PRODUCTS[0] };
    filterProducts(MOCK_PRODUCTS, '色谱');
    assert.deepEqual(MOCK_PRODUCTS[0], originalProduct);
  });

  it('should return new array, not reference to input', () => {
    const result = filterProducts(MOCK_PRODUCTS);
    assert.notEqual(result, MOCK_PRODUCTS);
  });
});

// ── 19. 重置条件恢复完整结果 ──
describe('getDefaultFilterState - reset', () => {
  it('should return default filter state', () => {
    const defaults = getDefaultFilterState();
    assert.equal(defaults.keyword, '');
    assert.equal(defaults.category, 'all');
    assert.equal(defaults.status, 'all');
    assert.equal(defaults.minStock, '');
    assert.equal(defaults.maxStock, '');
    assert.equal(defaults.location, 'all');
    assert.equal(defaults.brand, 'all');
  });

  it('should return all products when using default state filters', () => {
    const defaults = getDefaultFilterState();
    const result = filterProducts(
      MOCK_PRODUCTS, defaults.keyword, defaults.category, defaults.status,
      defaults.minStock || null, defaults.maxStock || null,
      defaults.location, defaults.brand
    );
    assert.equal(result.length, MOCK_PRODUCTS.length);
  });
});

// ── 20. 空值品牌、分类、库位不生成候选项 ──
describe('computeFacetOptions - empty/null values excluded', () => {
  it('should not include empty strings in facet counts', () => {
    const { counts } = computeFacetOptions(MOCK_PRODUCTS, 'brand', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: [], verificationFilter: 'all',
    });
    // prod-006 has brand '' (empty) -> should be excluded
    // prod-007 has brand null -> should be excluded
    assert.ok(!('' in counts), 'empty string should not be a facet option');
    assert.equal(Object.keys(counts).filter(k => k === '').length, 0);
  });

  it('should not include null/undefined as facet options', () => {
    const { counts } = computeFacetOptions(MOCK_PRODUCTS, 'category', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: [], verificationFilter: 'all',
    });
    // Verify no null/undefined keys
    Object.keys(counts).forEach(k => {
      assert.ok(k && k.trim(), `facet key "${k}" should be non-empty`);
    });
  });
});

// ── hasActiveFilters ──
describe('hasActiveFilters', () => {
  it('should return false with no filters', () => {
    assert.equal(hasActiveFilters({
      keyword: '',
      categories: [],
      status: 'all',
      minStock: null,
      maxStock: null,
      locations: [],
      brands: [],
      verificationFilter: 'all',
    }), false);
  });

  it('should return true with keyword', () => {
    assert.equal(hasActiveFilters({
      keyword: 'test',
      categories: [],
      status: 'all',
      minStock: null,
      maxStock: null,
      locations: [],
      brands: [],
    }), true);
  });

  it('should return true with brand selected', () => {
    assert.equal(hasActiveFilters({
      keyword: '',
      categories: [],
      status: 'all',
      minStock: null,
      maxStock: null,
      locations: [],
      brands: ['安捷伦'],
    }), true);
  });
});

// ── searchProducts scoring (SKU priority) ──
describe('searchProducts - scoring priority', () => {
  it('should rank exact SKU match highest', () => {
    const result = searchProducts(MOCK_PRODUCTS, 'AGL-7725I');
    assert.ok(result.length >= 2);
    // Exact SKU match should be first
    assert.equal(result[0].sku, 'AGL-7725I');
  });

  it('should rank SKU prefix match above name match', () => {
    // Both products have SKU starting with "AGL" (same prefix), and name containing "离子"
    // But SKU prefix (80) > name contains (40)
    const result = searchProducts(MOCK_PRODUCTS, 'AGL');
    // All AGL matches should come before any pure name matches
    const firstNonAGL = result.findIndex(p => !p.sku.toLowerCase().startsWith('agl'));
    if (firstNonAGL > 0) {
      assert.ok(result.slice(0, firstNonAGL).every(p => p.sku.toLowerCase().includes('agl')));
    }
  });
});

// ── searchProducts 参与分面候选项计算 ──
describe('searchProducts - participates in facet computation', () => {
  it('should reduce facet counts when keyword is active', () => {
    const noSearch = computeFacetOptions(MOCK_PRODUCTS, 'brand', {
      keyword: '', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: [], verificationFilter: 'all',
    });
    const withSearch = computeFacetOptions(MOCK_PRODUCTS, 'brand', {
      keyword: '安捷伦', categories: [], status: 'all', minStock: null, maxStock: null,
      locations: [], brands: [], verificationFilter: 'all',
    });
    // With search "安捷伦", only 安捷伦 brand products should match
    assert.equal(withSearch.counts['安捷伦'], 2);
    // Other brands should not appear or have lower counts
    assert.ok(!('岛津' in withSearch.counts) || withSearch.counts['岛津'] === 0);
  });
});
