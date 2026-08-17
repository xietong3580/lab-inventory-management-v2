// 分页页码计算纯函数
// 用于计算分页栏需要显示的页码序列，返回有序项列表。
// 每项为：
//   { type: 'page', page: number }   — 可点击页码
//   { type: 'ellipsis', side: 'left' | 'right' } — 省略号（不可点击）

// 将输入转换为合法的总页数（至少为 1）
function normalizeTotal(totalPages) {
  const n = Math.trunc(Number(totalPages));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// 将当前页限制在 [1, totalPages] 范围内
function clamp(currentPage, totalPages) {
  const n = Math.trunc(Number(currentPage));
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, n), totalPages);
}

// 生成 [start, end] 的页码项列表
function buildPageItems(start, end) {
  const items = [];
  for (let p = start; p <= end; p++) {
    items.push({ type: 'page', page: p });
  }
  return items;
}

/**
 * 计算分页栏应显示的页码序列。
 *
 * 规则：
 * - 总页数不多（≤7）时显示所有页
 * - 总页数较多时始终显示第一页、最后一页和当前页附近的窗口（最多 5 页）
 * - 当前页始终包含在结果中
 * - 省略号填补页码之间的空缺
 *
 * @param {number} currentPage 当前页（从 1 开始）
 * @param {number} totalPages  总页数
 * @returns {Array<{type:'page',page:number}|{type:'ellipsis',side:string}>}
 */
export function getPaginationItems(currentPage, totalPages) {
  const total = normalizeTotal(totalPages);
  const current = clamp(currentPage, total);

  // 页数较少时直接显示全部
  if (total <= 7) {
    return buildPageItems(1, total);
  }

  // 以当前页为中心的滑动窗口（左右各 2 页，最多 5 页）
  let start = current - 2;
  let end = current + 2;
  if (start < 1) {
    end += 1 - start;
    start = 1;
  }
  if (end > total) {
    start -= end - total;
    end = total;
  }
  if (start < 1) start = 1;

  // 收集需要显示的页码：第一页 + 窗口 + 最后一页，去重后升序
  const pageSet = new Set([1, total]);
  for (let p = start; p <= end; p++) pageSet.add(p);
  const pages = Array.from(pageSet)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  // 在页码空缺处插入省略号
  const items = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (i > 0 && page - pages[i - 1] > 1) {
      // 紧随第一页之后的空缺为左侧省略号，其余（最后一页之前）为右侧省略号
      items.push({ type: 'ellipsis', side: pages[i - 1] === 1 ? 'left' : 'right' });
    }
    items.push({ type: 'page', page });
  }
  return items;
}
