// paginationHelpers 纯函数测试
// 使用 Node.js 内置 test runner: node --test src/utils/paginationHelpers.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPaginationItems } from './paginationHelpers.js';

// 提取页码数字序列（忽略省略号）
const pages = (items) => items.filter((i) => i.type === 'page').map((i) => i.page);

// 提取省略号项
const ellipses = (items) => items.filter((i) => i.type === 'ellipsis');

// 将项列表渲染为可读字符串（页码用数字，省略号用 …）
const render = (items) =>
  items.map((i) => (i.type === 'page' ? String(i.page) : '…')).join(' ');

// ── 1. 页数较少时显示所有页 ──
describe('getPaginationItems - small totalPages', () => {
  it('should show only page 1 for totalPages = 1', () => {
    assert.deepEqual(pages(getPaginationItems(1, 1)), [1]);
    assert.equal(ellipses(getPaginationItems(1, 1)).length, 0);
  });

  it('should show all 5 pages for totalPages = 5', () => {
    assert.deepEqual(pages(getPaginationItems(3, 5)), [1, 2, 3, 4, 5]);
    assert.equal(ellipses(getPaginationItems(3, 5)).length, 0);
  });

  it('should show all 6 pages for totalPages = 6', () => {
    assert.deepEqual(pages(getPaginationItems(4, 6)), [1, 2, 3, 4, 5, 6]);
    assert.equal(ellipses(getPaginationItems(4, 6)).length, 0);
  });
});

// ── 2. 44 页时的关键页码示例 ──
describe('getPaginationItems - 44 pages (spec examples)', () => {
  it('page 1', () => {
    assert.equal(render(getPaginationItems(1, 44)), '1 2 3 4 5 … 44');
  });

  it('page 6', () => {
    assert.equal(render(getPaginationItems(6, 44)), '1 … 4 5 6 7 8 … 44');
  });

  it('page 20', () => {
    assert.equal(render(getPaginationItems(20, 44)), '1 … 18 19 20 21 22 … 44');
  });

  it('page 43', () => {
    assert.equal(render(getPaginationItems(43, 44)), '1 … 40 41 42 43 44');
  });

  it('page 44', () => {
    assert.equal(render(getPaginationItems(44, 44)), '1 … 40 41 42 43 44');
  });
});

// ── 3. 当前页始终包含在结果中 ──
describe('getPaginationItems - current page always visible', () => {
  const cases = [
    [1, 44],
    [6, 44],
    [20, 44],
    [43, 44],
    [44, 44],
    [3, 10],
    [8, 10],
    [1, 1],
  ];
  for (const [current, total] of cases) {
    it(`should include page ${current} for totalPages ${total}`, () => {
      const nums = pages(getPaginationItems(current, total));
      assert.ok(nums.includes(current), `expected ${current} to be in ${nums}`);
    });
  }
});

// ── 4. 不重复、不越界、有序，且包含首尾页 ──
describe('getPaginationItems - invariants', () => {
  it('should never duplicate, go out of range, or miss first/last pages', () => {
    for (let total = 1; total <= 60; total++) {
      for (let current = 1; current <= total; current++) {
        const items = getPaginationItems(current, total);
        const nums = pages(items);

        // 不越界
        assert.ok(nums.every((n) => n >= 1 && n <= total), `out of range: ${nums} (total ${total})`);
        // 不重复
        assert.equal(new Set(nums).size, nums.length, `duplicates: ${nums}`);
        // 有序升序
        for (let k = 1; k < nums.length; k++) {
          assert.ok(nums[k] > nums[k - 1], `not sorted: ${nums}`);
        }
        // 始终包含第一页和最后一页
        assert.equal(nums[0], 1);
        assert.equal(nums[nums.length - 1], total);
      }
    }
  });
});

// ── 5. 左右省略号位置正确 ──
describe('getPaginationItems - ellipsis side', () => {
  it('should place left ellipsis before the current window, right ellipsis before last page', () => {
    // 第 6 页：左省略号在 1 之后，右省略号在 44 之前
    const items = getPaginationItems(6, 44);
    const es = ellipses(items);
    assert.equal(es.length, 2);
    assert.equal(es[0].side, 'left');
    assert.equal(es[1].side, 'right');
    // 左省略号紧跟第 1 页之后
    assert.equal(items[1].type, 'ellipsis');
    assert.equal(items[1].side, 'left');
    // 右省略号紧接最后一页之前
    assert.equal(items[items.length - 2].type, 'ellipsis');
    assert.equal(items[items.length - 2].side, 'right');
  });

  it('should only have a right ellipsis near the start', () => {
    const es = ellipses(getPaginationItems(1, 44));
    assert.equal(es.length, 1);
    assert.equal(es[0].side, 'right');
  });

  it('should only have a left ellipsis near the end', () => {
    const es = ellipses(getPaginationItems(44, 44));
    assert.equal(es.length, 1);
    assert.equal(es[0].side, 'left');
  });

  it('should have no ellipsis when totalPages is small', () => {
    for (let total = 1; total <= 7; total++) {
      for (let current = 1; current <= total; current++) {
        assert.equal(ellipses(getPaginationItems(current, total)).length, 0);
      }
    }
  });
});

// ── 6. 非法输入安全 ──
describe('getPaginationItems - invalid input safety', () => {
  it('should clamp currentPage into [1, totalPages]', () => {
    assert.deepEqual(pages(getPaginationItems(0, 5)), [1, 2, 3, 4, 5]);
    assert.deepEqual(pages(getPaginationItems(99, 5)), [1, 2, 3, 4, 5]);
  });

  it('should treat non-positive / NaN totalPages as 1', () => {
    assert.deepEqual(pages(getPaginationItems(1, 0)), [1]);
    assert.deepEqual(pages(getPaginationItems(1, -3)), [1]);
    assert.deepEqual(pages(getPaginationItems(1, NaN)), [1]);
  });
});
