import { useState, useEffect } from 'react';
import { getTransactions, addTransaction, getAllProducts } from '../services/productService';

// 类型标签组件
function TypeBadge({ type }) {
  const config = {
    入库: { text: '入库', bg: 'bg-emerald-50', textColor: 'text-emerald-700' },
    出库: { text: '出库', bg: 'bg-rose-50', textColor: 'text-rose-700' },
  };
  const { text, bg, textColor } = config[type] || config.入库;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

// 状态标签组件
function StatusBadge({ status }) {
  const config = {
    completed: { text: '已完成', bg: 'bg-emerald-50', textColor: 'text-emerald-700' },
    pending: { text: '处理中', bg: 'bg-amber-50', textColor: 'text-amber-700' },
  };
  const { text, bg, textColor } = config[status] || config.pending;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${bg} ${textColor}`}>
      {text}
    </span>
  );
}

function Transactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
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

  // 筛选选项
  const typeOptions = ['all', '入库', '出库'];

  // 初始化数据
  useEffect(() => {
    setTransactionRecords(getTransactions());
    setProducts(getAllProducts());
  }, []);

  // 分页计算
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedRecords = transactionRecords.slice(startIndex, endIndex);
  const totalPages = Math.ceil(transactionRecords.length / itemsPerPage);

  const handleSearch = (e) => {
    e.preventDefault();
    // 搜索逻辑占位
    console.log('搜索:', searchTerm, '类型:', selectedType, '日期范围:', dateRange);
  };

  const handleReset = () => {
    setSearchTerm('');
    setSelectedType('all');
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
      const newTransaction = addTransaction({
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

  // 获取产品选择选项
  const productOptions = products.map(product => ({
    value: product.id,
    label: `${product.name} (${product.sku}) - 当前库存: ${product.currentStock} ${product.unit}`
  }));

  return (
    <div className="p-6">
      {/* 页面标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">出入库记录</h1>
        <p className="text-slate-600 mt-1">
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
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <form onSubmit={handleSearch} className="space-y-4">
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
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
              >
                {typeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? '全部类型' : option}
                  </option>
                ))}
              </select>
            </div>

            {/* 开始日期 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                开始日期
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => handleDateChange('start', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              />
            </div>

            {/* 结束日期 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                结束日期
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => handleDateChange('end', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors font-medium"
            >
              重置筛选
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium"
            >
              搜索记录
            </button>
          </div>
        </form>
      </div>

      {/* 记录表格 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* 表格头部 */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  日期时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  产品名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  数量
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  操作人
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  备注
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedRecords.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">{record.date}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-800">{record.productName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <TypeBadge type={record.type} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-800">
                      {record.quantity} {record.unit}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-slate-700">{record.operator}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-700 max-w-xs truncate" title={record.notes}>
                      {record.notes || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors">
                        详情
                      </button>
                      <button className="px-3 py-1.5 text-sm bg-rose-50 text-rose-700 rounded hover:bg-rose-100 transition-colors">
                        撤销
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页控制 */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            显示第 {startIndex + 1} - {Math.min(endIndex, transactionRecords.length)} 条，共 {transactionRecords.length} 条记录
          </div>
          <div className="flex items-center gap-2">
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
                    className={`w-8 h-8 rounded text-sm ${
                      currentPage === pageNum
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
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
                    className={`w-8 h-8 rounded text-sm ${
                      currentPage === totalPages
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
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
      </div>

      {/* 底部提示 */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="text-sm text-slate-600">
          提示：出入库记录用于追踪库存变动。状态为“处理中”的记录可能尚未完成库存更新。点击“详情”查看完整信息，“撤销”可取消未完成的记录。
        </div>
      </div>

      {/* 新增交易记录模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200">
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
              <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
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
    </div>
  );
}

export default Transactions;