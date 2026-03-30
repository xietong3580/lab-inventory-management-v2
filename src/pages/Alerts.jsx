import { useState, useMemo } from 'react';
import { getProductsWithCalculatedStatus } from '../services/productService';

// 紧急程度标签组件
function UrgencyBadge({ urgency }) {
  const config = {
    high: { text: '紧急', bg: 'bg-rose-50', textColor: 'text-rose-700' },
    medium: { text: '中等', bg: 'bg-amber-50', textColor: 'text-amber-700' },
    low: { text: '较低', bg: 'bg-slate-100', textColor: 'text-slate-700' },
  };
  const { text, bg, textColor } = config[urgency] || config.low;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

// 库存比例条组件
function StockRatioBar({ current, min }) {
  const ratio = Math.min(100, Math.round((current / min) * 100));
  const getColor = () => {
    if (ratio <= 30) return 'bg-rose-500';
    if (ratio <= 60) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-700">当前库存: {current}</span>
        <span className="text-slate-500">最低: {min}</span>
      </div>
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${getColor()}`}
          style={{ width: `${ratio}%` }}
        />
      </div>
      <div className="text-xs text-slate-500 mt-1 text-right">
        库存比例: {ratio}%
      </div>
    </div>
  );
}

function Alerts() {
  const [selectedUrgency, setSelectedUrgency] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // 计算紧急程度（根据库存百分比）
  const calculateUrgency = (product) => {
    const ratio = product.currentStock / product.minStock;
    if (ratio <= 0.2) return 'high';
    if (ratio <= 0.5) return 'medium';
    return 'low';
  };

  // 实时计算动态预警数据（基于最新产品数据）
  const dynamicAlerts = useMemo(() => {
    const products = getProductsWithCalculatedStatus();

    // 筛选低库存产品并转换为预警数据结构
    return products
      .filter(product => product.status === '低库存')
      .map(product => ({
        id: product.id,
        productName: product.name,
        currentStock: product.currentStock,
        minStock: product.minStock,
        category: product.category,
        urgency: calculateUrgency(product)
      }));
  }, []); // 空依赖数组，因为 getProductsWithCalculatedStatus 总是返回最新数据

  // 统计计算
  const totalAlerts = dynamicAlerts.length;
  const highUrgencyCount = dynamicAlerts.filter(a => a.urgency === 'high').length;
  const mediumUrgencyCount = dynamicAlerts.filter(a => a.urgency === 'medium').length;
  const lowUrgencyCount = dynamicAlerts.filter(a => a.urgency === 'low').length;

  // 筛选数据
  const filteredAlerts = dynamicAlerts.filter(alert => {
    if (selectedUrgency !== 'all' && alert.urgency !== selectedUrgency) return false;
    if (selectedCategory !== 'all' && alert.category !== selectedCategory) return false;
    return true;
  });

  const handleReset = () => {
    setSelectedUrgency('all');
    setSelectedCategory('all');
  };

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">低库存预警</h1>
        <p className="text-slate-600 mt-1">
          监控库存水平，及时发现并处理低库存风险，确保业务连续性。
        </p>
      </div>

      {/* 预警统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-sm text-slate-500 mb-2">总预警数</div>
          <div className="text-2xl font-semibold text-slate-800">{totalAlerts}</div>
          <div className="text-sm text-slate-500 mt-2">当前活跃预警</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-sm text-slate-500 mb-2">紧急预警</div>
          <div className="text-2xl font-semibold text-rose-600">{highUrgencyCount}</div>
          <div className="text-sm text-slate-500 mt-2">需立即处理</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-sm text-slate-500 mb-2">中等预警</div>
          <div className="text-2xl font-semibold text-amber-600">{mediumUrgencyCount}</div>
          <div className="text-sm text-slate-500 mt-2">需关注</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-sm text-slate-500 mb-2">较低预警</div>
          <div className="text-2xl font-semibold text-slate-600">{lowUrgencyCount}</div>
          <div className="text-sm text-slate-500 mt-2">可稍后处理</div>
        </div>
      </div>

      {/* 筛选区域 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="text-lg font-medium text-slate-800">预警筛选</div>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* 紧急程度筛选 */}
            <select
              value={selectedUrgency}
              onChange={(e) => setSelectedUrgency(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
            >
              <option value="all">全部紧急程度</option>
              <option value="high">紧急</option>
              <option value="medium">中等</option>
              <option value="low">较低</option>
            </select>

            {/* 分类筛选 */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
            >
              <option value="all">全部分类</option>
              <option value="耗材">耗材</option>
              <option value="试剂">试剂</option>
              <option value="设备">设备</option>
            </select>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium"
              >
                重置筛选
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 预警表格 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  产品名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  分类
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  当前库存
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  最低库存
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  库存比例
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  紧急程度
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  建议操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAlerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-800">{alert.productName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">{alert.category}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-lg font-semibold text-rose-600">{alert.currentStock}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">{alert.minStock}</div>
                  </td>
                  <td className="px-6 py-4">
                    <StockRatioBar current={alert.currentStock} min={alert.minStock} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <UrgencyBadge urgency={alert.urgency} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2">
                      <button className="px-3 py-1.5 text-sm bg-rose-50 text-rose-700 rounded hover:bg-rose-100 transition-colors font-medium">
                        立即补货
                      </button>
                      <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors">
                        查看详情
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 当筛选后无数据时显示 */}
        {filteredAlerts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-lg font-medium text-slate-500">暂无匹配的预警记录</div>
            <p className="text-slate-500 mt-2">尝试调整筛选条件或处理完所有预警后再次查看。</p>
          </div>
        )}
      </div>

      {/* 预警处理建议 */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-rose-50 border border-rose-100 rounded-lg p-4">
          <h3 className="font-semibold text-rose-800 mb-2">紧急预警处理建议</h3>
          <ul className="text-sm text-rose-700 space-y-1">
            <li>• 立即联系采购部门安排紧急补货</li>
            <li>• 考虑临时调拨其他库存</li>
            <li>• 通知相关使用部门调整计划</li>
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 mb-2">中等预警处理建议</h3>
          <ul className="text-sm text-amber-700 space-y-1">
            <li>• 本周内安排补货计划</li>
            <li>• 监控库存消耗速度</li>
            <li>• 评估是否需调整最低库存标准</li>
          </ul>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-800 mb-2">预警管理说明</h3>
          <p className="text-sm text-slate-600">
            预警系统根据当前库存与最低库存的比例自动生成。建议定期检查并处理预警，确保库存健康。
          </p>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：低库存预警旨在提前发现库存不足风险。点击“立即补货”可快速发起采购流程，“查看详情”可了解更多产品信息。
        </div>
      </div>
    </div>
  );
}

export default Alerts;