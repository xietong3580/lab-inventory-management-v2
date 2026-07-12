// dashboardHelpers 纯函数测试
// 使用 Node.js 内置 test runner: node --test src/utils/dashboardHelpers.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTrendInterpretation } from './dashboardHelpers.js';

const ZERO_MSG = '当前时间范围内暂无有效出入库交易，库存总量保持不变。';
const GROWTH_MSG = '当前时间范围内入库总量大于出库总量，整体库存呈现净增长趋势。';
const DECLINE_MSG = '当前时间范围内入库总量小于出库总量，整体库存呈现净减少趋势。';
const BALANCED_MSG = '当前时间范围内出入库总量持平，库存净变化为0。';

// ── 分支 1：零交易 ──
describe('getTrendInterpretation - zero transactions', () => {
  it('should return zero message when totalTransactionsCount is 0', () => {
    const result = getTrendInterpretation({
      totalInCount: 0,
      totalOutCount: 0,
      totalTransactionsCount: 0,
    });
    assert.equal(result, ZERO_MSG);
  });

  it('should return zero message when both in and out are 0', () => {
    const result = getTrendInterpretation({
      totalInCount: 0,
      totalOutCount: 0,
      totalTransactionsCount: 0,
    });
    assert.equal(result, ZERO_MSG);
  });

  it('should return zero message even if totalTransactionsCount is somehow non-zero but both totals are 0', () => {
    // 防御性：理论上不该出现，但 OR 条件确保兜底
    const result = getTrendInterpretation({
      totalInCount: 0,
      totalOutCount: 0,
      totalTransactionsCount: 5,
    });
    assert.equal(result, ZERO_MSG);
  });
});

// ── 分支 2：入库 > 出库 → 净增长 ──
describe('getTrendInterpretation - net growth (in > out)', () => {
  it('should return growth message when in > out', () => {
    const result = getTrendInterpretation({
      totalInCount: 100,
      totalOutCount: 50,
      totalTransactionsCount: 15,
    });
    assert.equal(result, GROWTH_MSG);
  });

  it('should return growth message when out is 0 but in > 0', () => {
    const result = getTrendInterpretation({
      totalInCount: 10,
      totalOutCount: 0,
      totalTransactionsCount: 3,
    });
    assert.equal(result, GROWTH_MSG);
  });
});

// ── 分支 3：入库 < 出库 → 净减少 ──
describe('getTrendInterpretation - net decline (in < out)', () => {
  it('should return decline message when in < out', () => {
    const result = getTrendInterpretation({
      totalInCount: 30,
      totalOutCount: 80,
      totalTransactionsCount: 10,
    });
    assert.equal(result, DECLINE_MSG);
  });

  it('should return decline message when in is 0 but out > 0', () => {
    const result = getTrendInterpretation({
      totalInCount: 0,
      totalOutCount: 25,
      totalTransactionsCount: 5,
    });
    assert.equal(result, DECLINE_MSG);
  });
});

// ── 分支 4：入库 === 出库 且存在有效交易 ──
describe('getTrendInterpretation - balanced (in === out, has transactions)', () => {
  it('should return balanced message when in === out and transactions exist', () => {
    const result = getTrendInterpretation({
      totalInCount: 50,
      totalOutCount: 50,
      totalTransactionsCount: 8,
    });
    assert.equal(result, BALANCED_MSG);
  });

  it('should return balanced message with large equal values', () => {
    const result = getTrendInterpretation({
      totalInCount: 9999,
      totalOutCount: 9999,
      totalTransactionsCount: 200,
    });
    assert.equal(result, BALANCED_MSG);
  });
});

// ── 三个时间范围共用同一判断逻辑 ──
describe('getTrendInterpretation - same logic for all time ranges', () => {
  it('should handle near-7-days scenario (small numbers)', () => {
    const result = getTrendInterpretation({
      totalInCount: 5,
      totalOutCount: 3,
      totalTransactionsCount: 2,
    });
    assert.equal(result, GROWTH_MSG);
  });

  it('should handle near-30-days scenario (medium numbers)', () => {
    const result = getTrendInterpretation({
      totalInCount: 200,
      totalOutCount: 350,
      totalTransactionsCount: 45,
    });
    assert.equal(result, DECLINE_MSG);
  });

  it('should handle all-time scenario', () => {
    const result = getTrendInterpretation({
      totalInCount: 0,
      totalOutCount: 0,
      totalTransactionsCount: 0,
    });
    assert.equal(result, ZERO_MSG);
  });
});
