// auditLogPagination 纯函数测试
// 使用 Node.js 内置 test runner: node --test src/utils/auditLogPagination.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuditLogQuery,
  normalizeAuditLogPage,
  DEFAULT_PAGE_SIZE,
  EXPORT_PAGE_SIZE,
} from './auditLogPagination.js';

// ── buildAuditLogQuery：分页参数序列化 ──
describe('buildAuditLogQuery - pagination params', () => {
  it('should serialize page and page_size', () => {
    const qs = buildAuditLogQuery({ page: 2, pageSize: 20 });
    const params = new URLSearchParams(qs);
    assert.equal(params.get('page'), '2');
    assert.equal(params.get('page_size'), '20');
  });

  it('should use defaults when page/pageSize omitted', () => {
    const params = new URLSearchParams(buildAuditLogQuery({}));
    assert.equal(params.get('page'), '1');
    assert.equal(params.get('page_size'), String(DEFAULT_PAGE_SIZE));
  });

  it('should handle empty params object', () => {
    const params = new URLSearchParams(buildAuditLogQuery());
    assert.equal(params.get('page'), '1');
    assert.equal(params.get('page_size'), String(DEFAULT_PAGE_SIZE));
    assert.equal(params.get('action_type'), null);
  });
});

// ── buildAuditLogQuery：筛选参数序列化 ──
describe('buildAuditLogQuery - filter params', () => {
  it('should serialize all filter fields to snake_case', () => {
    const qs = buildAuditLogQuery({
      page: 1,
      pageSize: 20,
      actionType: 'TRANSACTION_ADD',
      productName: '色谱',
      operator: 'admin',
      timeRange: 'week',
      startDate: '2026-08-01',
      endDate: '2026-08-21',
    });
    const params = new URLSearchParams(qs);
    assert.equal(params.get('action_type'), 'TRANSACTION_ADD');
    assert.equal(params.get('product_name'), '色谱');
    assert.equal(params.get('operator'), 'admin');
    assert.equal(params.get('time_range'), 'week');
    assert.equal(params.get('start_date'), '2026-08-01');
    assert.equal(params.get('end_date'), '2026-08-21');
  });

  it('should omit empty filter values', () => {
    const params = new URLSearchParams(buildAuditLogQuery({
      actionType: '',
      productName: '  ',
      operator: '',
      timeRange: 'all',
      startDate: '',
      endDate: '',
    }));
    assert.equal(params.get('action_type'), null);
    // productName 原样传入 '  '（非空），序列化保留
    assert.equal(params.get('product_name'), '  ');
    assert.equal(params.get('operator'), null);
    assert.equal(params.get('time_range'), null);
    assert.equal(params.get('start_date'), null);
    assert.equal(params.get('end_date'), null);
  });

  it('should not emit time_range for "all"', () => {
    const params = new URLSearchParams(buildAuditLogQuery({ timeRange: 'all' }));
    assert.equal(params.get('time_range'), null);
  });

  it('should encode special characters safely', () => {
    const qs = buildAuditLogQuery({ productName: 'A&B=C 100%' });
    const params = new URLSearchParams(qs);
    assert.equal(params.get('product_name'), 'A&B=C 100%');
  });
});

// ── normalizeAuditLogPage：分页响应规范化 ──
describe('normalizeAuditLogPage - object response', () => {
  const rawPage = {
    items: [{ actionType: 'PRODUCT_ADD', productName: 'x', operator: 'admin', timestamp: '2026-08-21 10:00:00' }],
    total: 752,
    page: 2,
    page_size: 20,
    total_pages: 38,
  };

  it('should map to camelCase structure', () => {
    const result = normalizeAuditLogPage(rawPage);
    assert.equal(result.total, 752);
    assert.equal(result.page, 2);
    assert.equal(result.pageSize, 20);
    assert.equal(result.totalPages, 38);
    assert.equal(result.items.length, 1);
  });

  it('should run normalizer over each item', () => {
    const result = normalizeAuditLogPage(rawPage, (x) => ({ ...x, extra: true }));
    assert.ok(result.items[0].extra);
  });

  it('should handle missing/nil fields safely', () => {
    const result = normalizeAuditLogPage(null);
    assert.deepEqual(result.items, []);
    assert.equal(result.total, 0);
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, DEFAULT_PAGE_SIZE);
    assert.equal(result.totalPages, 0);
  });

  it('should handle items not being an array', () => {
    const result = normalizeAuditLogPage({ total: 5, page: 1, page_size: 10, total_pages: 1 });
    assert.deepEqual(result.items, []);
    assert.equal(result.total, 5);
  });
});

// ── normalizeAuditLogPage：兼容旧数组格式 ──
describe('normalizeAuditLogPage - legacy array response', () => {
  it('should treat legacy array as a single page', () => {
    const result = normalizeAuditLogPage([{ id: 'log-000001' }, { id: 'log-000002' }]);
    assert.equal(result.items.length, 2);
    assert.equal(result.total, 2);
    assert.equal(result.page, 1);
    assert.equal(result.totalPages, 1);
  });

  it('should handle empty legacy array', () => {
    const result = normalizeAuditLogPage([]);
    assert.equal(result.items.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 0);
  });
});

// ── 导出全量拉取参数 ──
describe('export constants', () => {
  it('should expose bounded export page size', () => {
    assert.ok(EXPORT_PAGE_SIZE > 0 && EXPORT_PAGE_SIZE <= 100);
  });
});
