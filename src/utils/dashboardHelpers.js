/**
 * 根据交易汇总生成趋势解读文案
 *
 * 判断规则：
 * 1. 有效交易笔数为0，或入库和出库总量均为0 → 暂无有效出入库交易
 * 2. 入库总量 > 出库总量 → 净增长
 * 3. 入库总量 < 出库总量 → 净减少
 * 4. 入库总量 === 出库总量，且存在有效交易 → 持平
 *
 * @param {Object} summary - 交易汇总数据
 * @param {number} summary.totalInCount - 入库总量
 * @param {number} summary.totalOutCount - 出库总量
 * @param {number} summary.totalTransactionsCount - 有效交易笔数（已完成且未撤销）
 * @returns {string} 趋势解读文案
 */
export function getTrendInterpretation({ totalInCount, totalOutCount, totalTransactionsCount }) {
  // 分支 1：零交易或入库出库均为 0
  if (totalTransactionsCount === 0 || (totalInCount === 0 && totalOutCount === 0)) {
    return '当前时间范围内暂无有效出入库交易，库存总量保持不变。';
  }

  // 分支 2：入库大于出库 → 净增长
  if (totalInCount > totalOutCount) {
    return '当前时间范围内入库总量大于出库总量，整体库存呈现净增长趋势。';
  }

  // 分支 3：入库小于出库 → 净减少
  if (totalInCount < totalOutCount) {
    return '当前时间范围内入库总量小于出库总量，整体库存呈现净减少趋势。';
  }

  // 分支 4：入库等于出库且存在有效交易
  return '当前时间范围内出入库总量持平，库存净变化为0。';
}
