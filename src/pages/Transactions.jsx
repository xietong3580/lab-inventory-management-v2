import { useState, useEffect, useMemo, useRef } from 'react';
import { transactionService, productService } from '../services/dataService';
import { exportTransactionsToCSV } from '../utils/exportHelpers';
import { searchProducts } from '../utils/productFilterHelpers';
import { usePermission } from '../hooks/usePermission';

// 类型标签组件
function TypeBadge({ type }) {
  const config = {
    入库: { text: '入库', bg: 'bg-emerald-50', textColor: 'text-emerald-600' },
    出库: { text: '出库', bg: 'bg-sky-50', textColor: 'text-sky-600' },
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
    completed: { text: '已完成', bg: 'bg-slate-50', textColor: 'text-slate-600' },
    pending: { text: '处理中', bg: 'bg-amber-50', textColor: 'text-amber-600' },
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

  const { canWrite, adminOnlyTitle } = usePermission();

  // 交易记录和产品数据
  const [transactionRecords, setTransactionRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [errorTransactions, setErrorTransactions] = useState(null);

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
  const [detailRecord, setDetailRecord] = useState(null);

  // 操作反馈状态（防重复提交 + 页面级提示）
  const [isSaving, setIsSaving] = useState(false);
  const [isReversing, setIsReversing] = useState(false);
  const [actionMessage, setActionMessage] = useState(null); // { type: 'success'|'error', text: '...' }

  // 产品搜索选择器状态
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null); // 完整产品对象
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productSearchRef = useRef(null); // 搜索输入框 ref，用于失焦处理

  // 筛选选项
  const typeOptions = ['all', '入库', '出库'];
  const statusOptions = ['all', 'completed', 'reversed', 'pending'];

  // 初始化数据
  useEffect(() => {
    const fetchData = async () => {
      setLoadingTransactions(true);
      setErrorTransactions(null);

      try {
        // 获取交易记录
        const transactions = await transactionService.getTransactions();
        setTransactionRecords(transactions);
      } catch (error) {
        console.error('[Transactions] 获取交易记录失败:', error);
        setErrorTransactions('出入库记录加载失败，请刷新页面重试');
        // 保持空数组，页面仍可正常显示
      } finally {
        setLoadingTransactions(false);
      }

      try {
        // 获取产品数据
        const productsData = await productService.getAllProducts();
        setProducts(productsData);
      } catch (error) {
        console.error('[Transactions] 获取产品数据失败:', error);
        // 产品数据加载失败，下拉框可能为空，但不影响页面核心功能
      }
    };

    fetchData();
  }, []);

  // 筛选交易记录
  // Step 10-20E：出库库存不足计算（用于提交按钮禁用和即时提示）
  const stockInsufficient = useMemo(() => {
    if (formData.type !== '出库') return false;
    if (!selectedProduct) return false;
    return Number(formData.quantity) > selectedProduct.currentStock;
  }, [formData.type, formData.quantity, selectedProduct]);

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

    // 5. 按关键字搜索（产品货号/SKU、产品名称、操作人、备注）
    if (searchTerm.trim()) {
      const keyword = searchTerm.trim().toLowerCase();
      // Step 10-28A: 支持按产品货号/SKU搜索交易记录
      // 先找到匹配的产品ID，再按产品ID筛选交易记录
      const matchingProductIds = new Set(
        products
          .filter(p => {
            const sku = (p.sku || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            return sku.includes(keyword) || name.includes(keyword);
          })
          .map(p => p.id)
      );
      filtered = filtered.filter(record =>
        matchingProductIds.has(record.productId) ||
        record.productName.toLowerCase().includes(keyword) ||
        record.operator.toLowerCase().includes(keyword) ||
        (record.notes && record.notes.toLowerCase().includes(keyword))
      );
    }

    // 6. 按时间倒序排序（最新在前）
    filtered.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      try {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA; // 降序：最新在前
      } catch {
        return 0;
      }
    });

    return filtered;
  }, [transactionRecords, selectedTimeRange, dateRange, selectedType, selectedStatus, searchTerm]);

  // 当筛选条件变化时重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTimeRange, selectedType, selectedStatus, searchTerm, dateRange]);

  // 产品搜索匹配结果（出入库弹窗内使用）
  const productSearchResults = useMemo(() => {
    if (!productSearchTerm.trim()) return [];
    return searchProducts(products, productSearchTerm);
  }, [products, productSearchTerm]);

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

  const handleExport = () => {
    if (filteredRecords.length === 0) {
      alert('没有可导出的数据，请先调整筛选条件或等待数据加载。');
      return;
    }
    exportTransactionsToCSV(filteredRecords, products, 'transactions-export');
  };

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  // 打开新增记录模态框
  const handleOpenModal = () => {
    if (!canWrite) return; // viewer 不可新增记录
    setFormData({
      productId: '',
      type: '入库',
      quantity: 1,
      operator: '',
      notes: ''
    });
    setFormError('');
    setProductSearchTerm('');
    setSelectedProduct(null);
    setShowProductDropdown(false);
    setIsModalOpen(true);
  };

  // 关闭新增记录模态框
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setProductSearchTerm('');
    setSelectedProduct(null);
    setShowProductDropdown(false);
  };

  // 打开交易详情弹窗（只读，admin 和 viewer 均可使用）
  const handleShowDetail = (record) => {
    setDetailRecord(record);
  };

  // 关闭交易详情弹窗
  const handleCloseDetail = () => {
    setDetailRecord(null);
  };

  // 表单字段变化处理
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 产品搜索输入变化
  const handleProductSearchChange = (e) => {
    const value = e.target.value;
    setProductSearchTerm(value);
    // 用户开始输入时清除之前选中、显示下拉
    if (selectedProduct) {
      setSelectedProduct(null);
      setFormData(prev => ({ ...prev, productId: '' }));
    }
    setShowProductDropdown(true);
    setFormError('');
  };

  // 选中搜索结果中的产品
  const handleSelectProduct = (product) => {
    if (!product || !product.id) {
      console.error('[Transactions] 产品数据异常，缺少 id 字段', product);
      setFormError('产品数据异常，请刷新后重试');
      return;
    }
    setSelectedProduct(product);
    setFormData(prev => ({ ...prev, productId: product.id }));
    // 更新搜索词为已选产品显示文本，确保信息卡和输入框双重保障
    setProductSearchTerm(`${product.name} (${product.sku || ''})`);
    setShowProductDropdown(false);
    setFormError('');
  };

  // 清除已选产品（小 x 按钮）
  const handleClearSelectedProduct = () => {
    setSelectedProduct(null);
    setFormData(prev => ({ ...prev, productId: '' }));
    setProductSearchTerm('');
  };

  // 产品搜索键盘处理
  const handleProductSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      // Esc：关闭下拉
      setShowProductDropdown(false);
      return;
    }
    if (e.key === 'Enter' && productSearchResults.length > 0) {
      // Enter：选中排序第一的结果
      e.preventDefault();
      handleSelectProduct(productSearchResults[0]);
    }
  };

  // 搜索输入框失焦：关闭下拉（用户点击外部区域时）
  const handleProductSearchBlur = () => {
    setShowProductDropdown(false);
  };

  // 表单提交 - 新增交易记录
  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!canWrite || isSaving) return; // viewer 不可提交，防重复提交

    // 基础校验 — 区分"未操作"与"输入了但未选中"
    if (!formData.productId) {
      if (productSearchTerm.trim()) {
        setFormError('请先从搜索结果中选择产品');
      } else {
        setFormError('请选择产品');
      }
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

    // Step 10-20E：出库库存不足时前端直接禁止提交
    if (formData.type === '出库' && selectedProduct) {
      if (Number(formData.quantity) > selectedProduct.currentStock) {
        setFormError(
          `当前库存不足，无法提交出库记录。` +
          `当前库存: ${selectedProduct.currentStock} ${selectedProduct.unit || ''}，` +
          `出库数量: ${formData.quantity} ${selectedProduct.unit || ''}。` +
          `请调整数量或先完成入库。`
        );
        return;
      }
    }

    setIsSaving(true);
    setFormError('');

    try {
      // 调用服务添加交易记录
      await transactionService.addTransaction({
        productId: formData.productId,
        type: formData.type,
        quantity: Number(formData.quantity),
        operator: formData.operator.trim(),
        notes: formData.notes.trim()
      });

      // 刷新交易记录列表
      const updatedTransactions = await transactionService.getTransactions();
      setTransactionRecords(updatedTransactions);
      // 刷新产品列表（其他页面会用到）
      const updatedProducts = await productService.getAllProducts();
      setProducts(updatedProducts);

      // 关闭模态框并显示成功提示
      handleCloseModal();
      setActionMessage({
        type: 'success',
        text: formData.type === '入库' ? '入库记录已保存' : '出库记录已保存'
      });
      setTimeout(() => setActionMessage(null), 3000);
    } catch (error) {
      const errMsg = error.message || '';
      // 业务错误：库存不足等
      if (errMsg.includes('库存不足')) {
        setFormError('库存不足，无法出库');
      } else {
        setFormError('保存失败，请稍后重试');
      }
      console.error('添加交易记录失败:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // 点击撤销按钮
  const handleReverseClick = (transactionId) => {
    if (!canWrite) return; // viewer 不可撤销
    setReversingTransactionId(transactionId);
    setReversalError('');
  };

  // 取消撤销操作
  const handleCancelReverse = () => {
    setReversingTransactionId(null);
    setReversalError('');
  };

  // 确认撤销交易记录
  const handleConfirmReverse = async () => {
    if (!canWrite || isReversing) return; // viewer 不可撤销，防重复点击
    if (!reversingTransactionId) return;

    setIsReversing(true);
    setReversalError('');

    try {
      // 调用撤销函数（异步）
      await transactionService.reverseTransaction(reversingTransactionId, '当前用户');

      // 刷新交易记录列表
      const updatedTransactions = await transactionService.getTransactions();
      setTransactionRecords(updatedTransactions);
      // 刷新产品列表（其他页面会用到）
      const updatedProducts = await productService.getAllProducts();
      setProducts(updatedProducts);

      // 关闭确认对话框并显示成功提示
      setReversingTransactionId(null);
      setActionMessage({ type: 'success', text: '交易已撤销' });
      setTimeout(() => setActionMessage(null), 3000);
    } catch (error) {
      const errMsg = error.message || '';
      setReversalError(errMsg || '撤销交易记录失败');
      setActionMessage({ type: 'error', text: '撤销失败，请稍后重试' });
      console.error('撤销交易记录失败:', error);
    } finally {
      setIsReversing(false);
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

  return (
    <div className="p-4 md:p-6">
      {/* 页面标题区 */}
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-800">出入库记录</h1>
        <p className="text-slate-600 mt-1 text-sm md:text-base">
          记录产品入库、出库及撤销情况，用于库存变化追溯与日常核对。
        </p>
      </div>

      {/* 操作栏：新增和导出按钮 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* 左侧：新增记录按钮 */}
          <button
            onClick={handleOpenModal}
            disabled={!canWrite}
            title={!canWrite ? adminOnlyTitle : ''}
            className={`px-4 py-2 rounded-md transition-colors font-medium ${
              !canWrite
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-slate-700 text-white hover:bg-slate-800'
            }`}
          >
            + 新增记录
          </button>

          {/* 右侧：导出当前筛选结果按钮 */}
          <button
            onClick={handleExport}
            disabled={!canWrite || filteredRecords.length === 0}
            title={!canWrite ? adminOnlyTitle : ''}
            className={`px-4 py-2 border rounded-md transition-colors font-medium ${
              !canWrite || filteredRecords.length === 0
                ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            导出 CSV
          </button>
        </div>
      </div>

      {/* 筛选区域 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 关键字搜索 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                关键字搜索
              </label>
              <input
                type="text"
                placeholder="产品货号/SKU、产品名称、操作人..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
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
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
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
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
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
                  className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors w-full"
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
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
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
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
              />
            </div>

            {/* 占位列，保持布局平衡 */}
            <div></div>
          </div>
        </div>
      </div>

      {/* 操作反馈提示（成功/失败） */}
      {actionMessage && (
        <div className={`mb-6 p-3 rounded-md border transition-opacity ${
          actionMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center">
            {actionMessage.type === 'success' ? (
              <svg className="w-4 h-4 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            )}
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
        </div>
      )}

      {/* 记录表格和卡片 */}
      <div className="bg-white border border-slate-200 rounded-lg">
        {loadingTransactions ? (
          // 加载状态
          <div className="py-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700"></div>
            </div>
            <div className="text-slate-600">正在加载交易记录...</div>
          </div>
        ) : errorTransactions ? (
          // 错误状态
          <div className="py-12 text-center">
            <div className="text-slate-600 mb-2">{errorTransactions}</div>
            <div className="text-sm text-slate-500 max-w-md mx-auto">
              将显示降级数据或空列表，页面功能可能受限。
            </div>
          </div>
        ) : transactionRecords.length === 0 ? (
          // 系统暂无记录
          <div className="py-12 text-center">
            <div className="text-slate-500 mb-2">暂无数据</div>
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
                className="mt-6 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors"
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
                            <button
                              onClick={() => handleShowDetail(record)}
                              className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                            >
                              详情
                            </button>
                            {record.status === 'completed' ? (
                              <button
                                onClick={() => handleReverseClick(record.id)}
                                disabled={!canWrite}
                                title={!canWrite ? adminOnlyTitle : '撤销此交易记录并回滚库存'}
                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                  !canWrite
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-slate-50 text-rose-600 border border-rose-200 hover:bg-rose-50'
                                }`}
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
                    <button
                      onClick={() => handleShowDetail(record)}
                      className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors flex-1"
                    >
                      详情
                    </button>
                    {record.status === 'completed' ? (
                      <button
                        onClick={() => handleReverseClick(record.id)}
                        disabled={!canWrite}
                        title={!canWrite ? adminOnlyTitle : '撤销此交易记录并回滚库存'}
                        className={`px-3 py-1.5 text-sm rounded transition-colors flex-1 ${
                          !canWrite
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 text-rose-600 border border-rose-200 hover:bg-rose-50'
                        }`}
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
            <div className="px-4 py-3 md:px-6 md:py-4 border-t border-slate-200 flex flex-col md:flex-row items-center md:items-center justify-center md:justify-between gap-4 md:gap-0">
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
          出入库记录用于库存变化追溯。已撤销记录仅用于历史参考，不再参与有效库存变动。撤销操作会按原交易方向回滚库存，请确认记录无误后再操作。
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

                {/* 产品搜索选择器 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    产品 *
                  </label>
                  {/* 搜索输入框 */}
                  <div className="relative">
                    <input
                      ref={productSearchRef}
                      type="text"
                      value={selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku || ''})` : productSearchTerm}
                      onChange={handleProductSearchChange}
                      onKeyDown={handleProductSearchKeyDown}
                      onFocus={() => {
                        if (productSearchTerm.trim()) {
                          setShowProductDropdown(true);
                        }
                      }}
                      onBlur={handleProductSearchBlur}
                      placeholder="输入货号 / SKU / 产品名称 / 品牌"
                      className="w-full px-4 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white pr-8"
                      disabled={isSaving}
                    />
                    {/* 清除按钮 */}
                    {selectedProduct && !isSaving && (
                      <button
                        type="button"
                        onClick={handleClearSelectedProduct}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title="清除已选产品"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}

                    {/* 搜索结果下拉列表 */}
                    {showProductDropdown && productSearchTerm.trim() && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
                        {productSearchResults.length > 0 ? (
                          productSearchResults.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault(); // 阻止 blur 先触发，确保选中稳定
                                handleSelectProduct(product);
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-medium text-slate-800">
                                    {product.name}
                                    <span className="text-xs text-slate-500 ml-1.5">({product.sku || '-'})</span>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    当前库存：{product.currentStock} {product.unit}
                                    {product.location ? `｜库位：${product.location}` : ''}
                                    {product.category ? `｜${product.category}` : ''}
                                  </div>
                                </div>
                                <span className={`shrink-0 ml-3 px-1.5 py-0.5 rounded text-xs font-medium ${
                                  (product.status === '低库存' || product.currentStock <= product.minStock)
                                    ? 'bg-amber-50 text-amber-600'
                                    : 'bg-slate-50 text-slate-500'
                                }`}>
                                  {product.currentStock <= product.minStock ? '低库存' : '正常'}
                                </span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-3 text-sm text-slate-500 text-center">
                            未找到匹配产品
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 已选产品信息卡 */}
                  {selectedProduct && (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <div className="text-xs text-slate-500 mb-2">已选产品</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-slate-500">当前库存：</span>
                          <span className={`font-medium ${
                            selectedProduct.currentStock <= selectedProduct.minStock
                              ? 'text-amber-600'
                              : 'text-slate-800'
                          }`}>
                            {selectedProduct.currentStock} {selectedProduct.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">库存分类：</span>
                          <span className="font-medium text-slate-800">{selectedProduct.category || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">存储位置：</span>
                          <span className="font-medium text-slate-800">{selectedProduct.location || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">库存状态：</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            selectedProduct.currentStock <= selectedProduct.minStock
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-slate-50 text-slate-500'
                          }`}>
                            {selectedProduct.currentStock <= selectedProduct.minStock ? '低库存' : '正常'}
                          </span>
                        </div>
                      </div>
                      {/* Step 10-20E：出库操作库存不足即时提示 + 提交拦截 */}
                      {stockInsufficient && (
                        <div className="mt-2 pt-2 border-t border-slate-200">
                          <div className="p-3 bg-rose-50 border border-rose-200 rounded-md">
                            <div className="flex items-start">
                              <svg className="w-4 h-4 text-rose-500 mt-0.5 mr-1.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              <div>
                                <div className="text-sm font-medium text-rose-800 mb-0.5">库存不足，无法提交出库记录</div>
                                <div className="text-sm text-rose-700">
                                  当前库存 {selectedProduct.currentStock} {selectedProduct.unit}，无法满足出库数量 {formData.quantity} {selectedProduct.unit}。请调整数量或先完成入库。
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                  disabled={isSaving}
                  className={`px-4 py-2 border rounded-md transition-colors font-medium ${
                    isSaving
                      ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving || stockInsufficient}
                  title={stockInsufficient ? `当前库存不足，无法提交出库记录。当前库存: ${selectedProduct?.currentStock || 0} ${selectedProduct?.unit || ''}，出库数量: ${formData.quantity} ${selectedProduct?.unit || ''}。请调整数量或先完成入库。` : ''}
                  className={`px-4 py-2 rounded-md transition-colors font-medium ${
                    isSaving
                      ? 'bg-slate-400 text-white cursor-not-allowed'
                      : 'bg-slate-700 text-white hover:bg-slate-800'
                  }`}
                >
                  {isSaving ? '保存中...' : '添加记录'}
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
                <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-md">
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
                {/* Step 10-20E：显示具体交易信息 */}
                {(() => {
                  const reversingTx = transactionRecords.find(t => t.id === reversingTransactionId);
                  if (!reversingTx) {
                    return <p className="text-sm text-rose-600 font-medium mb-3">无法找到该交易记录，请刷新后重试。</p>;
                  }
                  return (
                    <>
                      <p className="font-medium text-slate-800 mb-3">您确定要撤销以下交易记录吗？</p>
                      <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-4">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">产品名称</span>
                            <span className="font-medium text-slate-800">{reversingTx.productName}</span>
                          </div>
                          {reversingTx.sku && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">SKU</span>
                              <span className="font-medium text-slate-800">{reversingTx.sku}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-500">操作类型</span>
                            <TypeBadge type={reversingTx.type} />
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">数量</span>
                            <span className="font-medium text-slate-800">{reversingTx.quantity} {reversingTx.unit}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">操作日期</span>
                            <span className="font-medium text-slate-800">{reversingTx.date || reversingTx.createdAt || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">操作人</span>
                            <span className="font-medium text-slate-800">{reversingTx.operator || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">当前状态</span>
                            <StatusBadge status={reversingTx.status} />
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-4">
                        <div className="text-sm font-medium text-slate-700 mb-2">此操作将执行以下业务规则：</div>
                        <ul className="text-sm space-y-2">
                          <li className="flex items-start">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 mr-2"></span>
                            <span><span className="font-medium">库存回滚：</span>撤销后将自动回滚库存，{reversingTx.type === '入库' ? '减少' : '增加'} {reversingTx.quantity} {reversingTx.unit}</span>
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
                    </>
                  );
                })()}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelReverse}
                  disabled={isReversing}
                  className={`px-4 py-2 border rounded-md transition-colors font-medium ${
                    isReversing
                      ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReverse}
                  disabled={isReversing}
                  className={`px-4 py-2 rounded-md transition-colors font-medium ${
                    isReversing
                      ? 'bg-rose-300 text-white cursor-not-allowed'
                      : 'bg-slate-50 text-rose-600 border border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  {isReversing ? '撤销中...' : '确认撤销'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 交易详情弹窗（只读，admin 和 viewer 均可查看） */}
      {detailRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800">交易详情</h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">交易编号</div>
                  <div className="text-sm font-medium text-slate-800">{detailRecord.id || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">时间</div>
                  <div className="text-sm font-medium text-slate-800">{detailRecord.date || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">产品名称</div>
                  <div className="text-sm font-medium text-slate-800">{detailRecord.productName || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">交易类型</div>
                  <div>
                    <TypeBadge type={detailRecord.type} />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">数量</div>
                  <div className="text-sm font-medium text-slate-800">
                    {detailRecord.quantity} {detailRecord.unit || ''}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">操作人</div>
                  <div className="text-sm font-medium text-slate-800">{detailRecord.operator || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">状态</div>
                  <div>
                    <StatusBadge status={detailRecord.status} />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">备注</div>
                <div className="text-sm text-slate-800 bg-slate-50 rounded-md p-3 border border-slate-200">
                  {detailRecord.notes || '无'}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={handleCloseDetail}
                className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Transactions;