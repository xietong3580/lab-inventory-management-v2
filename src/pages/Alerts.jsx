import { useState, useMemo, useEffect } from 'react';
import { productService } from '../services/dataService';
import { usePermission } from '../hooks/usePermission';
import { calculateUrgency } from '../utils/inventoryHelpers';
import Pagination from '../components/common/Pagination';

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
  // 弹窗状态
  const [detailAlert, setDetailAlert] = useState(null);   // 查看详情弹窗
  const [reminderAlert, setReminderAlert] = useState(null); // 补货提醒弹窗
  const [copyText, setCopyText] = useState('');            // 复制状态反馈
  const itemsPerPage = 8;

  // Step 10-21D：calculateUrgency 从 inventoryHelpers 导入，不再内联定义

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
        sku: product.sku,
        currentStock: product.currentStock,
        minStock: product.minStock,
        category: product.category,
        location: product.location,
        unit: product.unit,
        urgency: calculateUrgency(product)
      }));
  }, [productsData.productsWithStatus]); // 依赖产品数据变化

  // 从当前低库存产品中动态提取真实库存分类（去重、去空、排序）
  const categoryOptions = useMemo(() => {
    const categories = new Set();
    dynamicAlerts.forEach(alert => {
      const cat = alert.category;
      if (cat && typeof cat === 'string' && cat.trim()) {
        categories.add(cat.trim());
      }
    });
    return Array.from(categories).sort();
  }, [dynamicAlerts]);

  // 筛选数据
  const filteredAlerts = dynamicAlerts.filter(alert => {
    if (selectedUrgency !== 'all' && alert.urgency !== selectedUrgency) return false;
    if (selectedCategory !== 'all' && alert.category !== selectedCategory) return false;
    return true;
  });

  // 统计计算（基于当前筛选后的 filteredAlerts，随筛选条件联动）
  const totalAlerts = filteredAlerts.length;
  const highUrgencyCount = filteredAlerts.filter(a => a.urgency === 'high').length;
  const mediumUrgencyCount = filteredAlerts.filter(a => a.urgency === 'medium').length;
  const lowUrgencyCount = filteredAlerts.filter(a => a.urgency === 'low').length;

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

  // 打开详情弹窗
  const handleOpenDetail = (alert) => setDetailAlert(alert);
  const handleCloseDetail = () => setDetailAlert(null);

  // 打开补货提醒弹窗
  const handleOpenReminder = (alert) => {
    setDetailAlert(null); // 如果从详情弹窗进入，先关闭详情
    setReminderAlert(alert);
  };
  const handleCloseReminder = () => setReminderAlert(null);

  // 生成补货提醒文本
  const getReminderText = (alert) => {
    const unit = (alert.unit && String(alert.unit).trim()) || '';
    const suggestQty = Math.max(Number(alert.minStock || 0) - Number(alert.currentStock || 0), 0);
    const unitWithSpace = unit ? ` ${unit}` : '';
    return `【库存提醒】${alert.productName}当前库存 ${alert.currentStock}${unitWithSpace}，低于最低库存 ${alert.minStock}${unitWithSpace}，建议至少补足 ${suggestQty}${unitWithSpace}。请确认是否需要安排采购或补货。`;
  };

  // 复制提醒内容
  const handleCopyReminder = async (alert) => {
    const text = getReminderText(alert);
    try {
      await navigator.clipboard.writeText(text);
      setCopyText('提醒内容已复制');
    } catch {
      setCopyText('复制失败，请手动复制');
    }
    setTimeout(() => setCopyText(''), 2500);
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

      {/* 统计提示 */}
      <p className="text-xs text-slate-400 mb-6 -mt-4">
        当前统计基于下方筛选条件实时计算
      </p>

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
              {categoryOptions.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
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
                          onClick={() => handleOpenReminder(alert)}
                          disabled={!canWrite}
                          title={!canWrite ? adminOnlyTitle : '生成补货提醒'}
                          className={`px-3 py-1.5 text-sm bg-slate-50 text-rose-600 border border-rose-200 rounded hover:bg-rose-50 transition-colors font-medium ${
                            !canWrite ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          补货提醒
                        </button>
                        <button
                          onClick={() => handleOpenDetail(alert)}
                          className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                        >
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
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
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

      {/* 低库存详情弹窗 */}
      {detailAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">低库存详情</h2>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">产品名称</span>
                <span className="text-sm font-medium text-slate-800">{detailAlert.productName}</span>
              </div>
              {detailAlert.sku && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">SKU</span>
                  <span className="text-sm font-medium text-slate-800">{detailAlert.sku}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">库存分类</span>
                <span className="text-sm font-medium text-slate-800">{detailAlert.category}</span>
              </div>
              {detailAlert.location && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">存储位置</span>
                  <span className="text-sm font-medium text-slate-800">{detailAlert.location}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">当前库存</span>
                <span className="text-sm font-medium text-slate-800">
                  {detailAlert.currentStock}{detailAlert.unit ? ` ${detailAlert.unit}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">最低库存</span>
                <span className="text-sm font-medium text-slate-800">
                  {detailAlert.minStock}{detailAlert.unit ? ` ${detailAlert.unit}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">库存比例</span>
                <span className="text-sm font-medium text-slate-800">
                  {Math.round((Number(detailAlert.currentStock) / (Number(detailAlert.minStock) || 1)) * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">紧急程度</span>
                <UrgencyBadge urgency={detailAlert.urgency} />
              </div>
              <div className="pt-3 border-t border-slate-100">
                <div className="text-sm text-slate-700 leading-relaxed">
                  当前库存低于或接近最低库存标准，建议先核对实物库存和近期出入库记录，再根据实际情况安排补货。
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={handleCloseDetail}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium"
              >
                关闭
              </button>
              <button
                onClick={() => handleOpenReminder(detailAlert)}
                disabled={!canWrite}
                title={!canWrite ? adminOnlyTitle : ''}
                className={`px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium ${
                  !canWrite ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                生成补货提醒
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 补货提醒弹窗 */}
      {reminderAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">补货提醒</h2>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">产品名称</span>
                <span className="text-sm font-medium text-slate-800">{reminderAlert.productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">当前库存</span>
                <span className="text-sm font-medium text-slate-800">
                  {reminderAlert.currentStock}{reminderAlert.unit ? ` ${reminderAlert.unit}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">最低库存</span>
                <span className="text-sm font-medium text-slate-800">
                  {reminderAlert.minStock}{reminderAlert.unit ? ` ${reminderAlert.unit}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">建议补足数量</span>
                <span className="text-sm font-medium text-slate-800">
                  {Math.max(Number(reminderAlert.minStock || 0) - Number(reminderAlert.currentStock || 0), 0)}{reminderAlert.unit ? ` ${reminderAlert.unit}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">库存分类</span>
                <span className="text-sm font-medium text-slate-800">{reminderAlert.category}</span>
              </div>
              {reminderAlert.location && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">存储位置</span>
                  <span className="text-sm font-medium text-slate-800">{reminderAlert.location}</span>
                </div>
              )}
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500 mb-2">提醒内容</div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 leading-relaxed">
                  {getReminderText(reminderAlert)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 leading-relaxed">
                该提醒仅用于通知采购负责人，不会自动修改库存。实际到货后，请通过出入库记录执行入库。
              </div>
            </div>
            {/* 复制反馈 */}
            {copyText && (
              <div className="mx-6 p-2 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-700 text-center">
                {copyText}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-200 flex justify-between">
              <button
                onClick={() => handleCopyReminder(reminderAlert)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium text-sm"
              >
                复制提醒内容
              </button>
              <button
                onClick={handleCloseReminder}
                className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部提示 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          低库存预警用于辅助日常库存维护。点击"补货提醒"可生成提醒内容方便通知采购负责人，"查看详情"可了解产品信息及历史台账。预警不会自动修改库存数量。
        </div>
      </div>
    </div>
  );
}

export default Alerts;