import { useState, useMemo, useEffect } from 'react';
import { productService } from '../services/dataService';
import { usePermission } from '../hooks/usePermission';

// 紧急程度标签组件
function UrgencyBadge({ urgency }) {
  const config = {
    high: { text: '紧急', bg: 'bg-rose-50', textColor: 'text-rose-600' },
    medium: { text: '中等', bg: 'bg-amber-50', textColor: 'text-amber-600' },
    low: { text: '较低', bg: 'bg-slate-100', textColor: 'text-slate-600' },
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
  const currentNum = Number(current) || 0;
  const minNum = Number(min) || 1; // 避免除以0
  const ratio = Math.min(100, Math.round((currentNum / minNum) * 100));
  const getColor = () => {
    if (ratio <= 30) return 'bg-rose-400';
    if (ratio <= 60) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-700">当前库存: {currentNum}</span>
        <span className="text-slate-500">最低: {minNum}</span>
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
  const { canWrite, adminOnlyTitle } = usePermission();

  const [selectedUrgency, setSelectedUrgency] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // 计算紧急程度（根据库存百分比）
  const calculateUrgency = (product) => {
    const current = Number(product.currentStock) || 0;
    const min = Number(product.minStock) || 1; // 避免除以0
    const ratio = current / min;
    if (ratio <= 0.2) return 'high';
    if (ratio <= 0.5) return 'medium';
    return 'low';
  };

  // 产品数据状态（通过统一服务层获取）
  const [productsData, setProductsData] = useState({
    productsWithStatus: [],
    loading: true,
    error: null
  });

  // 通过统一服务层获取产品数据
  useEffect(() => {
    let isMounted = true;

    const fetchProductsData = async () => {
      try {
        setProductsData(prev => ({ ...prev, loading: true, error: null }));

        // 通过统一服务层获取产品数据
        const productsWithStatus = await productService.getProductsWithCalculatedStatus();

        if (isMounted) {
          setProductsData({
            productsWithStatus,
            loading: false,
            error: null
          });
        }
      } catch (error) {
        console.error('[Alerts] 获取产品数据失败:', error);
        if (isMounted) {
          setProductsData(prev => ({
            ...prev,
            loading: false,
            error: '产品数据加载失败，使用降级数据'
          }));
          // 错误时保持空数组，dynamicAlerts计算会使用空数组但不会崩溃
        }
      }
    };

    fetchProductsData();

    return () => {
      isMounted = false;
    };
  }, []); // 空依赖数组，只在组件挂载时获取一次

  // 实时计算动态预警数据（基于最新产品数据）
  const dynamicAlerts = useMemo(() => {
    const products = productsData.productsWithStatus || [];

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
  }, [productsData.productsWithStatus]); // 依赖产品数据变化

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

  // 当筛选条件变化时重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedUrgency, selectedCategory]);

  // 分页计算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedAlerts = filteredAlerts.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage);

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
          以下产品当前库存低于或接近最低库存标准，建议管理员根据实际情况安排补货或核对库存。
        </p>
      </div>

      {/* 预警统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-sm text-slate-500 mb-2">总预警数</div>
          <div className="text-2xl font-semibold text-slate-800">{totalAlerts}</div>
          <div className="text-sm text-slate-500 mt-2">当前预警产品</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-sm text-slate-500 mb-2">紧急</div>
          <div className="text-2xl font-semibold text-slate-800">{highUrgencyCount}</div>
          <div className="text-sm text-slate-500 mt-2">需优先关注</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-sm text-slate-500 mb-2">中等</div>
          <div className="text-2xl font-semibold text-slate-800">{mediumUrgencyCount}</div>
          <div className="text-sm text-slate-500 mt-2">需安排处理</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-sm text-slate-500 mb-2">较低</div>
          <div className="text-2xl font-semibold text-slate-800">{lowUrgencyCount}</div>
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
          <table className="min-w-[900px] md:min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  产品名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  分类
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  当前库存
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  最低库存
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  库存比例
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  紧急程度
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  建议操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {productsData.loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
                    </div>
                    <p className="mt-2 text-slate-600">正在加载预警数据...</p>
                  </td>
                </tr>
              ) : productsData.error ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <div className="text-slate-600 mb-2">{productsData.error}</div>
                    <p className="text-slate-500 text-sm">将显示降级数据或空列表</p>
                  </td>
                </tr>
              ) : (
                displayedAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-800">{alert.productName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-700">{alert.category}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-700">{alert.currentStock}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-700">{alert.minStock}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StockRatioBar current={alert.currentStock} min={alert.minStock} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <UrgencyBadge urgency={alert.urgency} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-2">
                        <button
                          disabled={!canWrite}
                          title={!canWrite ? adminOnlyTitle : ''}
                          className={`px-3 py-1.5 text-sm bg-slate-50 text-rose-600 border border-rose-200 rounded hover:bg-rose-50 transition-colors font-medium ${
                            !canWrite ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          安排补货
                        </button>
                        <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors">
                          查看详情
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页控制 */}
        {filteredAlerts.length > 0 && (
          <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-4 md:gap-0">
            <div className="w-full md:w-auto text-sm text-slate-600 text-center md:text-left">
              显示第 {startIndex + 1} - {Math.min(endIndex, filteredAlerts.length)} 条，共 {filteredAlerts.length} 条记录
            </div>
            <div className="w-full md:w-auto flex justify-center flex-wrap items-center gap-2 whitespace-nowrap">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded border text-sm ${
                  currentPage === 1
                    ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                上一页
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1.5 rounded border text-sm ${
                        currentPage === pageNum
                          ? 'bg-slate-700 text-white'
                          : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 5 && (
                  <>
                    <span className="text-slate-400">...</span>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      className={`px-3 py-1.5 rounded border text-sm ${
                        currentPage === totalPages
                          ? 'bg-slate-700 text-white'
                          : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 rounded border text-sm ${
                  currentPage === totalPages
                    ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                下一页
              </button>
            </div>
          </div>
        )}

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
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-800 mb-2">紧急预警处理建议</h3>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li>• 联系采购部门安排补货</li>
            <li>• 评估是否需临时调拨</li>
            <li>• 通知相关使用部门</li>
          </ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-800 mb-2">中等预警处理建议</h3>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li>• 本周内安排补货计划</li>
            <li>• 关注库存消耗速度</li>
            <li>• 评估最低库存标准是否合理</li>
          </ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-800 mb-2">预警管理说明</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            低库存预警用于辅助日常库存维护，不会自动修改库存数量。预警根据当前库存与最低库存的比例自动生成，建议定期检查并处理。如库存数量与实际不符，请先核对出入库记录和产品台账。
          </p>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          低库存预警用于辅助日常库存维护。点击"安排补货"可发起采购流程，"查看详情"可了解产品信息及历史台账。预警不会自动修改库存数量。
        </div>
      </div>
    </div>
  );
}

export default Alerts;