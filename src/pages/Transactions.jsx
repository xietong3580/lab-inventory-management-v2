import { useState, useEffect, useMemo } from 'react';
import { getTransactions, addTransaction, getAllProducts, reverseTransaction } from '../services/productService';

// 类型标签组件
function TypeBadge({ type }) {
  const config = {
    入库: { text: '入库', bg: 'bg-emerald-50', textColor: 'text-emerald-700' },
    出库: { text: '出库', bg: 'bg-rose-50', textColor: 'text-rose-700' },
  };
  const { text, bg, textColor } = config[type] || config.入库;

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

// 状态标签组件
function StatusBadge({ status }) {
  const config = {
    completed: { text: '已完成', bg: 'bg-emerald-50', textColor: 'text-emerald-700' },
    pending: { text: '处理中', bg: 'bg-amber-50', textColor: 'text-amber-700' },
    reversed: { text: '已撤销', bg: 'bg-slate-100', textColor: 'text-slate-500' },
  };

  // 确保状态值被正确trimmed和标准化
  const normalizedStatus = (status || '').trim();
  const { text, bg, textColor } = config[normalizedStatus] || config.pending;

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

function Transactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedTimeRange, setSelectedTimeRange] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 交易记录和产品数据
  const [transactionRecords, setTransactionRecords] = useState([]);
  const [products, setProducts] = useState([]);

  // 模态框和表单相关状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    type: '入库',
    quantity: 0,
    operator: '',
    notes: ''
  });
  const [formError, setFormError] = useState('');
  const [reversingTransactionId, setReversingTransactionId] = useState(null);
  const [reversalError, setReversalError] = useState('');

  // 筛选选项
  const typeOptions = ['all', '入库', '出库'];
  const statusOptions = ['all', 'completed', 'reversed', 'pending'];

  // 初始化数据
  useEffect(() => {
    setTransactionRecords(getTransactions());
    setProducts(getAllProducts());
  }, []);

  // 筛选交易记录
  const filteredRecords = useMemo(() => {
    let filtered = [...transactionRecords];

    // 1. 按时间范围筛选（快捷时间范围）
    if (selectedTimeRange !== 'all') {
      const now = new Date();
      let startDate = new Date();

      switch (selectedTimeRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'month':
          startDate.setDate(now.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
          break;
        default:
          break;
      }

      filtered = filtered.filter(record => {
        if (!record.date) return false;
        try {
          const recordDate = new Date(record.date);
          return recordDate >= startDate;
        } catch {
          return false;
        }
      });
    }

    // 2. 按自定义日期范围筛选（可与快捷时间范围叠加）
    if (dateRange.start) {
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(record => {
        if (!record.date) return false;
        try {
          const recordDate = new Date(record.date);
          return recordDate >= start;
        } catch {
          return false;
        }
      });
    }

    if (dateRange.end) {
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(record => {
        if (!record.date) return false;
        try {
          const recordDate = new Date(record.date);
          return recordDate <= end;
        } catch {
          return false;
        }
      });
    }

    // 3. 按类型筛选
    if (selectedType !== 'all') {
      filtered = filtered.filter(record => record.type === selectedType);
    }

    // 4. 按状态筛选
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(record => record.status === selectedStatus);
    }

    // 5. 按关键字搜索
    if (searchTerm.trim()) {
      const keyword = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(record =>
        record.productName.toLowerCase().includes(keyword) ||
        record.operator.toLowerCase().includes(keyword) ||
        (record.notes && record.notes.toLowerCase().includes(keyword))
      );
    }

    return filtered;
  }, [transactionRecords, selectedTimeRange, dateRange, selectedType, selectedStatus, searchTerm]);

  // 当筛选条件变化时重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTimeRange, selectedType, selectedStatus, searchTerm, dateRange]);

  // 分页计算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedRecords = filteredRecords.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);


  const handleReset = () => {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedTimeRange('all');
    setSelectedStatus('all');
    setDateRange({ start: '', end: '' });
    setCurrentPage(1);
  };

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  // 打开新增记录模态框
  const handleOpenModal = () => {
    setFormData({
      productId: '',
      type: '入库',
      quantity: 1,
      operator: '',
      notes: ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // 关闭新增记录模态框
  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // 表单字段变化处理
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 表单提交 - 新增交易记录
  const handleFormSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    // 基础校验
    if (!formData.productId) {
      setFormError('请选择产品');
      return;
    }
    if (!formData.quantity || formData.quantity <= 0) {
      setFormError('请输入有效的数量（大于0）');
      return;
    }
    if (!formData.operator.trim()) {
      setFormError('请输入操作人');
      return;
    }

    try {
      // 调用服务添加交易记录
      addTransaction({
        productId: formData.productId,
        type: formData.type,
        quantity: Number(formData.quantity),
        operator: formData.operator.trim(),
        notes: formData.notes.trim()
      });

      // 刷新交易记录列表
      setTransactionRecords(getTransactions());
      // 刷新产品列表（其他页面会用到）
      setProducts(getAllProducts());

      // 关闭模态框并重置表单
      handleCloseModal();
    } catch (error) {
      setFormError(error.message || '添加交易记录失败');
      console.error('添加交易记录失败:', error);
    }
  };

  // 点击撤销按钮
  const handleReverseClick = (transactionId) => {
    setReversingTransactionId(transactionId);
    setReversalError('');
  };

  // 取消撤销操作
  const handleCancelReverse = () => {
    setReversingTransactionId(null);
    setReversalError('');
  };

  // 确认撤销交易记录
  const handleConfirmReverse = () => {
    if (!reversingTransactionId) return;

    try {
      setReversalError('');
      // 调用撤销函数（同步）
      reverseTransaction(reversingTransactionId, '当前用户');

      // 刷新交易记录列表
      setTransactionRecords(getTransactions());
      // 刷新产品列表（其他页面会用到）
      setProducts(getAllProducts());

      // 关闭确认对话框
      setReversingTransactionId(null);
    } catch (error) {
      setReversalError(error.message || '撤销交易记录失败');
      console.error('撤销交易记录失败:', error);
    }
  };

  // 格式化交易时间（紧凑格式：MM-DD HH:MM）
  const formatTransactionTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      // 格式: YYYY-MM-DD HH:MM
      const month = timestamp.substring(5, 7);
      const day = timestamp.substring(8, 10);
      const hour = timestamp.substring(11, 13);
      const minute = timestamp.substring(14, 16);
      return `${month}-${day} ${hour}:${minute}`;
    } catch {
      return timestamp;
    }
  };

  // 获取产品选择选项
  const productOptions = products.map(product => ({
    value: product.id,
    label: `${product.name} (${product.sku}) - 当前库存: ${product.currentStock} ${product.unit}`
  }));

  return (
    <div className="p-4 md:p-6">
      {/* 页面标题区 */}
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-800">出入库记录</h1>
        <p className="text-slate-600 mt-1 text-sm md:text-base">
          查看和管理所有产品的入库与出库操作记录。
        </p>
      </div>

      {/* 操作栏：新增按钮 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* 左侧：新增记录按钮 */}
          <button
            onClick={handleOpenModal}
            className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium"
          >
            + 新增记录
          </button>

          {/* 右侧：占位，保持布局平衡 */}
          <div></div>
        </div>
      </div>

      {/* 筛选区域 */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 关键字搜索 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                关键字搜索
              </label>
              <input
                type="text"
                placeholder="产品名称、操作人..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
              />
            </div>

            {/* 记录类型筛选 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                记录类型
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white text-sm"
              >
                {typeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? '全部类型' : option}
                  </option>
                ))}
              </select>
            </div>

            {/* 状态筛选 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                记录状态
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white text-sm"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? '全部状态' :
                     option === 'completed' ? '已完成' :
                     option === 'reversed' ? '已撤销' : '处理中'}
                  </option>
                ))}
              </select>
            </div>

            {/* 清空筛选按钮（仅在存在筛选条件时显示） */}
            <div className="flex items-end">
              {(searchTerm || selectedType !== 'all' || selectedStatus !== 'all' || selectedTimeRange !== 'all' || dateRange.start || dateRange.end) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 w-full"
                >
                  清空筛选
                </button>
              )}
            </div>
          </div>

          {/* 第二行：时间范围快捷筛选 + 自定义日期范围 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 时间范围快捷筛选 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                快捷时间范围
              </label>
              <div className="flex flex-wrap gap-1">
                {[
                  { value: 'all', label: '全部' },
                  { value: 'today', label: '今日' },
                  { value: 'week', label: '近7天' },
                  { value: 'month', label: '近30天' }
                ].map((range) => (
                  <button
                    key={range.value}
                    type="button"
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      selectedTimeRange === range.value
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                    onClick={() => setSelectedTimeRange(range.value)}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 自定义开始日期 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                开始日期
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => handleDateChange('start', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
              />
            </div>

            {/* 自定义结束日期 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                结束日期
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => handleDateChange('end', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
              />
            </div>

            {/* 占位列，保持布局平衡 */}
            <div></div>
          </div>
        </div>
      </div>

      {/* 记录表格和卡片 */}
      <div className="bg-white border border-slate-200 rounded-lg">
        {transactionRecords.length === 0 ? (
          // 系统暂无记录
          <div className="py-12 text-center">
            <div className="text-slate-500 mb-2">暂无出入库记录</div>
            <div className="text-sm text-slate-500 max-w-md mx-auto">
              点击"新增记录"按钮添加第一条出入库记录。
            </div>
          </div>
        ) : filteredRecords.length === 0 ? (
          // 筛选无结果
          <div className="py-12 text-center">
            <div className="text-slate-500 mb-2">未找到匹配的记录</div>
            <div className="text-sm text-slate-500 max-w-md mx-auto mb-4">
              当前筛选条件下未找到匹配的出入库记录。请尝试：
            </div>
            <div className="text-sm text-slate-600 max-w-md mx-auto space-y-1">
              <p>• 调整搜索关键词</p>
              <p>• 选择不同的记录类型</p>
              <p>• 调整记录状态筛选</p>
              <p>• 调整时间范围或自定义日期</p>
              <p>• 清空筛选条件以查看全部记录</p>
            </div>
            {(searchTerm || selectedType !== 'all' || selectedStatus !== 'all' || selectedTimeRange !== 'all' || dateRange.start || dateRange.end) && (
              <button
                type="button"
                className="mt-6 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                onClick={handleReset}
              >
                清空筛选
              </button>
            )}
          </div>
        ) : (
          <>
            {/* 桌面端表格视图 (md及以上) */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-24">
                        时间
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        产品
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-20">
                        类型
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-24">
                        数量
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-28">
                        操作人
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-24">
                        状态
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        备注
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-32">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {displayedRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap w-24">
                          <div className="text-sm font-medium text-slate-800" title={record.date}>
                            {formatTransactionTime(record.date)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-sm font-medium text-slate-800">{record.productName}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap w-20">
                          <TypeBadge type={record.type} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap w-24">
                          <div className="text-sm font-medium text-slate-800">
                            {record.quantity} {record.unit}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap w-28">
                          <div className="text-sm text-slate-700">{record.operator}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap w-24">
                          <StatusBadge status={record.status} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-sm text-slate-700 max-w-xs truncate" title={record.notes}>
                            {record.notes || '-'}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap w-32">
                          <div className="flex items-center gap-2">
                            <button className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors">
                              详情
                            </button>
                            {record.status === 'completed' ? (
                              <button
                                onClick={() => handleReverseClick(record.id)}
                                className="px-2 py-1 text-xs bg-rose-50 text-rose-700 rounded hover:bg-rose-100 transition-colors"
                                title="撤销此交易记录并回滚库存"
                              >
                                撤销
                              </button>
                            ) : record.status === 'reversed' ? (
                              <button
                                className="px-2 py-1 text-xs bg-slate-100 text-slate-400 rounded cursor-not-allowed"
                                title="此记录已撤销"
                                disabled
                              >
                                已撤销
                              </button>
                            ) : (
                              <button
                                className="px-2 py-1 text-xs bg-slate-100 text-slate-400 rounded cursor-not-allowed"
                                title="只能撤销已完成状态的记录"
                                disabled
                              >
                                撤销
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 移动端卡片视图 (md以下) */}
            <div className="block md:hidden space-y-3 p-4">
              {displayedRecords.map((record) => (
                <div
                  key={record.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors"
                >
                  {/* 卡片顶部：时间和类型 */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="text-sm font-medium text-slate-800" title={record.date}>
                      {formatTransactionTime(record.date)}
                    </div>
                    <div className="flex items-center gap-2">
                      <TypeBadge type={record.type} />
                      <StatusBadge status={record.status} />
                    </div>
                  </div>

                  {/* 卡片内容：产品、数量、操作人 */}
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-slate-700 w-16">产品：</div>
                      <div className="text-sm text-slate-800 flex-1 truncate">
                        {record.productName}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-slate-700 w-16">数量：</div>
                      <div className="text-sm text-slate-800 flex-1">
                        {record.quantity} {record.unit}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-slate-700 w-16">操作人：</div>
                      <div className="text-sm text-slate-800 flex-1">
                        {record.operator}
                      </div>
                    </div>
                    {record.notes && (
                      <div className="flex items-start">
                        <div className="text-sm font-medium text-slate-700 w-16">备注：</div>
                        <div className="text-sm text-slate-600 flex-1">
                          {record.notes}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 卡片底部：操作按钮 */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors flex-1">
                      详情
                    </button>
                    {record.status === 'completed' ? (
                      <button
                        onClick={() => handleReverseClick(record.id)}
                        className="px-3 py-1.5 text-sm bg-rose-50 text-rose-700 rounded hover:bg-rose-100 transition-colors flex-1"
                        title="撤销此交易记录并回滚库存"
                      >
                        撤销
                      </button>
                    ) : record.status === 'reversed' ? (
                      <button
                        className="px-3 py-1.5 text-sm bg-slate-100 text-slate-400 rounded cursor-not-allowed flex-1"
                        title="此记录已撤销"
                        disabled
                      >
                        已撤销
                      </button>
                    ) : (
                      <button
                        className="px-3 py-1.5 text-sm bg-slate-100 text-slate-400 rounded cursor-not-allowed flex-1"
                        title="只能撤销已完成状态的记录"
                        disabled
                      >
                        撤销
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 分页控制 */}
            <div className="px-3 py-2 md:px-6 md:py-4 border-t border-slate-200 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-4 md:gap-0">
              <div className="w-full md:w-auto text-sm text-slate-600 text-center md:text-left">
                显示第 {startIndex + 1} - {Math.min(endIndex, filteredRecords.length)} 条，共 {filteredRecords.length} 条记录
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
          </>
        )}
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：出入库记录用于追踪库存变动。状态为“处理中”的记录可能尚未完成库存更新。点击“详情”查看完整信息，“撤销”可取消未完成的记录。
        </div>
      </div>

      {/* 新增交易记录模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-3 py-2 md:px-6 md:py-4 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800">
                新增出入库记录
              </h2>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="p-6 space-y-4">
                {/* 错误提示 */}
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-md">
                    <div className="text-sm text-rose-700">{formError}</div>
                  </div>
                )}

                {/* 产品选择 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    产品 *
                  </label>
                  <select
                    name="productId"
                    value={formData.productId}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                  >
                    <option value="">请选择产品</option>
                    {productOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 交易类型和数量 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      类型 *
                    </label>
                    <select
                      name="type"
                      value={formData.type}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                    >
                      <option value="入库">入库</option>
                      <option value="出库">出库</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      数量 *
                    </label>
                    <input
                      type="number"
                      name="quantity"
                      value={formData.quantity}
                      onChange={handleFormChange}
                      min="1"
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                      placeholder="请输入数量"
                    />
                  </div>
                </div>

                {/* 操作人 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    操作人 *
                  </label>
                  <input
                    type="text"
                    name="operator"
                    value={formData.operator}
                    onChange={handleFormChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    placeholder="请输入操作人姓名"
                  />
                </div>

                {/* 备注 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    备注
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleFormChange}
                    rows="3"
                    className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    placeholder="请输入备注信息（选填）"
                  />
                </div>

              </div>

              {/* 模态框底部按钮 */}
              <div className="px-3 py-2 md:px-6 md:py-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium"
                >
                  添加记录
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 撤销确认对话框 */}
      {reversingTransactionId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="px-3 py-2 md:px-6 md:py-4 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800">
                确认撤销交易记录
              </h2>
            </div>

            <div className="p-6">
              {/* 错误提示 */}
              {reversalError && (
                <div className="mb-4 p-3.5 bg-rose-50 border border-rose-300 rounded-md">
                  <div className="flex items-start">
                    <div className="shrink-0 mr-3 mt-0.5">
                      <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-rose-600">!</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-rose-800 mb-1">无法撤销此交易</div>
                      <div className="text-sm text-rose-700">{reversalError}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-slate-700 mb-6">
                <p className="font-medium text-slate-800 mb-3">您确定要撤销此交易记录吗？</p>
                <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-4">
                  <div className="text-sm font-medium text-slate-700 mb-2">此操作将执行以下业务规则：</div>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-start">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 mr-2"></span>
                      <span><span className="font-medium">库存回滚：</span>根据交易类型调整产品库存</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 mr-2"></span>
                      <span><span className="font-medium">状态更新：</span>交易记录状态将改为"已撤销"</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 mr-2"></span>
                      <span><span className="font-medium">业务验证：</span>系统将检查库存安全规则（库存不能为负数）</span>
                    </li>
                    <li className="flex items-start">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 mr-2"></span>
                      <span><span className="font-medium">不可逆：</span>撤销后无法恢复，请谨慎操作</span>
                    </li>
                  </ul>
                </div>
                <p className="text-sm text-slate-600">如果遇到库存不足等情况，系统会显示明确的业务规则提示。</p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelReverse}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReverse}
                  className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors font-medium"
                >
                  确认撤销
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Transactions;